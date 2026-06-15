import type { Express } from "express";
import { z } from "zod";
import { snapshot } from "./state.js";
import { loadSettings, getProviderApiKey } from "./settings-store.js";
import { getEnv } from "./server-utils.js";
import { currentSettings } from "./state.js";
import { saveSettings, loadSettings, getProviderApiKey } from "./settings-store.js";
import { homedir } from "node:os";
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";

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


async function runProcess(command: string, args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
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

async function fetchProviderModels(provider: { baseUrl?: string; models?: string[]; apiMode?: string; apiKeyConfigured?: boolean }, apiKey?: string, timeoutMs = 10000): Promise<{ ok: boolean; models: string[]; message?: string }> {
  if (provider.models && provider.models.length > 0 && !provider.baseUrl) {
    return { ok: true, models: provider.models };
  }
  const baseUrl = provider.baseUrl?.replace(/\/+$/, "");
  if (!baseUrl) return { ok: false, models: [], message: "Provider has no base URL" };

  try {
    const endpoints: string[] = [];
    const mode = provider.apiMode || "chat_completions";
    if (mode === "embeddings") endpoints.push(`${baseUrl}/embeddings`);
    else {
      endpoints.push(`${baseUrl}/models`);
      endpoints.push(`${baseUrl}/v1/models`);
    }
    for (const url of endpoints) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const response = await fetch(url, { headers: buildProviderModelHeaders(apiKey), signal: controller.signal });
        clearTimeout(timer);
        if (response.ok) {
          const body = await response.json();
          const models = extractModelNames(body) as string[];
          if (models.length > 0) return { ok: true, models };
        }
      } catch {}
    }
    return { ok: false, models: [], message: "Could not fetch models from provider endpoint" };
  } catch (error) {
    return { ok: false, models: [], message: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function testProviderConnection(provider: { baseUrl?: string; apiKeyConfigured?: boolean }, apiKey?: string, timeoutMs = 8000): Promise<{ ok: boolean; message?: string }> {
  const baseUrl = provider.baseUrl?.replace(/\/+$/, "");
  if (!baseUrl) return { ok: false, message: "Provider has no base URL" };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(baseUrl, { method: "HEAD", signal: controller.signal });
    clearTimeout(timer);
    return { ok: response.ok, message: response.ok ? "Connection successful" : `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Connection failed" };
  }
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
