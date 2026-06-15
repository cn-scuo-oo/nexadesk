import type { Express } from "express";
import { z } from "zod";
import { snapshot } from "./state.js";
import { loadSettings, getProviderApiKey } from "./settings-store.js";
import { getEnv } from "./server-utils.js";

function buildProviderModelHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  return headers;
}

function extractModelNames(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.data)) {
    return obj.data.map((m: any) => m.id).filter(Boolean);
  }
  if (Array.isArray(obj.models)) {
    return obj.models.map((m: any) => (typeof m === "string" ? m : m.name)).filter(Boolean);
  }
  return [];
}

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

// ── Server-side helpers (restored) ──
let currentSettings: AppSettings = createDefaultSettings(snapshot.providers);

async function saveCurrentSettings(): Promise<void> {
  await saveSettings(currentSettings);
}

function withCheckedAt<T extends { checkedAt?: string }>(result: T): T {
  return { ...result, checkedAt: result.checkedAt ?? new Date().toISOString() };
}

async function persistProviderStatus(
  providerId: string,
  update: { test?: any; modelRefresh?: any }
): Promise<void> {
  if (!currentSettings.providerStatus) {
    currentSettings.providerStatus = { tests: {}, modelRefreshes: {} } as any;
  }
  if (update.test) {
    if (!currentSettings.providerStatus.tests) {
      (currentSettings.providerStatus as any).tests = {};
    }
    (currentSettings.providerStatus as any).tests[providerId] = update.test;
  }
  if (update.modelRefresh) {
    if (!(currentSettings.providerStatus as any).modelRefreshes) {
      (currentSettings.providerStatus as any).modelRefreshes = {};
    }
    (currentSettings.providerStatus as any).modelRefreshes[providerId] = update.modelRefresh;
  }
  await saveSettings(currentSettings);
}

export function registerProvidersRoutes(app: Express): void {
app.get("/api/providers", async (_req, res, next) => {
  try {
    const settings = await loadSettings(snapshot.providers);
    snapshot.providers = settings.providers;
    res.json(settings.providers);
  } catch (error) {
    next(error);
  }
});

app.post("/api/providers/test", async (req, res, next) => {
  try {
    const body = req.body as ProviderTestRequest;
    if (!body?.provider?.id) {
      res.status(400).json({ ok: false, message: "Invalid provider payload" });
      return;
    }

    const storedKey = await getProviderApiKey(body.provider.id);
    const result = withCheckedAt(
      await testProviderConnection(body.provider, body.apiKey?.trim() || storedKey, body.timeoutMs ?? 8000)
    );
    await persistProviderStatus(body.provider.id, { test: result });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/providers/models", async (req, res, next) => {
  try {
    const body = req.body as ProviderModelsRequest;
    if (!body?.provider?.id) {
      res.status(400).json({ ok: false, message: "Invalid provider payload", models: [] });
      return;
    }

    const storedKey = await getProviderApiKey(body.provider.id);
    const result = withCheckedAt(
      await fetchProviderModels(body.provider, body.apiKey?.trim() || storedKey, body.timeoutMs ?? 10000)
    );
    await persistProviderStatus(body.provider.id, { modelRefresh: result });
    res.json(result);
  } catch (error) {
    next(error);
  }
});
}