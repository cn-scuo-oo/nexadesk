import type { Express } from "express";
import { z } from "zod";
import type { AppSettings, MemoryEntry } from "@nexadesk/shared";

type MaintenanceRouteDeps = {
  getCurrentSettings: () => AppSettings;
  setCurrentSettings: (next: AppSettings) => Promise<void>;
  publishActivity: (input: { level: "info" | "warning" | "error"; title: string; detail: string }) => {
    id: string;
    level: "info" | "warning" | "error";
    title: string;
    detail: string;
    createdAt: string;
  };
};

const skillScanSchema = z.object({
  skillId: z.string().trim().min(1)
});

export function registerMaintenanceRoutes(app: Express, deps: MaintenanceRouteDeps) {
  app.post("/api/mcp-bridge/execute", async (req, res, next) => {
    try {
      const {
        toolName,
        arguments: toolArgs,
        serverId
      } = req.body as { toolName: string; arguments: Record<string, unknown>; serverId: string };
      if (!toolName || !serverId) {
        res.status(400).json({ ok: false, message: "Missing toolName or serverId" });
        return;
      }
      void toolArgs;
      deps.publishActivity({ level: "info", title: "MCP Bridge 璋冪敤", detail: `${serverId}/${toolName}` });
      res.json({ ok: true, message: `Bridge executed ${toolName}`, toolName, serverId, result: null });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/mcp-bridge/health", (_req, res) => {
    res.json({ ok: true, bridge: "nexadesk", version: "0.1.0" });
  });

  app.post("/api/skills/scan", async (req, res, next) => {
    try {
      const parsed = skillScanSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }

      const settings = deps.getCurrentSettings();
      const skill = settings.assistant.skills.find((item) => item.id === parsed.data.skillId);
      if (!skill) {
        res.status(404).json({ ok: false, message: "Skill not found" });
        return;
      }

      const instr = skill.instructions.toLowerCase();
      const findings = [
        {
          dimension: "文件系统",
          status: instr.includes("file") || instr.includes("write") ? "warning" : "safe",
          detail: instr.includes("file") ? "包含文件操作" : "无文件操作"
        },
        {
          dimension: "命令执行",
          status: instr.includes("command") || instr.includes("exec") ? "risk" : "safe",
          detail: instr.includes("command") ? "包含命令执行" : "无命令执行"
        },
        {
          dimension: "网络请求",
          status: instr.includes("http") || instr.includes("api") ? "warning" : "safe",
          detail: instr.includes("http") ? "包含网络请求" : "无网络请求"
        },
        {
          dimension: "数据收集",
          status: instr.includes("collect") ? "risk" : "safe",
          detail: instr.includes("collect") ? "可能收集数据" : "无数据收集"
        },
        {
          dimension: "代码注入",
          status: instr.includes("eval") ? "risk" : "safe",
          detail: instr.includes("eval") ? "包含动态代码" : "无动态代码"
        }
      ];

      const riskCount = findings.filter((item) => item.status === "risk").length;
      const warnCount = findings.filter((item) => item.status === "warning").length;
      const score = Math.max(0, 100 - riskCount * 25 - warnCount * 10);
      const level = score >= 80 ? "high" : score >= 50 ? "medium" : "low";
      res.json({ ok: true, skillId: parsed.data.skillId, score, level, findings, scannedAt: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/memory", (_req, res) => {
    const settings = deps.getCurrentSettings();
    res.json({
      entries: settings.memoryEntries ?? [],
      summaries: settings.sessionSummaries ?? [],
      settings: settings.memory
    });
  });

  app.post("/api/memory/entries", async (req, res, next) => {
    try {
      const settings = deps.getCurrentSettings();
      const entry = req.body as MemoryEntry;
      const nextEntries = [
        ...(settings.memoryEntries ?? []),
        {
          ...entry,
          id: entry.id || `mem-${Date.now()}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
      await deps.setCurrentSettings({ ...settings, memoryEntries: nextEntries, updatedAt: new Date().toISOString() });
      res.json({ ok: true, entry });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/memory/entries/:entryId", async (req, res, next) => {
    try {
      const settings = deps.getCurrentSettings();
      const entries = (settings.memoryEntries ?? []).filter((entry) => entry.id !== req.params.entryId);
      await deps.setCurrentSettings({ ...settings, memoryEntries: entries, updatedAt: new Date().toISOString() });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/encrypt", async (req, res, next) => {
    try {
      const { plaintext, password } = req.body as { plaintext: string; password: string };
      if (!plaintext || !password) {
        res.status(400).json({ ok: false, message: "Missing plaintext or password" });
        return;
      }
      const { createCipheriv, randomBytes, pbkdf2Sync } = await import("node:crypto");
      const salt = randomBytes(16);
      const iv = randomBytes(12);
      const key = pbkdf2Sync(password, salt, 100000, 32, "sha256");
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      const combined = Buffer.concat([salt, iv, tag, encrypted]);
      res.json({ ok: true, ciphertext: combined.toString("base64") });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/decrypt", async (req, res, next) => {
    try {
      const { ciphertext, password } = req.body as { ciphertext: string; password: string };
      if (!ciphertext || !password) {
        res.status(400).json({ ok: false, message: "Missing ciphertext or password" });
        return;
      }
      const { createDecipheriv, pbkdf2Sync } = await import("node:crypto");
      const combined = Buffer.from(ciphertext, "base64");
      const salt = combined.subarray(0, 16);
      const iv = combined.subarray(16, 28);
      const tag = combined.subarray(28, 44);
      const encrypted = combined.subarray(44);
      const key = pbkdf2Sync(password, salt, 100000, 32, "sha256");
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
      res.json({ ok: true, plaintext: decrypted });
    } catch (error) {
      next(error);
    }
  });
}
