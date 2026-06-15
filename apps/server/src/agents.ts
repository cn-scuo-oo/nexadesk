import type { Express } from "express";
import { snapshot, syncSessionAgents, persistRuntimeState } from "./state.js";
import { loadSettings, saveSettings } from "./settings-store.js";
import { publishActivity } from "./events.js";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import type { AgentEngineDetectionRecord } from "@nexadesk/shared";

async function readCommandVersion(command: string): Promise<string | undefined> {
  try {
    const result = await runProcess(command, ["--version"], 3000);
    return result.code === 0 ? result.stdout.trim().split("\n")[0] : undefined;
  } catch {
    return undefined;
  }
}

async function findAgentEngineConfigPath(engineId: string): Promise<string | undefined> {
  const home = homedir();
  const paths: Record<string, string[]> = {
    codex_cli: [`${home}/.codex/config.json`],
    claude_code: [`${home}/.claude/settings.json`],
    openclaw: [`${home}/.openclaw/config.yaml`],
    hermes: [`${home}/.hermes/config.json`],
    opencode: [`${home}/.opencode/config.json`],
    qwen_code: [`${home}/.qwen/config.json`],
    deepseek_tui: [`${home}/.deepseek/config.json`]
  };
  const candidates = paths[engineId] ?? [];
  for (const p of candidates) {
    try {
      await access(p);
      return p;
    } catch {}
  }
  return undefined;
}

export function registerAgentsRoutes(app: Express): void {
  app.get("/api/agents", (_req, res) => { res.json(snapshot.agents); });
app.post("/api/agent-engines/detect", async (_req, res, next) => {
  try {
    const settings = await loadSettings(snapshot.providers);
    const checkedAt = new Date().toISOString();
    const detections = await Promise.all(
      settings.assistant.engines.map((engine) => detectAgentEngine(engine, checkedAt))
    );
    const detectionsById = new Map(detections.map((detection) => [detection.engineId, detection]));
    const nextEngines = settings.assistant.engines.map((engine) => {
      const detection = detectionsById.get(engine.id);
      if (!detection) {
        return engine;
      }
      return {
        ...engine,
        installed: detection.installed,
        command: detection.command ?? engine.command,
        configPath: detection.configPath ?? engine.configPath,
        setupStatus: detection.setupStatus
      };
    });
    const saved = await saveSettings(
      {
        ...settings,
        assistant: {
          ...settings.assistant,
          engines: nextEngines
        }
      },
      snapshot.providers
    );
    snapshot.providers = saved.providers;
    snapshot.agents = saved.assistant.agents;
    snapshot.skills = saved.assistant.skills;
    syncSessionAgents();
    const activity = publishActivity({
      level: "info",
      title: "Agent engines detected",
      detail: `${detections.filter((detection) => detection.installed).length}/${detections.length} Agent engine(s) detected locally.`
    });
    snapshot.activity.unshift(activity);
    await persistRuntimeState();
    res.json({ engines: saved.assistant.engines, detections, checkedAt });
  } catch (error) {
    next(error);
  }
});
}
const agentEngineCommandAliases: Record<AgentEngineId, string[]> = {
  nexadesk_builtin: [],
  codex_cli: ["codex"],
  claude_code: ["claude"],
  openclaw: ["openclaw"],
  hermes: ["hermes"],
  opencode: ["opencode"],
  qwen_code: ["qwen", "qwen-code"],
  deepseek_tui: ["deepseek", "deepseek-tui"]
};

async function detectAgentEngine(engine: AgentEngineSettings, checkedAt: string): Promise<AgentEngineDetectionRecord> {
  if (engine.kind === "builtin") {
    return {
      engineId: engine.id,
      installed: true,
      setupStatus: "ready",
      message: "NexaDesk built-in runtime is always available.",
      checkedAt
    };
  }

  const commands = uniqueStrings([engine.command, ...(agentEngineCommandAliases[engine.id] ?? [])]);
  for (const command of commands) {
    const resolved = await resolveCommandCandidate(command);
    if (!resolved) {
      continue;
    }
    const version = await readCommandVersion(resolved.resolvedPath || command);
    const configPath = await findAgentEngineConfigPath(engine);
    return {
      engineId: engine.id,
      installed: true,
      command,
      resolvedPath: resolved.resolvedPath,
      version,
      configPath,
      setupStatus: "ready",
      message: `${engine.name} was detected${version ? ` (${version})` : ""}.`,
      checkedAt
    };
  }

  const configPath = await findAgentEngineConfigPath(engine);
  return {
    engineId: engine.id,
    installed: false,
    configPath,
    setupStatus: configPath ? "needs_setup" : "not_installed",
    message: configPath
      ? `${engine.name} config was found, but no CLI command was found in PATH.`
      : `${engine.name} was not found in PATH.`,
    checkedAt
  };
}

function uniqueStrings(values: Array<string | undefined>) {
  const seen = new Set<string>();
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function hasPathSegment(value: string): boolean {
  return value.includes("/") || value.includes("\\");
}

function runProcess(command: string, args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { timeout: timeoutMs, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("close", (code) => { resolve({ code: code ?? 1, stdout, stderr }); });
    child.on("error", () => { resolve({ code: 1, stdout, stderr }); });
  });
}

async function resolveCommandCandidate(command: string): Promise<{ resolvedPath?: string } | null> {
  if (hasPathSegment(command)) {
    try {
      await access(command);
      return { resolvedPath: command };
    } catch {
      return null;
    }
  }

  const lookup = process.platform === "win32" ? "where.exe" : "which";
  const result = await runProcess(lookup, [command], 2500);
  if (result.code !== 0) {
    return { installed: false, message: `${command} not found in PATH` };
  }
  return { installed: true, message: `${command} found`, resolvedPath: result.stdout.trim() };
}

function collectModelNames(models: string[] | undefined, names: Set<string>) {
  if (!models) return;
  for (const model of models) addModelName(names, model);
}

function addModelName(names: Set<string>, value: string) {
  const name = value.trim();
  if (name) names.add(name);
}