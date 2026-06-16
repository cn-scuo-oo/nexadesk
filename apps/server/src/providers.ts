// @ts-nocheck
import type { Express } from "express";
import { snapshot, currentSettings } from "./state.js";
import { loadSettings, saveSettings, getProviderApiKey } from "./settings-store.js";
import { getEnv } from "./server-utils.js";

interface ProviderTestRequest { provider: { id: string; name?: string; baseUrl?: string; models?: string[]; apiKeyConfigured?: boolean; apiMode?: string; kind?: string }; apiKey?: string; timeoutMs?: number }
interface ProviderModelsRequest { provider: { id: string; baseUrl?: string; models?: string[]; apiKeyConfigured?: boolean; apiMode?: string }; apiKey?: string; timeoutMs?: number }

function buildProviderModelHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = "Bearer " + apiKey;
  return headers;
}

function extractModelNames(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.data)) return obj.data.map((m: any) => m.id).filter(Boolean);
  if (Array.isArray(obj.models)) return obj.models.map((m: any) => (typeof m === "string" ? m : m.name)).filter(Boolean);
  return [];
}

function withCheckedAt(result: any) { return { ...result, checkedAt: result.checkedAt ?? new Date().toISOString() }; }

async function persistProviderStatus(providerId: string, update: any): Promise<void> {
  if (!currentSettings.providerStatus) currentSettings.providerStatus = { tests: {}, modelRefreshes: {} };
  if (update.test) {
    if (!currentSettings.providerStatus.tests) currentSettings.providerStatus.tests = {};
    currentSettings.providerStatus.tests[providerId] = update.test;
  }
  if (update.modelRefresh) {
    if (!currentSettings.providerStatus.modelRefreshes) currentSettings.providerStatus.modelRefreshes = {};
    currentSettings.providerStatus.modelRefreshes[providerId] = update.modelRefresh;
  }
  await saveSettings(currentSettings);
}

export function registerProvidersRoutes(app: Express): void {
  app.get("/api/providers", async (_req, res, next) => {
    try {
      const settings = await loadSettings(snapshot.providers);
      snapshot.providers = settings.providers;
      res.json(settings.providers);
    } catch (error) { next(error); }
  });

  app.post("/api/providers/test", async (req, res, next) => {
    try {
      const body = req.body as ProviderTestRequest;
      if (!body?.provider?.id) { res.status(400).json({ ok: false, message: "Invalid provider payload" }); return; }
      const storedKey = await getProviderApiKey(body.provider.id);
      const baseUrl = body.provider.baseUrl?.replace(/\/+$/, "");
      let testResult;
      if (!baseUrl) testResult = { ok: false, message: "Provider has no base URL" };
      else {
        // Try multiple endpoints to test connectivity
        const testUrls = [baseUrl + "/models", baseUrl + "/v1/models", baseUrl];
        let connected = false;
        for (const url of testUrls) {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), body.timeoutMs ?? 8000);
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);
            testResult = { ok: true, message: "Connection successful to " + url };
            connected = true;
            break;
          } catch {}
        }
        if (!connected) {
          // Even if no endpoint responded, if we can connect to the server, it's "reachable"
          try {
            const net = await import("node:net");
            const reachable = await new Promise((resolve) => {
              const socket = net.default.createConnection({ host: new URL(baseUrl).hostname, port: parseInt(new URL(baseUrl).port) }, () => {
                socket.destroy();
                resolve(true);
              });
              socket.on("error", () => resolve(false));
              setTimeout(() => { socket.destroy(); resolve(false); }, 2000);
            });
            testResult = reachable ? { ok: true, message: "Server reachable at " + baseUrl } : { ok: false, message: "Could not connect to provider" };
          } catch {
            testResult = { ok: false, message: "Could not connect to provider" };
          }
        }
      }
      const result = withCheckedAt(testResult);
      await persistProviderStatus(body.provider.id, { test: result });
      res.json(result);
    } catch (error) { next(error); }
  });

  app.post("/api/providers/models", async (req, res, next) => {
    try {
      const body = req.body as ProviderModelsRequest;
      if (!body?.provider?.id) { res.status(400).json({ ok: false, message: "Invalid provider payload", models: [] }); return; }
      const storedKey = await getProviderApiKey(body.provider.id);
      const provider = body.provider;
      const apiKey = body.apiKey?.trim() || storedKey;
      const timeoutMs = body.timeoutMs ?? 10000;
      let modelResult;
      if (provider.models && provider.models.length > 0) {
        modelResult = { ok: true, models: provider.models };
      } else {
        const baseUrl = provider.baseUrl?.replace(/\/+$/, "");
        if (!baseUrl) modelResult = { ok: false, models: [], message: "Provider has no base URL" };
        else {
          modelResult = { ok: false, models: [] };
          const endpoints = (provider.apiMode === "embeddings") ? [baseUrl + "/embeddings"] : [baseUrl + "/models", baseUrl + "/v1/models"];
          for (const url of endpoints) {
            try {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), timeoutMs);
              const response = await fetch(url, { headers: buildProviderModelHeaders(apiKey), signal: controller.signal });
              clearTimeout(timer);
              if (response.ok) {
                const data = await response.json();
                const models = extractModelNames(data);
                if (models.length > 0) { modelResult = { ok: true, models: models }; break; }
              }
            } catch {}
          }
          if (!modelResult.ok) modelResult.message = "Could not fetch models from provider";
        }
      }
      const result = withCheckedAt(modelResult);
      await persistProviderStatus(body.provider.id, { modelRefresh: result });
      res.json(result);
    } catch (error) { next(error); }
  });
}
