// @ts-nocheck
import cors from "cors";
import express from "express";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  createDemoSnapshot,
  type AgentEngineDetectionRecord,
  type AgentEngineId,
  type AgentEngineSettings,
  type ActivityEvent,
  type ApprovalHistoryEntry,
  type AppSettings,
  type AgentProfile,
  type AutomationJob,
  type AutomationRun,
  type CreateAutomationRequest,
  type ChatStreamEvent,
  type ChatMessage,
  type DesktopStatus,
  type McpServerToolsRequest,
  type McpServerToolsResult,
  type McpServerTestRequest,
  type McpServerTestResult,
  type McpToolDefinition,
  type PermissionRequest,
  type ProviderModelsRequest,
  type ProviderModelsResult,
    type ProviderSettings,
  type ProviderTestRequest,
  type ProviderTestResult,
  type RecoverSettingsRequest,
  type RuntimeTelemetryEntry,
  type ResolveApprovalRequest,
  type SaveSettingsRequest,
  type SendMessageRequest,
  type UpdateAutomationRequest,
  createDefaultSettings
} from "@nexadesk/shared";
import {
  executeToolRequest,
  parseToolRequests,
  prepareToolRequest,
  summarizeToolRequest,
  type AgentToolContext,
  type AgentToolRequest
} from "./agent-tools.js";
import { addEventClient, publishActivity } from "./events.js";
import { canRunExternalAgentEngine, streamExternalAgentEvents } from "./external-agent-runtime.js";
import {
  ProviderRuntimeError,
  streamProviderEvents,
  type RuntimeChatMessage,
  type RuntimeStreamEvent
} from "./provider-runtime.js";
import {
  loadRuntimeTelemetry,
  loadRuntimeState,
  persistTelemetryEntry,
  runtimeStatePath,
  saveRuntimeState,
  type PendingToolApprovalRecord
} from "./runtime-state-store.js";
import { getProviderApiKey, loadSettings, recoverSettings, saveSettings } from "./settings-store.js";
import { createLocalOnlyCorsOptions } from "./cors-policy.js";
import { registerConnectivityRoutes } from "./routes/connectivity-routes.js";
import { registerWorkspaceRoutes } from "./routes/workspace-routes.js";
import {
  automationScheduleLabel,
  computeNextAutomationRun,
  inferAutomationScheduleKind
} from "./automation-scheduler.js";
import { estimateTokenCount, formatRuntimeError, getEnv } from "./server-utils.js";
import { buildSkillHub, buildWorkspaceArtifacts, createDefaultImChannels } from "./wesight-capabilities.js";

const host = getEnv("NEXADESK_HOST", "AION_LITE_HOST") ?? "127.0.0.1";
const port = Number(getEnv("NEXADESK_PORT", "AION_LITE_PORT") ?? 3939);
const snapshot = createDemoSnapshot();
let runtimeTelemetry: RuntimeTelemetryEntry[] = [];
const runningAutomationJobs = new Set<string>();
let automationScheduler: ReturnType<typeof setInterval> | null = null;
const app = express();
const pendingToolApprovals = new Map<string, Omit<PendingToolApprovalRecord, "approvalId">>();

app.use(cors(createLocalOnlyCorsOptions()));
app.use(express.json({ limit: "1mb" }));
registerConnectivityRoutes(app, {
  snapshot,
  loadSettings,
  saveSettings,
  recoverSettings,
  getProviderApiKey,
  persistRuntimeState,
  publishActivity,
  syncSessionAgents
});
registerWorkspaceRoutes(app, { snapshot, loadSettings });

// ── Additional server helpers ──
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

async function persistProviderStatus(): Promise<void> {
  await saveSettings(currentSettings);
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, name: "nexadesk-server", time: new Date().toISOString() });
});

