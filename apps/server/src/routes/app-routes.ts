import type { Express } from "express";
import { z } from "zod";
import type { AppSettings, AppSnapshot, DesktopStatus, ModelProvider, RuntimeTelemetryEntry } from "@nexadesk/shared";
import { applySettingsToSnapshot, refreshDerivedSnapshot } from "../services/snapshot-service.js";

type AppRouteDeps = {
  snapshot: AppSnapshot;
  runtimeTelemetry: RuntimeTelemetryEntry[];
  loadSettings: (providers: ModelProvider[]) => Promise<AppSettings>;
  persistRuntimeState: () => Promise<void>;
  addEventClient: (res: import("express").Response) => void;
  createDesktopStatus: () => DesktopStatus;
};

const runtimeTelemetryEntrySchema = z.object({
  id: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  providerName: z.string(),
  model: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  firstTokenMs: z.number().optional(),
  durationMs: z.number().optional(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
  status: z.enum(["running", "completed", "failed"]),
  error: z.string().optional(),
  messagePreview: z.string().optional()
});

const runtimeTelemetrySchema = z.object({
  entries: z.array(runtimeTelemetryEntrySchema)
});

export function registerAppRoutes(app: Express, deps: AppRouteDeps) {
  app.get("/health", (_req, res) => {
    res.json({ ok: true, name: "nexadesk-server", time: new Date().toISOString() });
  });

  app.get("/api/snapshot", async (_req, res, next) => {
    try {
      const settings = await deps.loadSettings(deps.snapshot.providers);
      applySettingsToSnapshot(deps.snapshot, settings);
      res.json(deps.snapshot);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/providers", async (_req, res, next) => {
    try {
      const settings = await deps.loadSettings(deps.snapshot.providers);
      deps.snapshot.providers = settings.providers;
      res.json(settings.providers);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/agents", (_req, res) => {
    res.json(deps.snapshot.agents);
  });

  app.get("/api/skills", async (_req, res, next) => {
    try {
      const settings = await deps.loadSettings(deps.snapshot.providers);
      deps.snapshot.skills = settings.assistant.skills;
      refreshDerivedSnapshot(deps.snapshot);
      res.json(settings.assistant.skills);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/events", (req, res) => {
    req.socket.setTimeout(0);
    res.writeHead(200, {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream"
    });
    deps.addEventClient(res);
  });

  app.get("/api/runtime/telemetry", (_req, res) => {
    res.json({ entries: deps.runtimeTelemetry });
  });

  app.put("/api/runtime/telemetry", async (req, res, next) => {
    try {
      const parsed = runtimeTelemetrySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const merged = new Map(deps.runtimeTelemetry.map((entry) => [entry.id, entry]));
      for (const entry of parsed.data.entries) {
        merged.set(entry.id, { ...merged.get(entry.id), ...entry });
      }
      const nextTelemetry = Array.from(merged.values())
        .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime())
        .slice(0, 100);
      deps.runtimeTelemetry.splice(0, deps.runtimeTelemetry.length, ...nextTelemetry);
      await deps.persistRuntimeState();
      res.json({ entries: deps.runtimeTelemetry });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/settings", async (_req, res, next) => {
    try {
      res.json(await deps.loadSettings(deps.snapshot.providers));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/desktop/status", (_req, res) => {
    res.json(deps.createDesktopStatus());
  });
}
