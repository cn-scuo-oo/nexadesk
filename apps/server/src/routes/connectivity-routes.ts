import type { Express } from "express";
import { z } from "zod";
import type {
  AppSettings,
  AppSnapshot,
  ModelProvider,
  ProviderModelsRequest,
  ProviderModelsStatusRecord,
  ProviderStatusRecord,
  ProviderTestRequest,
  RecoverSettingsRequest,
  SaveSettingsRequest,
  McpServerToolsRequest,
  McpServerTestRequest
} from "@nexadesk/shared";
import {
  detectAgentEngine,
  discoverMcpTools,
  fetchProviderModels,
  testMcpServer,
  testProviderConnection
} from "../services/connectivity-service.js";

type ConnectivityRouteDeps = {
  snapshot: AppSnapshot;
  loadSettings: (providers: ModelProvider[]) => Promise<AppSettings>;
  saveSettings: (
    settings: AppSettings,
    providers: ModelProvider[],
    providerSecrets?: Array<{ providerId: string; apiKey?: string; clearApiKey?: boolean }>
  ) => Promise<AppSettings>;
  recoverSettings: (
    providers: ModelProvider[],
    options?: { resetSecrets?: boolean }
  ) => Promise<{
    settings: AppSettings;
    backupPaths: string[];
    resetSecrets: boolean;
    warning?: string;
  }>;
  getProviderApiKey: (providerId: string) => Promise<string | undefined>;
  persistRuntimeState: () => Promise<void>;
  publishActivity: (input: { level: "info" | "warning" | "error"; title: string; detail: string }) => {
    id: string;
    level: "info" | "warning" | "error";
    title: string;
    detail: string;
    createdAt: string;
  };
  syncSessionAgents: () => void;
};

const mcpTestSchema = z.object({
  server: z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    description: z.string().trim().optional().default(""),
    transport: z.enum(["stdio", "http"]),
    enabled: z.boolean(),
    command: z.string().trim().optional(),
    args: z.array(z.string()).optional(),
    url: z.string().trim().optional()
  }),
  timeoutMs: z.number().int().positive().max(15000).optional()
});

export function registerConnectivityRoutes(app: Express, deps: ConnectivityRouteDeps) {
  app.post("/api/agent-engines/detect", async (_req, res, next) => {
    try {
      const settings = await deps.loadSettings(deps.snapshot.providers);
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
      const saved = await deps.saveSettings(
        {
          ...settings,
          assistant: {
            ...settings.assistant,
            engines: nextEngines
          }
        },
        deps.snapshot.providers
      );
      deps.snapshot.providers = saved.providers;
      deps.snapshot.agents = saved.assistant.agents;
      deps.snapshot.skills = saved.assistant.skills;
      deps.syncSessionAgents();
      const activity = deps.publishActivity({
        level: "info",
        title: "Agent engines detected",
        detail: `${detections.filter((detection) => detection.installed).length}/${detections.length} Agent engine(s) detected locally.`
      });
      deps.snapshot.activity.unshift(activity);
      await deps.persistRuntimeState();
      res.json({ engines: saved.assistant.engines, detections, checkedAt });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/settings", async (req, res, next) => {
    try {
      const body = req.body as SaveSettingsRequest;
      if (!body?.settings || !Array.isArray(body.settings.providers)) {
        res.status(400).json({ error: "Invalid settings payload" });
        return;
      }

      const settings = await deps.saveSettings(body.settings, deps.snapshot.providers, body.providerSecrets);
      deps.snapshot.providers = settings.providers;
      deps.snapshot.agents = settings.assistant.agents;
      deps.snapshot.skills = settings.assistant.skills;
      deps.syncSessionAgents();
      const activity = deps.publishActivity({
        level: "info",
        title: "Settings saved",
        detail: "Model, interface, workspace, permission, and app settings were persisted locally."
      });
      deps.snapshot.activity.unshift(activity);
      await deps.persistRuntimeState();
      res.json({ settings, activity });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/settings/recover", async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as RecoverSettingsRequest;
      const result = await deps.recoverSettings(deps.snapshot.providers, { resetSecrets: Boolean(body.resetSecrets) });
      deps.snapshot.providers = result.settings.providers;
      deps.snapshot.agents = result.settings.assistant.agents;
      deps.snapshot.skills = result.settings.assistant.skills;
      deps.syncSessionAgents();
      const activity = deps.publishActivity({
        level: result.warning ? "warning" : "info",
        title: "设置已恢复",
        detail: result.warning ?? `已重建默认设置，备份文件 ${result.backupPaths.length} 个。`
      });
      deps.snapshot.activity.unshift(activity);
      await deps.persistRuntimeState();
      res.json({ ...result, activity });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/mcp/test", async (req, res, next) => {
    try {
      const parsed = mcpTestSchema.safeParse(req.body as McpServerTestRequest);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      res.json(await testMcpServer(parsed.data.server, parsed.data.timeoutMs ?? 5000));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/mcp/tools", async (req, res, next) => {
    try {
      const parsed = mcpTestSchema.safeParse(req.body as McpServerToolsRequest);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      res.json(await discoverMcpTools(parsed.data.server, parsed.data.timeoutMs ?? 8000));
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

      const storedKey = await deps.getProviderApiKey(body.provider.id);
      const result = withCheckedAt(
        await testProviderConnection(body.provider, body.apiKey?.trim() || storedKey, body.timeoutMs ?? 8000)
      );
      await persistProviderStatus(deps, body.provider.id, { test: result });
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

      const storedKey = await deps.getProviderApiKey(body.provider.id);
      const result = withCheckedAt(
        await fetchProviderModels(body.provider, body.apiKey?.trim() || storedKey, body.timeoutMs ?? 10000)
      );
      await persistProviderStatus(deps, body.provider.id, { modelRefresh: result });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}

function withCheckedAt<T extends { checkedAt?: string }>(result: T): T & { checkedAt: string } {
  return { ...result, checkedAt: result.checkedAt ?? new Date().toISOString() };
}

async function persistProviderStatus(
  deps: ConnectivityRouteDeps,
  providerId: string,
  patch: { test?: ProviderStatusRecord; modelRefresh?: ProviderModelsStatusRecord }
) {
  const settings = await deps.loadSettings(deps.snapshot.providers);
  const nextSettings: AppSettings = {
    ...settings,
    providerStatus: {
      ...settings.providerStatus,
      tests: {
        ...settings.providerStatus.tests,
        ...(patch.test ? { [providerId]: patch.test } : {})
      },
      modelRefreshes: {
        ...settings.providerStatus.modelRefreshes,
        ...(patch.modelRefresh ? { [providerId]: patch.modelRefresh } : {})
      }
    }
  };
  await deps.saveSettings(nextSettings, deps.snapshot.providers);
}