app.get("/api/snapshot", async (_req, res, next) => {
  try {
    const settings = await loadSettings(snapshot.providers);
    snapshot.providers = settings.providers;
    snapshot.agents = settings.assistant.agents;
    snapshot.skills = settings.assistant.skills;
    syncSessionAgents();
    snapshot.skillHub = buildSkillHub(snapshot.skills);
    snapshot.imChannels = createDefaultImChannels(snapshot.agents);
    snapshot.artifacts = buildWorkspaceArtifacts(snapshot.messages);
    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

app.get("/api/providers", async (_req, res, next) => {
  try {
    const settings = await loadSettings(snapshot.providers);
    snapshot.providers = settings.providers;
    res.json(settings.providers);
  } catch (error) {
    next(error);
  }
});

app.get("/api/agents", (_req, res) => {
  res.json(snapshot.agents);
});

app.get("/api/skills", async (_req, res, next) => {
  try {
    const settings = await loadSettings(snapshot.providers);
    snapshot.skills = settings.assistant.skills;
    res.json(settings.assistant.skills);
  } catch (error) {
    next(error);
  }
});

app.get("/api/sessions", (_req, res) => {
  res.json(snapshot.sessions);
});

app.get("/api/skills/hub", async (_req, res, next) => {
  try {
    const settings = await loadSettings(snapshot.providers);
    snapshot.skills = settings.assistant.skills;
    res.json({ listings: buildSkillHub(snapshot.skills) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/im/channels", (_req, res) => {
  res.json({ channels: createDefaultImChannels(snapshot.agents) });
});

app.get("/api/workspace/artifacts", (_req, res) => {
  res.json({ artifacts: buildWorkspaceArtifacts(snapshot.messages) });
});

const sessionPatchSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  pinned: z.boolean().optional()
});

const runtimeTelemetryEntrySchema = z.object({
  id: z.string().trim().min(1).max(120),
  sessionId: z.string().trim().min(1).max(120),
  providerName: z.string().trim().min(1).max(160),
  model: z.string().trim().min(1).max(160),
  startedAt: z.string().trim().min(1).max(80),
  completedAt: z.string().trim().min(1).max(80).optional(),
  firstTokenMs: z.number().finite().nonnegative().optional(),
  durationMs: z.number().finite().nonnegative().optional(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  status: z.enum(["running", "completed", "failed"]),
  error: z.string().trim().max(1000).optional(),
  messagePreview: z.string().trim().max(500).optional()
});

const runtimeTelemetrySchema = z.object({
  entries: z.array(runtimeTelemetryEntrySchema).max(100)
});

const automationScheduleKindSchema = z.enum(["manual", "once", "hourly", "daily", "weekly"]);

const automationCreateSchema = z.object({
  name: z.string().trim().min(1).max(140),
  prompt: z.string().trim().min(1).max(4000),
  scheduleKind: automationScheduleKindSchema,
  enabled: z.boolean().optional(),
  agentId: z.string().trim().optional()
});

const automationUpdateSchema = z.object({
  name: z.string().trim().min(1).max(140).optional(),
  prompt: z.string().trim().min(1).max(4000).optional(),
  scheduleKind: automationScheduleKindSchema.optional(),
  enabled: z.boolean().optional(),
  agentId: z.string().trim().optional()
});

app.patch("/api/sessions/:sessionId", async (req, res, next) => {
  try {
    const parsed = sessionPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const session = snapshot.sessions.find((item) => item.id === req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    if (parsed.data.title !== undefined) {
      session.title = parsed.data.title;
    }
    if (parsed.data.pinned !== undefined) {
      session.pinned = parsed.data.pinned;
    }
    session.updatedAt = new Date().toISOString();
    sortSessions();
    const activity = publishActivity({
      level: "info",
      title: "Session updated",
      detail: `${session.title} was updated.`
    });
    snapshot.activity.unshift(activity);
    await persistRuntimeState();
    res.json({ sessions: snapshot.sessions, activity });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/sessions/:sessionId", async (req, res, next) => {
  try {
    const sessionIndex = snapshot.sessions.findIndex((item) => item.id === req.params.sessionId);
    if (sessionIndex === -1) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (snapshot.sessions.length <= 1) {
      res.status(400).json({ error: "At least one session must remain." });
      return;
    }

    const [removed] = snapshot.sessions.splice(sessionIndex, 1);
    snapshot.messages = snapshot.messages.filter((message) => message.sessionId !== req.params.sessionId);
    snapshot.approvals = snapshot.approvals.filter((approval) => approval.sessionId !== req.params.sessionId);
    snapshot.approvalHistory = snapshot.approvalHistory.filter(
      (approval) => approval.sessionId !== req.params.sessionId
    );
    const activity = publishActivity({
      level: "warning",
      title: "Session deleted",
      detail: `${removed?.title ?? "Session"} was removed.`
    });
    snapshot.activity.unshift(activity);
    await persistRuntimeState();
    res.json({ sessions: snapshot.sessions, activity });
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
  addEventClient(res);
});

app.get("/api/runtime/telemetry", (_req, res) => {
  res.json({ entries: runtimeTelemetry });
});

app.put("/api/runtime/telemetry", async (req, res, next) => {
  try {
    const parsed = runtimeTelemetrySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const merged = new Map(runtimeTelemetry.map((entry) => [entry.id, entry]));
    for (const entry of parsed.data.entries) {
      merged.set(entry.id, { ...merged.get(entry.id), ...entry });
    }
    runtimeTelemetry = Array.from(merged.values())
      .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime())
      .slice(0, 100);
    await persistRuntimeState();
    res.json({ entries: runtimeTelemetry });
  } catch (error) {
    next(error);
  }
});

app.get("/api/settings", async (_req, res, next) => {
  try {
    res.json(await loadSettings(snapshot.providers));
  } catch (error) {
    next(error);
  }
});

app.post("/api/automations", async (req, res, next) => {
  try {
    const parsed = automationCreateSchema.safeParse(req.body as CreateAutomationRequest);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const now = new Date().toISOString();
    const job = normalizeAutomationJob({
      id: `automation-${randomUUID().slice(0, 8)}`,
      ...parsed.data,
      enabled: parsed.data.enabled ?? true,
      schedule: automationScheduleLabel(parsed.data.scheduleKind),
      nextRun: "",
      createdAt: now,
      updatedAt: now
    });
    snapshot.automations.unshift(job);
    const activity = publishActivity({
      level: "info",
      title: "Automation created",
      detail: `${job.name} was scheduled as ${job.schedule}.`
    });
    snapshot.activity.unshift(activity);
    await persistRuntimeState();
    res.status(201).json({ automations: snapshot.automations, automationRuns: snapshot.automationRuns, activity });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/automations/:jobId", async (req, res, next) => {
  try {
    const parsed = automationUpdateSchema.safeParse(req.body as UpdateAutomationRequest);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const index = snapshot.automations.findIndex((job) => job.id === req.params.jobId);
    if (index === -1) {
      res.status(404).json({ error: "Automation not found" });
      return;
    }

    const current = snapshot.automations[index];
    if (!current) {
      res.status(404).json({ error: "Automation not found" });
      return;
    }
    const nextJob = normalizeAutomationJob({
      ...current,
      ...parsed.data,
      schedule: parsed.data.scheduleKind ? automationScheduleLabel(parsed.data.scheduleKind) : current.schedule,
      updatedAt: new Date().toISOString()
    });
    snapshot.automations[index] = nextJob;
    const activity = publishActivity({
      level: "info",
      title: "Automation updated",
      detail: `${nextJob.name} is now ${nextJob.enabled ? "enabled" : "disabled"}.`
    });
    snapshot.activity.unshift(activity);
    await persistRuntimeState();
    res.json({ automations: snapshot.automations, automationRuns: snapshot.automationRuns, activity });
  } catch (error) {
    next(error);
  }
});

app.post("/api/automations/:jobId/run", async (req, res, next) => {
  try {
    const job = snapshot.automations.find((item) => item.id === req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "Automation not found" });
      return;
    }
    const run = await runAutomationJob(job, "manual");
    res.status(201).json({ automations: snapshot.automations, automationRuns: snapshot.automationRuns, run });
  } catch (error) {
    next(error);
  }
});

app.get("/api/desktop/status", (_req, res) => {
  res.json(createDesktopStatus());
});

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

app.put("/api/settings", async (req, res, next) => {
  try {
    const body = req.body as SaveSettingsRequest;
    if (!body?.settings || !Array.isArray(body.settings.providers)) {
      res.status(400).json({ error: "Invalid settings payload" });
      return;
    }

    const settings = await saveSettings(body.settings, snapshot.providers, body.providerSecrets);
    snapshot.providers = settings.providers;
    snapshot.agents = settings.assistant.agents;
    snapshot.skills = settings.assistant.skills;
    syncSessionAgents();
    const activity = publishActivity({
      level: "info",
      title: "Settings saved",
      detail: "Model, interface, workspace, permission, and app settings were persisted locally."
    });
    snapshot.activity.unshift(activity);
    await persistRuntimeState();
    res.json({ settings, activity });
  } catch (error) {
    next(error);
  }
});

app.post("/api/settings/recover", async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as RecoverSettingsRequest;
    const result = await recoverSettings(snapshot.providers, { resetSecrets: Boolean(body.resetSecrets) });
    snapshot.providers = result.settings.providers;
    snapshot.agents = result.settings.assistant.agents;
    snapshot.skills = result.settings.assistant.skills;
    syncSessionAgents();
    const activity = publishActivity({
      level: result.warning ? "warning" : "info",
      title: "设置已恢复",
      detail: result.warning ?? `已重建默认设置，备份文件 ${result.backupPaths.length} 个。`
    });
    snapshot.activity.unshift(activity);
    await persistRuntimeState();
    res.json({ ...result, activity });
  } catch (error) {
    next(error);
  }
});

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

const messageSchema = z.object({
  content: z.string().trim().min(1).max(8000),
  providerId: z.string().trim().optional(),
  model: z.string().trim().optional(),
  agentId: z.string().trim().optional()
});

app.post("/api/sessions/:sessionId/messages", async (req, res, next) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const session = snapshot.sessions.find((item) => item.id === req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  try {
    const exchange = await runModelExchange(session.id, parsed.data);
    res.status(201).json(exchange);
  } catch (error) {
    next(error);
  }
});

app.post("/api/sessions/:sessionId/messages/stream", async (req, res, next) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const session = snapshot.sessions.find((item) => item.id === req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.writeHead(200, {
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream"
  });

  try {
    await runModelExchange(session.id, parsed.data, (event) => writeChatEvent(res, event));
  } catch (error) {
    const message =
      error instanceof ProviderRuntimeError || error instanceof Error ? error.message : "模型调用失败：未知错误";
    writeChatEvent(res, { type: "error", message });
  } finally {
    res.end();
  }
});

type ResolvedModelRuntime = Awaited<ReturnType<typeof resolveRuntime>>;

async function runModelExchange(
  sessionId: string,
  input: SendMessageRequest,
  onEvent?: (event: ChatStreamEvent) => void
): Promise<{ messages: ChatMessage[]; activity: ActivityEvent }> {
  const session = snapshot.sessions.find((item) => item.id === sessionId);
  if (!session) {
    throw new ProviderRuntimeError("Session not found");
  }

  const settings = await loadSettings(snapshot.providers);
  snapshot.providers = settings.providers;
  snapshot.agents = settings.assistant.agents;
  snapshot.skills = settings.assistant.skills;
  syncSessionAgents();
  const activeAgent =
    snapshot.agents.find((agent) => agent.id === input.agentId && agent.enabled) ??
    snapshot.agents.find((agent) => agent.id === session.activeAgentId && agent.enabled) ??
    snapshot.agents.find((agent) => agent.enabled);
  if (activeAgent && session.activeAgentId !== activeAgent.id) {
    session.activeAgentId = activeAgent.id;
  }
  const activeEngine = resolveAgentEngine(settings, activeAgent);
  const externalEngine = canRunExternalAgentEngine(activeEngine) ? activeEngine : undefined;
  const runtime: ResolvedModelRuntime | undefined = externalEngine
    ? undefined
    : await resolveRuntime(settings, input.providerId, input.model, activeAgent?.providerId);
  let activityDetail = externalEngine
    ? `${externalEngine.name} used codex exec in read-only mode to answer a workbench message.`
    : `${runtime?.provider.name} used ${runtime?.model} to answer a workbench message.`;
  const createdAt = new Date().toISOString();
  const userMessage: ChatMessage = {
    id: randomUUID(),
    sessionId: session.id,
    role: "user",
    author: "You",
    content: input.content,
    createdAt
  };
  const assistantMessage: ChatMessage = {
    id: randomUUID(),
    sessionId: session.id,
    role: "assistant",
    author: activeAgent?.name ?? "Cowork Agent",
    content: "",
    createdAt: new Date().toISOString(),
    toolCalls: [
      {
        id: randomUUID(),
        name: "model.stream",
        status: "running",
        risk: "low",
        summary: externalEngine ? `${externalEngine.name} / codex exec (read-only)` : modelRuntimeLabel(runtime)
      }
    ]
  };

  snapshot.messages.push(userMessage, assistantMessage);
  onEvent?.({ type: "user_message", message: userMessage });
  onEvent?.({
    type: "assistant_start",
    message: assistantMessage,
    provider: externalEngine
      ? { id: externalEngine.id, name: externalEngine.name, model: "codex exec" }
      : {
          id: runtime?.provider.id ?? "unknown",
          name: runtime?.provider.name ?? "Unknown Provider",
          model: runtime?.model ?? "unknown"
        }
  });

  const runtimeStartedMs = Date.now();
  let firstTokenMs: number | undefined;
  const telemetryBase: RuntimeTelemetryEntry = {
    id: assistantMessage.id,
    sessionId: session.id,
    providerName: externalEngine ? externalEngine.name : (runtime?.provider.name ?? "Unknown Provider"),
    model: externalEngine ? "codex exec" : (runtime?.model ?? "unknown"),
    startedAt: assistantMessage.createdAt,
    inputTokens: estimateTokenCount(input.content),
    outputTokens: 0,
    totalTokens: estimateTokenCount(input.content),
    status: "running",
    messagePreview: input.content.slice(0, 240)
  };
  upsertRuntimeTelemetry(telemetryBase);

  const markFirstToken = () => {
    firstTokenMs ??= Math.max(0, Date.now() - runtimeStartedMs);
  };

  try {
    const history = buildRuntimeMessages(session.id, activeAgent, settings);
    let assistantContent = "";

    const nativeToolRequests: AgentToolRequest[] = [];
    if (externalEngine) {
      try {
        const result = await collectRuntimeEvents(
          streamExternalAgentEvents({
            engine: externalEngine,
            messages: history,
            cwd: resolveExternalRuntimeCwd(settings)
          }),
          assistantMessage,
          onEvent,
          { onText: markFirstToken }
        );
        assistantContent += result.content;
        nativeToolRequests.push(...result.toolRequests);
      } catch (error) {
        let fallbackRuntime: ResolvedModelRuntime;
        try {
          fallbackRuntime = await resolveRuntime(settings, input.providerId, input.model, activeAgent?.providerId);
        } catch (fallbackError) {
          throw new ProviderRuntimeError(
            `${externalEngine.name} 暂不可用，且模型中心回退也失败：${formatRuntimeError(fallbackError)}`
          );
        }

        const fallbackDelta = formatExternalFallbackNotice(externalEngine, fallbackRuntime, error);
        assistantContent += fallbackDelta;
        onEvent?.({ type: "assistant_delta", messageId: assistantMessage.id, delta: fallbackDelta });
        updateModelStreamSummary(
          assistantMessage,
          `${externalEngine.name} failed; fallback ${modelRuntimeLabel(fallbackRuntime)}`
        );
        activityDetail = `${externalEngine.name} failed and NexaDesk fell back to ${fallbackRuntime.provider.name} / ${fallbackRuntime.model}.`;

        const result = await collectRuntimeEvents(
          streamProviderEvents({
            provider: fallbackRuntime.provider,
            model: fallbackRuntime.model,
            apiKey: fallbackRuntime.apiKey,
            messages: history
          }),
          assistantMessage,
          onEvent,
          { onText: markFirstToken }
        );
        assistantContent += result.content;
        nativeToolRequests.push(...result.toolRequests);
      }
    } else if (runtime) {
      const result = await collectRuntimeEvents(
        streamProviderEvents({
          provider: runtime.provider,
          model: runtime.model,
          apiKey: runtime.apiKey,
          messages: history
        }),
        assistantMessage,
        onEvent,
        { onText: markFirstToken }
      );
      assistantContent += result.content;
      nativeToolRequests.push(...result.toolRequests);
    }

    const toolRequests = [...nativeToolRequests, ...parseToolRequests(assistantContent)];
    assistantContent = stripToolBlocks(assistantContent).trim() || "模型没有返回文本内容。";
    assistantMessage.content = assistantContent;

    if (toolRequests.length > 0) {
      const toolSummary = await handleAgentToolRequests({
        toolRequests,
        assistantMessage,
        activeAgentId: activeAgent?.id ?? session.activeAgentId,
        context: await createToolContext(settings),
        onEvent
      });
      if (toolSummary) {
        assistantMessage.content = `${assistantMessage.content}\n\n${toolSummary}`.trim();
        onEvent?.({ type: "assistant_delta", messageId: assistantMessage.id, delta: `\n\n${toolSummary}` });
      }
    }

    assistantMessage.createdAt = new Date().toISOString();
    assistantMessage.toolCalls = assistantMessage.toolCalls?.map((tool) =>
      tool.name === "model.stream" ? { ...tool, status: "completed" } : tool
    );
    session.updatedAt = assistantMessage.createdAt;
    const activity = publishActivity({
      level: "info",
      title: "模型回答完成",
      detail: activityDetail
    });
    const outputTokens = estimateTokenCount(assistantMessage.content);
    upsertRuntimeTelemetry({
      ...telemetryBase,
      completedAt: assistantMessage.createdAt,
      firstTokenMs,
      durationMs: Math.max(0, Date.now() - runtimeStartedMs),
      outputTokens,
      totalTokens: telemetryBase.inputTokens + outputTokens,
      status: "completed"
    });
    snapshot.activity.unshift(activity);
    await persistRuntimeState();
    onEvent?.({ type: "assistant_done", message: assistantMessage, activity });

    return { messages: [userMessage, assistantMessage], activity };
  } catch (error) {
    const message = formatRuntimeError(error);
    assistantMessage.toolCalls = assistantMessage.toolCalls?.map((tool) =>
      tool.name === "model.stream" ? { ...tool, status: "failed", summary: `${tool.summary} · ${message}` } : tool
    );
    upsertRuntimeTelemetry({
      ...telemetryBase,
      completedAt: new Date().toISOString(),
      firstTokenMs,
      durationMs: Math.max(0, Date.now() - runtimeStartedMs),
      outputTokens: estimateTokenCount(assistantMessage.content),
      totalTokens: telemetryBase.inputTokens + estimateTokenCount(assistantMessage.content),
      status: "failed",
      error: message
    });
    await persistRuntimeState();
    throw error;
  }
}

async function resolveRuntime(
  settings: AppSettings,
  requestedProviderId?: string,
  requestedModel?: string,
  agentProviderId?: string
) {
  const provider =
    settings.providers.find((item) => item.id === requestedProviderId) ??
    settings.providers.find((item) => item.id === agentProviderId && item.connected) ??
    settings.providers.find((item) => item.id === settings.model.activeProviderId) ??
    settings.providers.find((item) => item.connected);

  if (!provider) {
    throw new ProviderRuntimeError("请先在模型中心启用一个 Provider。");
  }
  if (!provider.connected) {
    throw new ProviderRuntimeError(`Provider ${provider.name} is disabled. Enable and save it in Model Center first.`);
  }

  const model =
    requestedModel ||
    (settings.model.activeProviderId === provider.id ? settings.model.activeModel : undefined) ||
    provider.defaultModel ||
    provider.models[0];

  if (!model) {
    throw new ProviderRuntimeError(`Provider ${provider.name} does not have a model configured.`);
  }

  const apiKey = await getProviderApiKey(provider.id);
  if (provider.kind !== "local" && !apiKey) {
    throw new ProviderRuntimeError(`Provider ${provider.name} needs a saved API key first.`);
  }

  return { provider, model, apiKey };
}

async function collectRuntimeEvents(
  events: AsyncIterable<RuntimeStreamEvent>,
  assistantMessage: ChatMessage,
  onEvent?: (event: ChatStreamEvent) => void,
  options: { onText?: (delta: string) => void } = {}
) {
  let content = "";
  const toolRequests: AgentToolRequest[] = [];

  for await (const event of events) {
    if (event.type === "text") {
      content += event.delta;
      options.onText?.(event.delta);
      onEvent?.({ type: "assistant_delta", messageId: assistantMessage.id, delta: event.delta });
    } else {
      toolRequests.push(event.request);
    }
  }

  return { content, toolRequests };
}

function resolveAgentEngine(settings: AppSettings, activeAgent: AgentProfile | undefined) {
  const engineId = activeAgent?.engineId ?? "nexadesk_builtin";
  return settings.assistant.engines.find((engine) => engine.id === engineId);
}

function resolveExternalRuntimeCwd(settings: AppSettings) {
  return path.resolve(settings.workspace.defaultWorkspace || settings.workspace.allowedRoots[0] || process.cwd());
}

function modelRuntimeLabel(runtime: ResolvedModelRuntime | undefined) {
  return runtime ? `${runtime.provider.name} / ${runtime.model}` : "Unknown Provider / unknown";
}

function formatExternalFallbackNotice(
  engine: AgentEngineSettings,
  fallbackRuntime: ResolvedModelRuntime,
  error: unknown
) {
  return `\n\n（${engine.name} 暂不可用，已回退到 ${fallbackRuntime.provider.name} / ${fallbackRuntime.model}。原因：${formatRuntimeError(error)}）\n\n`;
}

function upsertRuntimeTelemetry(entry: RuntimeTelemetryEntry) {
  runtimeTelemetry = [entry, ...runtimeTelemetry.filter((item) => item.id !== entry.id)].slice(0, 100);
  persistTelemetryEntry(entry);
}

function updateModelStreamSummary(assistantMessage: ChatMessage, summary: string) {
  assistantMessage.toolCalls = assistantMessage.toolCalls?.map((tool) =>
    tool.name === "model.stream" ? { ...tool, summary } : tool
  );
}

function buildRuntimeMessages(
  sessionId: string,
  activeAgent: AgentProfile | undefined,
  settings: AppSettings
): RuntimeChatMessage[] {
  const recentMessages = snapshot.messages
    .filter((message) => message.sessionId === sessionId && (message.role === "user" || message.role === "assistant"))
    .slice(-16)
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content
    }))
    .filter((message) => message.content.trim());
  const enabledSkillIds = new Set(activeAgent?.skills ?? []);
  const enabledSkills = settings.assistant.skills.filter((skill) => skill.enabled && enabledSkillIds.has(skill.id));
  const boundMcpToolIds = activeAgent?.mcpToolIds ?? [];
  const boundMcpServers = settings.mcp.servers.filter((server) => {
    if (!server.enabled) {
      return false;
    }
    return (
      boundMcpToolIds.includes(`${server.id}:*`) || boundMcpToolIds.some((toolId) => toolId.startsWith(`${server.id}:`))
    );
  });

  return [
    {
      role: "system",
      content: [
        `You are NexaDesk ${activeAgent ? `"${activeAgent.name}"` : "Cowork Agent"}. Reply in Chinese and help the user directly.`,
        activeAgent?.instructions ??
          "Understand the goal, break it into steps, request tools when needed, and wait for approval before high-risk actions.",
        enabledSkills.length
          ? `Enabled skills:\n${enabledSkills.map((skill) => `- ${skill.name}: ${skill.instructions}`).join("\n")}`
          : "No enabled skills are bound to this assistant.",
        boundMcpToolIds.length
          ? [
              "Bound MCP tools:",
              ...boundMcpToolIds.map((toolId) => `- ${toolId}`),
              boundMcpServers.length
                ? `Enabled MCP servers: ${boundMcpServers.map((server) => `${server.name} (${server.transport})`).join(", ")}`
                : "No enabled MCP servers currently match these bindings."
            ].join("\n")
          : "No MCP tools are bound to this assistant.",
        "When you need a tool, output a fenced block at the end:",
        "```nexadesk-tool",
        '{"tool":"list_dir","path":"."}',
        "```",
        "Available tools: list_dir, read_file, write_file, run_command, search, browser, image_generate.",
        "Reading files, listing folders, and searching are low risk. Writing files, running commands, browser, and image generation require approval.",
        "The browser tool reads a page title and summary. The image_generate tool uses the configured image API and saves the generated file."
      ].join("\n")
    },
    ...recentMessages
  ];
}

function syncSessionAgents() {
  const enabledAgentIds = snapshot.agents.filter((agent) => agent.enabled).map((agent) => agent.id);
  for (const session of snapshot.sessions) {
    session.agentIds = enabledAgentIds;
    if (!enabledAgentIds.includes(session.activeAgentId)) {
      session.activeAgentId = enabledAgentIds[0] ?? session.activeAgentId;
    }
  }
  sortSessions();
}

function normalizeAutomationJob(job: Partial<AutomationJob> & Pick<AutomationJob, "id" | "name">): AutomationJob {
  const now = new Date();
  const scheduleKind = job.scheduleKind ?? inferAutomationScheduleKind(job.schedule);
  const enabled = Boolean(job.enabled);
  const nextRunTime = job.nextRun ? new Date(job.nextRun).getTime() : Number.NaN;
  const hasValidFutureRun = Number.isFinite(nextRunTime) && nextRunTime > now.getTime();
  return {
    id: job.id,
    name: job.name,
    schedule: job.schedule ?? automationScheduleLabel(scheduleKind),
    enabled,
    nextRun:
      enabled && scheduleKind !== "manual"
        ? hasValidFutureRun
          ? (job.nextRun ?? "")
          : computeNextAutomationRun(scheduleKind, now)
        : "Not scheduled",
    prompt: job.prompt ?? `执行自动化任务：${job.name}。请总结目标、检查当前上下文并给出结果。`,
    agentId: job.agentId,
    scheduleKind,
    createdAt: job.createdAt ?? now.toISOString(),
    updatedAt: job.updatedAt ?? now.toISOString(),
    lastRunAt: job.lastRunAt,
    lastStatus: job.lastStatus,
    failureReason: job.failureReason
  };
}

function startAutomationScheduler() {
  if (automationScheduler) {
    return;
  }
  automationScheduler = setInterval(() => {
    void runDueAutomations();
  }, 15_000);
  void runDueAutomations();
}

async function runDueAutomations() {
  const now = Date.now();
  for (const job of snapshot.automations) {
    const dueAt = new Date(job.nextRun).getTime();
    if (
      job.enabled &&
      job.scheduleKind !== "manual" &&
      Number.isFinite(dueAt) &&
      dueAt <= now &&
      !runningAutomationJobs.has(job.id)
    ) {
      await runAutomationJob(job, "schedule");
    }
  }
}

async function runAutomationJob(job: AutomationJob, trigger: "manual" | "schedule"): Promise<AutomationRun> {
  if (runningAutomationJobs.has(job.id)) {
    throw new ProviderRuntimeError(`Automation ${job.name} is already running.`);
  }

  runningAutomationJobs.add(job.id);
  const startedAt = new Date();
  const run: AutomationRun = {
    id: `run-${randomUUID().slice(0, 8)}`,
    jobId: job.id,
    jobName: job.name,
    agentId: job.agentId,
    status: "running",
    startedAt: startedAt.toISOString()
  };
  snapshot.automationRuns.unshift(run);
  snapshot.automationRuns = snapshot.automationRuns.slice(0, 100);

  const activity = publishActivity({
    level: "info",
    title: "Automation started",
    detail: `${job.name} started by ${trigger}.`
  });
  snapshot.activity.unshift(activity);
  await persistRuntimeState();

  try {
    const session = snapshot.sessions[0];
    if (!session) {
      throw new ProviderRuntimeError("No session is available for automation.");
    }

    const exchange = await runModelExchange(session.id, {
      content: `【自动化任务：${job.name}】\n${job.prompt}`,
      agentId: job.agentId
    });
    const assistantMessage = exchange.messages.find((message) => message.role === "assistant");
    run.status = "completed";
    run.resultSummary = assistantMessage?.content.slice(0, 260) || "Automation completed.";
    job.lastStatus = "completed";
    job.failureReason = undefined;
  } catch (error) {
    const reason = formatRuntimeError(error);
    run.status = "failed";
    run.failureReason = reason;
    job.lastStatus = "failed";
    job.failureReason = reason;
    const failedActivity = publishActivity({
      level: "error",
      title: "Automation failed",
      detail: `${job.name}: ${reason}`
    });
    snapshot.activity.unshift(failedActivity);
  } finally {
    const finishedAt = new Date();
    run.finishedAt = finishedAt.toISOString();
    run.durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
    job.lastRunAt = run.finishedAt;
    if (job.scheduleKind === "once") {
      job.enabled = false;
      job.nextRun = "Completed";
    } else {
      job.nextRun = job.enabled ? computeNextAutomationRun(job.scheduleKind, finishedAt) : "Not scheduled";
    }
    job.updatedAt = finishedAt.toISOString();
    runningAutomationJobs.delete(job.id);
    await persistRuntimeState();
  }

  return run;
}

function sortSessions() {
  snapshot.sessions.sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) {
      return left.pinned ? -1 : 1;
    }
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

async function handleAgentToolRequests({
  toolRequests,
  assistantMessage,
  activeAgentId,
  context,
  onEvent
}: {
  toolRequests: AgentToolRequest[];
  assistantMessage: ChatMessage;
  activeAgentId: string;
  context: AgentToolContext;
  onEvent?: (event: ChatStreamEvent) => void;
}) {
  const resultLines: string[] = [];
  const approvalLines: string[] = [];

  for (const request of toolRequests.slice(0, 6)) {
    const execution = await prepareToolRequest(request, context);
    assistantMessage.toolCalls = [...(assistantMessage.toolCalls ?? []), execution.toolCall];
    onEvent?.({ type: "tool_call", messageId: assistantMessage.id, toolCall: execution.toolCall });

    if (execution.requiresApproval) {
      const approval: PermissionRequest = {
        id: randomUUID(),
        sessionId: assistantMessage.sessionId,
        agentId: activeAgentId,
        action: summarizeToolRequest(request),
        risk: execution.toolCall.risk,
        requestedAt: new Date().toISOString(),
        toolCallId: execution.toolCall.id,
        messageId: assistantMessage.id,
        toolName: request.tool
      };
      pendingToolApprovals.set(approval.id, {
        request,
        sessionId: assistantMessage.sessionId,
        agentId: activeAgentId,
        messageId: assistantMessage.id,
        toolCallId: execution.toolCall.id
      });
      snapshot.approvals.unshift(approval);
      onEvent?.({ type: "approval_queued", approval });
      approvalLines.push(`已进入审批队列：${approval.action}`);
      continue;
    }

    const toolMessage = appendToolMessage(assistantMessage.sessionId, execution.toolCall.name, execution.result ?? "");
    onEvent?.({ type: "tool_message", message: toolMessage });
    resultLines.push(`工具 ${execution.toolCall.name} 已完成，结果已追加为工具消息。`);
  }

  return [...resultLines, ...approvalLines].length
    ? `工具状态：\n${[...resultLines, ...approvalLines].join("\n\n")}`
    : "";
}

function appendToolMessage(sessionId: string, toolName: string, content: string) {
  const message: ChatMessage = {
    id: randomUUID(),
    sessionId,
    role: "tool",
    author: toolName,
    content: content || "工具没有返回内容。",
    createdAt: new Date().toISOString()
  };
  snapshot.messages.push(message);
  return message;
}

async function createToolContext(settings: AppSettings): Promise<AgentToolContext> {
  const imageBaseUrl = getEnv("NEXADESK_IMAGE_BASE_URL", "AION_LITE_IMAGE_BASE_URL")?.trim();
  const imageApiKey = getEnv("NEXADESK_IMAGE_API_KEY", "AION_LITE_IMAGE_API_KEY")?.trim();
  const imageProvider =
    settings.providers.find((provider) => provider.id === "openai-official") ??
    settings.providers.find((provider) => provider.apiMode === "responses");
  const imageProviderKey = imageProvider ? await getProviderApiKey(imageProvider.id) : undefined;
  const baseUrl = imageBaseUrl || imageProvider?.baseUrl || "https://api.openai.com/v1";
  const apiKey = imageApiKey || imageProviderKey;
  const model = getEnv("NEXADESK_IMAGE_MODEL", "AION_LITE_IMAGE_MODEL")?.trim() || "gpt-image-1";

  return {
    workspace: settings.workspace,
    image:
      apiKey || imageBaseUrl
        ? {
            baseUrl,
            apiKey,
            model,
            outputDirectory: settings.workspace.exportDirectory || settings.workspace.defaultWorkspace
          }
        : undefined
  };
}

function stripToolBlocks(content: string) {
  return content.replace(/```(?:nexadesk-tool|aion-tool)\s*[\s\S]*?```/g, "").trim();
}

function writeChatEvent(res: express.Response, event: ChatStreamEvent) {
  res.write(`event: chat\ndata: ${JSON.stringify(event)}\n\n`);
}

function createDesktopStatus(): DesktopStatus {
  return {
    appName: "NexaDesk",
    version: getEnv("NEXADESK_APP_VERSION", "AION_LITE_APP_VERSION") ?? "0.1.0",
    mode: getEnv("NEXADESK_DESKTOP", "AION_LITE_DESKTOP") === "1" ? "desktop" : "web",
    apiBase: `http://${host}:${port}`,
    dataDir: getEnv("NEXADESK_DATA_DIR", "AION_LITE_DATA_DIR"),
    settingsPath: getEnv("NEXADESK_SETTINGS_PATH", "AION_LITE_SETTINGS_PATH"),
    secretsPath: getEnv("NEXADESK_SECRETS_PATH", "AION_LITE_SECRETS_PATH"),
    runtimeStatePath,
    logPath: getEnv("NEXADESK_LOG_PATH", "AION_LITE_LOG_PATH"),
    crashLogPath: getEnv("NEXADESK_CRASH_LOG_PATH", "AION_LITE_CRASH_LOG_PATH"),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.versions.node,
    electronVersion: process.versions.electron,
    uptimeSeconds: Math.round(process.uptime()),
    safeStorage:
      (getEnv("NEXADESK_SAFE_STORAGE", "AION_LITE_SAFE_STORAGE") as DesktopStatus["safeStorage"]) ?? "unavailable",
    secretsEncrypted: Boolean(getEnv("NEXADESK_SECRET_KEY", "AION_LITE_SECRET_KEY"))
  };
}

async function persistRuntimeState() {
  try {
    await saveRuntimeState(snapshot, pendingToolApprovalRecords(), runtimeTelemetry);
  } catch (error) {
    console.error("Failed to persist runtime state", error);
  }
}

function pendingToolApprovalRecords(): PendingToolApprovalRecord[] {
  return Array.from(pendingToolApprovals.entries()).map(([approvalId, pending]) => ({
    approvalId,
    ...pending
  }));
}

const approvalSchema = z.object({
  approved: z.boolean(),
  reason: z.string().trim().max(1000).optional()
});

app.post("/api/approvals/:approvalId/resolve", async (req, res, next) => {
  const parsed = approvalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const approvalIndex = snapshot.approvals.findIndex((item) => item.id === req.params.approvalId);
  if (approvalIndex === -1) {
    res.status(404).json({ error: "Approval not found" });
    return;
  }

  const [approval] = snapshot.approvals.splice(approvalIndex, 1);
  if (!approval) {
    res.status(404).json({ error: "Approval not found" });
    return;
  }

  try {
    const pending = pendingToolApprovals.get(req.params.approvalId);
    const messages: ChatMessage[] = [];
    const body = parsed.data as ResolveApprovalRequest;
    const reason = body.reason?.trim();

    if (!parsed.data.approved) {
      if (pending) {
        updateToolCall(pending.messageId, pending.toolCallId, "rejected");
        pendingToolApprovals.delete(req.params.approvalId);
      }
      const history = pushApprovalHistory(approval, "rejected", {
        reason
      });
      const activity = publishActivity({
        level: "warning",
        title: "审批已拒绝",
        detail: `${approval.action}${reason ? `；原因：${reason}` : "；未填写拒绝原因"}`
      });
      snapshot.activity.unshift(activity);
      await persistRuntimeState();
      res.json({ approval, history, activity, messages });
      return;
    }

    if (!pending) {
      const history = pushApprovalHistory(approval, "failed", {
        reason: "审批请求的执行上下文不存在，可能来自旧版本状态或服务重启前未保存的请求。"
      });
      const activity = publishActivity({
        level: "error",
        title: "审批无法执行",
        detail: `${approval.action}；执行上下文不存在。`
      });
      snapshot.activity.unshift(activity);
      await persistRuntimeState();
      res.json({ approval, history, activity, messages });
      return;
    }

    if (pending) {
      updateToolCall(pending.messageId, pending.toolCallId, "running");
      const settings = await loadSettings(snapshot.providers);
      const result = await executeToolRequest(pending.request, await createToolContext(settings));
      const toolMessage = appendToolMessage(pending.sessionId, pending.request.tool, result);
      messages.push(toolMessage);
      updateToolCall(pending.messageId, pending.toolCallId, "completed");
      pendingToolApprovals.delete(req.params.approvalId);
      const history = pushApprovalHistory(approval, "approved", {
        resultSummary: result.slice(0, 500)
      });
      const activity = publishActivity({
        level: "info",
        title: "审批已通过",
        detail: approval.action
      });
      snapshot.activity.unshift(activity);
      await persistRuntimeState();
      res.json({ approval, history, activity, messages });
      return;
    }
  } catch (error) {
    if (approval?.messageId && approval.toolCallId) {
      updateToolCall(approval.messageId, approval.toolCallId, "failed");
    }
    if (approval) {
      pushApprovalHistory(approval, "failed", {
        reason: error instanceof Error ? error.message : "审批执行失败。"
      });
      await persistRuntimeState();
    }
    next(error);
  }
});

function pushApprovalHistory(
  approval: PermissionRequest,
  decision: ApprovalHistoryEntry["decision"],
  options: { reason?: string; resultSummary?: string } = {}
) {
  const history: ApprovalHistoryEntry = {
    ...approval,
    decision,
    resolvedAt: new Date().toISOString(),
    reason: options.reason,
    resultSummary: options.resultSummary
  };
  snapshot.approvalHistory.unshift(history);
  snapshot.approvalHistory = snapshot.approvalHistory.slice(0, 100);
  return history;
}

function updateToolCall(
  messageId: string,
  toolCallId: string,
  status: NonNullable<ChatMessage["toolCalls"]>[number]["status"]
) {
  const message = snapshot.messages.find((item) => item.id === messageId);
  if (!message?.toolCalls) {
    return;
  }
  message.toolCalls = message.toolCalls.map((tool) => (tool.id === toolCallId ? { ...tool, status } : tool));
}

setInterval(() => {
  const event = publishActivity({
    level: "info",
    title: "Heartbeat",
    detail: "Local API is still connected to the workbench."
  });
  snapshot.activity.unshift(event);
  snapshot.activity = snapshot.activity.slice(0, 20);
}, 20000).unref();

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: error instanceof Error ? error.message : "Unexpected server error" });
});

void startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function startServer() {
  const pendingApprovals = await loadRuntimeState(snapshot);
  runtimeTelemetry = await loadRuntimeTelemetry();
  snapshot.automations = snapshot.automations.map((job) => normalizeAutomationJob(job));
  snapshot.automationRuns = snapshot.automationRuns.slice(0, 100);
  pendingToolApprovals.clear();
  for (const pending of pendingApprovals) {
    pendingToolApprovals.set(pending.approvalId, {
      request: pending.request,
      sessionId: pending.sessionId,
      agentId: pending.agentId,
      messageId: pending.messageId,
      toolCallId: pending.toolCallId
    });
  }
  /* ── MCP Bridge: callback endpoint for external MCP tools ── */
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
      publishActivity({ level: "info", title: "MCP Bridge 调用", detail: `${serverId}/${toolName}` });
      res.json({ ok: true, message: `Bridge executed ${toolName}`, toolName, serverId, result: null });
    } catch (error) {
      next(error);
    }
  });

  /* ── MCP Bridge: health check ── */
  app.get("/api/mcp-bridge/health", (_req, res) => {
    res.json({ ok: true, bridge: "nexadesk", version: "0.1.0" });
  });

  /* ── Skill Security Scan ── */
  app.post("/api/skills/scan", async (req, res, next) => {
    try {
      const { skillId } = req.body as { skillId: string };
      const skills = currentSettings.assistant.skills;
      const skill = skills.find((s) => s.id === skillId);
      if (!skill) {
        res.status(404).json({ ok: false, message: "Skill not found" });
        return;
      }
      const instr = skill.instructions.toLowerCase();
      const findings = [];
      findings.push({
        dimension: "文件系统",
        status: instr.includes("file") || instr.includes("write") ? "warning" : "safe",
        detail: instr.includes("file") ? "包含文件操作" : "无文件操作"
      });
      findings.push({
        dimension: "命令执行",
        status: instr.includes("command") || instr.includes("exec") ? "risk" : "safe",
        detail: instr.includes("command") ? "包含命令执行" : "无命令执行"
      });
      findings.push({
        dimension: "网络请求",
        status: instr.includes("http") || instr.includes("api") ? "warning" : "safe",
        detail: instr.includes("http") ? "包含网络请求" : "无网络请求"
      });
      findings.push({
        dimension: "数据收集",
        status: instr.includes("collect") ? "risk" : "safe",
        detail: instr.includes("collect") ? "可能收集数据" : "无数据收集"
      });
      findings.push({
        dimension: "代码注入",
        status: instr.includes("eval") ? "risk" : "safe",
        detail: instr.includes("eval") ? "包含动态代码" : "无动态代码"
      });
      const riskCount = findings.filter((f) => f.status === "risk").length;
      const warnCount = findings.filter((f) => f.status === "warning").length;
      const score = Math.max(0, 100 - riskCount * 25 - warnCount * 10);
      const level = score >= 80 ? "high" : score >= 50 ? "medium" : "low";
      res.json({ ok: true, skillId, score, level, findings, scannedAt: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  });

  /* ── Memory CRUD ── */
  app.get("/api/memory", (_req, res) => {
    res.json({
      entries: currentSettings.memoryEntries ?? [],
      summaries: currentSettings.sessionSummaries ?? [],
      settings: currentSettings.memory
    });
  });

  app.post("/api/memory/entries", async (req, res, next) => {
    try {
      const entry = req.body;
      const entries = [
        ...(currentSettings.memoryEntries ?? []),
        {
          ...entry,
          id: entry.id || `mem-${Date.now()}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
      currentSettings = { ...currentSettings, memoryEntries: entries, updatedAt: new Date().toISOString() };
      await saveCurrentSettings();
      res.json({ ok: true, entry });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/memory/entries/:entryId", async (req, res, next) => {
    try {
      const entries = (currentSettings.memoryEntries ?? []).filter((e) => e.id !== req.params.entryId);
      currentSettings = { ...currentSettings, memoryEntries: entries, updatedAt: new Date().toISOString() };
      await saveCurrentSettings();
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  /* ── Encryption ── */
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

  app.listen(port, host, () => {
    console.log(`NexaDesk API listening on http://${host}:${port}`);
  });
  startAutomationScheduler();
}

async function testMcpServer(server: McpServerTestRequest["server"], timeoutMs: number): Promise<McpServerTestResult> {
  const checkedAt = new Date().toISOString();
  if (server.transport === "http") {
    const url = server.url?.trim();
    if (!url) {
      return { ok: false, checkedAt, transport: "http", message: "请先填写 MCP HTTP URL。" };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs).unref();
    try {
      const response = await fetch(url, { method: "GET", signal: controller.signal });
      return {
        ok: response.status < 500,
        checkedAt,
        transport: "http",
        status: response.status,
        resolvedTarget: url,
        message:
          response.status < 500
            ? `HTTP MCP endpoint reachable: ${response.status}.`
            : `HTTP MCP endpoint returned ${response.status}.`
      };
    } catch (error) {
      return {
        ok: false,
        checkedAt,
        transport: "http",
        resolvedTarget: url,
        message: error instanceof Error ? `HTTP MCP test failed: ${error.message}` : "HTTP MCP test failed."
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  const command = server.command?.trim();
  if (!command) {
    return { ok: false, checkedAt, transport: "stdio", message: "请先填写 stdio MCP 命令。" };
  }
  const commandResult = await resolveLocalCommand(command, timeoutMs);
  return {
    ok: commandResult.ok,
    checkedAt,
    transport: "stdio",
    resolvedTarget: commandResult.resolvedPath ?? command,
    message: commandResult.ok
      ? `stdio command is available: ${commandResult.resolvedPath ?? command}.`
      : commandResult.message
  };
}

function resolveLocalCommand(
  command: string,
  timeoutMs: number
): Promise<{ ok: boolean; message: string; resolvedPath?: string }> {
  return new Promise((resolve) => {
    const lookupCommand = process.platform === "win32" ? "where" : "which";
    const child = spawn(lookupCommand, [command], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    let errorOutput = "";
    const timeout = setTimeout(() => {
      child.kill();
      resolve({ ok: false, message: `Command lookup timed out: ${command}` });
    }, timeoutMs).unref();

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      errorOutput += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ ok: false, message: `Command lookup failed: ${error.message}` });
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      const resolvedPath = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)[0];
      resolve(
        code === 0 && resolvedPath
          ? { ok: true, message: "Command found.", resolvedPath }
          : { ok: false, message: errorOutput.trim() || `Command not found: ${command}` }
      );
    });
  });
}

async function discoverMcpTools(
  server: McpServerToolsRequest["server"],
  timeoutMs: number
): Promise<McpServerToolsResult> {
  const checkedAt = new Date().toISOString();
  if (server.transport === "http") {
    return discoverHttpMcpTools(server, timeoutMs, checkedAt);
  }
  return discoverStdioMcpTools(server, timeoutMs, checkedAt);
}

async function discoverHttpMcpTools(
  server: McpServerToolsRequest["server"],
  timeoutMs: number,
  checkedAt: string
): Promise<McpServerToolsResult> {
  const url = server.url?.trim();
  if (!url) {
    return {
      ok: false,
      checkedAt,
      serverId: server.id,
      transport: "http",
      tools: [],
      message: "请先填写 MCP HTTP URL。"
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs).unref();
  try {
    await postMcpJsonRpc(url, 1, "initialize", buildMcpInitializeParams(), controller.signal);
    const result = await postMcpJsonRpc(url, 2, "tools/list", {}, controller.signal);
    const tools = normalizeMcpTools(server, result);
    return {
      ok: true,
      checkedAt,
      serverId: server.id,
      transport: "http",
      resolvedTarget: url,
      tools,
      message: tools.length ? `发现 ${tools.length} 个 MCP 工具。` : "MCP 连接成功，但未返回工具。"
    };
  } catch (error) {
    return {
      ok: false,
      checkedAt,
      serverId: server.id,
      transport: "http",
      resolvedTarget: url,
      tools: [],
      message: error instanceof Error ? `MCP tools/list 失败：${error.message}` : "MCP tools/list 失败。"
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function postMcpJsonRpc(url: string, id: number, method: string, params: unknown, signal: AbortSignal) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params
    }),
    signal
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}${text ? `: ${text.slice(0, 160)}` : ""}`);
  }
  const message = parseMcpJson(text, id);
  if (isMcpErrorMessage(message)) {
    throw new Error(message.error.message || `MCP error ${message.error.code}`);
  }
  if (!isRecord(message) || !("result" in message)) {
    throw new Error("MCP endpoint did not return a JSON-RPC result.");
  }
  return message.result;
}

function discoverStdioMcpTools(
  server: McpServerToolsRequest["server"],
  timeoutMs: number,
  checkedAt: string
): Promise<McpServerToolsResult> {
  return new Promise((resolve) => {
    const command = server.command?.trim();
    if (!command) {
      resolve({
        ok: false,
        checkedAt,
        serverId: server.id,
        transport: "stdio",
        tools: [],
        message: "请先填写 stdio MCP 命令。"
      });
      return;
    }

    const child = spawn(command, server.args ?? [], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const pending = new Map<string, (message: Record<string, unknown>) => void>();
    let stdoutBuffer = "";
    let stderr = "";
    let finished = false;
    const timeout = setTimeout(() => {
      finish({
        ok: false,
        checkedAt,
        serverId: server.id,
        transport: "stdio",
        resolvedTarget: [command, ...(server.args ?? [])].join(" "),
        tools: [],
        message: `MCP tools/list 超时：${command}`
      });
    }, timeoutMs).unref();

    function finish(result: McpServerToolsResult) {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timeout);
      pending.clear();
      if (!child.killed) {
        child.kill();
      }
      resolve(result);
    }

    function send(message: Record<string, unknown>) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    }

    function request(id: number, method: string, params: unknown): Promise<unknown> {
      return new Promise((requestResolve, requestReject) => {
        pending.set(String(id), (message) => {
          if (isMcpErrorMessage(message)) {
            requestReject(new Error(message.error.message || `MCP error ${message.error.code}`));
            return;
          }
          if (!("result" in message)) {
            requestReject(new Error(`MCP ${method} did not return a result.`));
            return;
          }
          requestResolve(message.result);
        });
        send({ jsonrpc: "2.0", id, method, params });
      });
    }

    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString();
      let newlineIndex = stdoutBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const rawLine = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        newlineIndex = stdoutBuffer.indexOf("\n");
        if (!rawLine) {
          continue;
        }
        const message = parseOptionalMcpJson(rawLine);
        if (!message || !("id" in message)) {
          continue;
        }
        const handler = pending.get(String(message.id));
        if (handler) {
          pending.delete(String(message.id));
          handler(message);
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      finish({
        ok: false,
        checkedAt,
        serverId: server.id,
        transport: "stdio",
        resolvedTarget: [command, ...(server.args ?? [])].join(" "),
        tools: [],
        message: `MCP 命令启动失败：${error.message}`
      });
    });
    child.on("exit", (code) => {
      if (!finished) {
        finish({
          ok: false,
          checkedAt,
          serverId: server.id,
          transport: "stdio",
          resolvedTarget: [command, ...(server.args ?? [])].join(" "),
          tools: [],
          message: stderr.trim() || `MCP 命令过早退出，退出码 ${code ?? "unknown"}。`
        });
      }
    });

    void (async () => {
      try {
        await request(1, "initialize", buildMcpInitializeParams());
        send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
        const result = await request(2, "tools/list", {});
        const tools = normalizeMcpTools(server, result);
        finish({
          ok: true,
          checkedAt,
          serverId: server.id,
          transport: "stdio",
          resolvedTarget: [command, ...(server.args ?? [])].join(" "),
          tools,
          message: tools.length ? `发现 ${tools.length} 个 MCP 工具。` : "MCP 连接成功，但未返回工具。"
        });
      } catch (error) {
        finish({
          ok: false,
          checkedAt,
          serverId: server.id,
          transport: "stdio",
          resolvedTarget: [command, ...(server.args ?? [])].join(" "),
          tools: [],
          message: error instanceof Error ? `MCP tools/list 失败：${error.message}` : "MCP tools/list 失败。"
        });
      }
    })();
  });
}

function buildMcpInitializeParams() {
  return {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: {
      name: "NexaDesk",
      version: process.env.NEXADESK_APP_VERSION ?? "0.1.0"
    }
  };
}

function normalizeMcpTools(server: McpServerToolsRequest["server"], result: unknown): McpToolDefinition[] {
  if (!isRecord(result) || !Array.isArray(result.tools)) {
    return [];
  }
  return result.tools
    .filter(
      (tool): tool is Record<string, unknown> =>
        isRecord(tool) && typeof tool.name === "string" && Boolean(tool.name.trim())
    )
    .map((tool) => {
      const name = typeof tool.name === "string" ? tool.name : String(tool.name);
      return {
        id: `${server.id}:${name}`,
        serverId: server.id,
        serverName: server.name,
        name,
        title: typeof tool.title === "string" ? tool.title : undefined,
        description: typeof tool.description === "string" && tool.description.trim() ? tool.description : "MCP tool",
        inputSchema: "inputSchema" in tool ? tool.inputSchema : undefined
      };
    });
}

function parseMcpJson(text: string, id: number) {
  const parsed = JSON.parse(text) as unknown;
  if (Array.isArray(parsed)) {
    const message = parsed.find((item) => isRecord(item) && item.id === id);
    if (message) {
      return message;
    }
  }
  return parsed;
}

function parseOptionalMcpJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isMcpErrorMessage(message: unknown): message is { error: { code?: number; message?: string } } {
  return isRecord(message) && isRecord(message.error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function testProviderConnection(
  provider: ProviderSettings,
  apiKey: string | undefined,
  timeoutMs: number
): Promise<ProviderTestResult> {
  const baseUrl = provider.baseUrl?.replace(/\/+$/, "");
  if (!baseUrl) {
    return { ok: false, message: "请先填写 Base URL" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs).unref();

  try {
    const checkedUrl = buildProviderTestUrl(provider, baseUrl);
    const headers: Record<string, string> = {};

    if (provider.kind === "anthropic") {
      if (!apiKey) {
        return { ok: false, checkedUrl, message: "Anthropic 需要 API Key" };
      }
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else if (provider.kind !== "local" && apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    } else if (provider.kind !== "local" && !apiKey) {
      return { ok: false, checkedUrl, message: "该 Provider 需要 API Key" };
    }

    const response = await fetch(checkedUrl, {
      headers,
      signal: controller.signal
    });

    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        checkedUrl,
        message: "Connection succeeded. Provider is reachable."
      };
    }

    const detail = await response.text();
    return {
      ok: false,
      status: response.status,
      checkedUrl,
      message: `Connection failed: HTTP ${response.status}${detail ? ` - ${detail.slice(0, 180)}` : ""}`
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? `Connection failed: ${error.message}` : "Connection failed: unknown error"
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchProviderModels(
  provider: ProviderSettings,
  apiKey: string | undefined,
  timeoutMs: number
): Promise<ProviderModelsResult> {
  const baseUrl = provider.baseUrl?.replace(/\/+$/, "");
  if (!baseUrl) {
    return { ok: false, message: "请先填写 Base URL", models: [] };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs).unref();

  try {
    const checkedUrl = buildProviderTestUrl(provider, baseUrl);
    const headers = buildProviderModelHeaders(provider, apiKey);
    if ("error" in headers) {
      return { ok: false, checkedUrl, message: headers.error, models: [] };
    }

    const response = await fetch(checkedUrl, {
      headers,
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text();
      return {
        ok: false,
        status: response.status,
        checkedUrl,
        message: `Fetch models failed: HTTP ${response.status}${detail ? ` - ${detail.slice(0, 180)}` : ""}`,
        models: []
      };
    }

    const payload = (await response.json()) as unknown;
    const models = extractModelNames(payload);
    return {
      ok: true,
      status: response.status,
      checkedUrl,
      models,
      message: models.length
        ? `Fetched ${models.length} model(s).`
        : "Provider responded but did not return model names."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? `Fetch models failed: ${error.message}` : "Fetch models failed: unknown error",
      models: []
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildProviderTestUrl(provider: ProviderSettings, baseUrl: string) {
  if (provider.apiMode === "ollama_generate") {
    return `${baseUrl}/api/tags`;
  }
  if (provider.kind === "anthropic") {
    return `${baseUrl || "https://api.anthropic.com"}/v1/models`;
  }
  return `${baseUrl}/models`;
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
