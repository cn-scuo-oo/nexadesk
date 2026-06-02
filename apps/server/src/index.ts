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
  type ChatStreamEvent,
  type ChatMessage,
  type DesktopStatus,
  type PermissionRequest,
  type ProviderModelsRequest,
  type ProviderModelsResult,
  type ProviderSettings,
  type ProviderStatusRecord,
  type ProviderModelsStatusRecord,
  type ProviderTestRequest,
  type ProviderTestResult,
  type RecoverSettingsRequest,
  type ResolveApprovalRequest,
  type SaveSettingsRequest,
  type SendMessageRequest
} from "@nexadesk/shared";
import {
  executeToolRequest,
  listWorkspaceDirectory,
  parseToolRequests,
  prepareToolRequest,
  readWorkspaceFilePreview,
  searchWorkspaceFiles,
  summarizeToolRequest,
  type AgentToolContext,
  type AgentToolRequest
} from "./agent-tools.js";
import { addEventClient, publishActivity } from "./events.js";
import { ProviderRuntimeError, streamProviderEvents, type RuntimeChatMessage } from "./provider-runtime.js";
import {
  loadRuntimeState,
  runtimeStatePath,
  saveRuntimeState,
  type PendingToolApprovalRecord
} from "./runtime-state-store.js";
import { getProviderApiKey, loadSettings, recoverSettings, saveSettings } from "./settings-store.js";

const host = getEnv("NEXADESK_HOST", "AION_LITE_HOST") ?? "127.0.0.1";
const port = Number(getEnv("NEXADESK_PORT", "AION_LITE_PORT") ?? 3939);
const snapshot = createDemoSnapshot();
const app = express();
const pendingToolApprovals = new Map<
  string,
  Omit<PendingToolApprovalRecord, "approvalId">
>();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

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

app.get("/api/events", (req, res) => {
  req.socket.setTimeout(0);
  res.writeHead(200, {
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream"
  });
  addEventClient(res);
});

app.get("/api/settings", async (_req, res, next) => {
  try {
    res.json(await loadSettings(snapshot.providers));
  } catch (error) {
    next(error);
  }
});

app.get("/api/workspace/list", async (req, res, next) => {
  try {
    const settings = await loadSettings(snapshot.providers);
    const path = typeof req.query.path === "string" ? req.query.path : ".";
    res.json(await listWorkspaceDirectory(settings.workspace, path));
  } catch (error) {
    next(error);
  }
});

app.get("/api/workspace/file", async (req, res, next) => {
  try {
    const settings = await loadSettings(snapshot.providers);
    const path = typeof req.query.path === "string" ? req.query.path : "";
    res.json(await readWorkspaceFilePreview(settings.workspace, path));
  } catch (error) {
    next(error);
  }
});

app.get("/api/workspace/search", async (req, res, next) => {
  try {
    const settings = await loadSettings(snapshot.providers);
    const query = typeof req.query.query === "string" ? req.query.query : "";
    const path = typeof req.query.path === "string" ? req.query.path : ".";
    const mode = req.query.mode === "content" ? "content" : "name";
    res.json(await searchWorkspaceFiles({ workspace: settings.workspace, query, mode, inputPath: path }));
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
    const detections = await Promise.all(settings.assistant.engines.map((engine) => detectAgentEngine(engine, checkedAt)));
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

app.post("/api/providers/test", async (req, res, next) => {
  try {
    const body = req.body as ProviderTestRequest;
    if (!body?.provider?.id) {
      res.status(400).json({ ok: false, message: "Invalid provider payload" });
      return;
    }

    const storedKey = await getProviderApiKey(body.provider.id);
    const result = withCheckedAt(await testProviderConnection(
      body.provider,
      body.apiKey?.trim() || storedKey,
      body.timeoutMs ?? 8000
    ));
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
    const result = withCheckedAt(await fetchProviderModels(
      body.provider,
      body.apiKey?.trim() || storedKey,
      body.timeoutMs ?? 10000
    ));
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
  const runtime = await resolveRuntime(settings, input.providerId, input.model, activeAgent?.providerId);
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
        summary: `${runtime.provider.name} / ${runtime.model}`
      }
    ]
  };

  snapshot.messages.push(userMessage, assistantMessage);
  onEvent?.({ type: "user_message", message: userMessage });
  onEvent?.({
    type: "assistant_start",
    message: assistantMessage,
    provider: { id: runtime.provider.id, name: runtime.provider.name, model: runtime.model }
  });

  const history = buildRuntimeMessages(session.id, activeAgent, settings);
  let assistantContent = "";

  const nativeToolRequests: AgentToolRequest[] = [];
  for await (const event of streamProviderEvents({
    provider: runtime.provider,
    model: runtime.model,
    apiKey: runtime.apiKey,
    messages: history
  })) {
    if (event.type === "text") {
      assistantContent += event.delta;
      onEvent?.({ type: "assistant_delta", messageId: assistantMessage.id, delta: event.delta });
    } else {
      nativeToolRequests.push(event.request);
    }
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
    detail: `${runtime.provider.name} used ${runtime.model} to answer a workbench message.`
  });
  snapshot.activity.unshift(activity);
  await persistRuntimeState();
  onEvent?.({ type: "assistant_done", message: assistantMessage, activity });

  return { messages: [userMessage, assistantMessage], activity };
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

  return [
    {
      role: "system",
      content:
        [
          `You are NexaDesk ${activeAgent ? `"${activeAgent.name}"` : "Cowork Agent"}. Reply in Chinese and help the user directly.`,
          activeAgent?.instructions ??
            "Understand the goal, break it into steps, request tools when needed, and wait for approval before high-risk actions.",
          enabledSkills.length
            ? `Enabled skills:\n${enabledSkills.map((skill) => `- ${skill.name}: ${skill.instructions}`).join("\n")}`
            : "No enabled skills are bound to this assistant.",
          "When you need a tool, output a fenced block at the end:",
          "```nexadesk-tool",
          "{\"tool\":\"list_dir\",\"path\":\".\"}",
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
    image: apiKey || imageBaseUrl
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
    safeStorage: (getEnv("NEXADESK_SAFE_STORAGE", "AION_LITE_SAFE_STORAGE") as DesktopStatus["safeStorage"]) ?? "unavailable",
    secretsEncrypted: Boolean(getEnv("NEXADESK_SECRET_KEY", "AION_LITE_SECRET_KEY"))
  };
}

function getEnv(name: string, legacyName: string) {
  return process.env[name] ?? process.env[legacyName];
}

async function persistRuntimeState() {
  try {
    await saveRuntimeState(snapshot, pendingToolApprovalRecords());
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

function updateToolCall(messageId: string, toolCallId: string, status: NonNullable<ChatMessage["toolCalls"]>[number]["status"]) {
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
  app.listen(port, host, () => {
    console.log(`NexaDesk API listening on http://${host}:${port}`);
  });
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
      message: models.length ? `Fetched ${models.length} model(s).` : "Provider responded but did not return model names."
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

async function detectAgentEngine(
  engine: AgentEngineSettings,
  checkedAt: string
): Promise<AgentEngineDetectionRecord> {
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
    return null;
  }
  const resolvedPath = firstOutputLine(result.stdout);
  return { resolvedPath };
}

function hasPathSegment(command: string) {
  return path.isAbsolute(command) || command.includes("/") || command.includes("\\");
}

async function readCommandVersion(command: string): Promise<string | undefined> {
  const result = await runProcess(command, ["--version"], 2500);
  const output = firstOutputLine(result.stdout) || firstOutputLine(result.stderr);
  if (result.code !== 0 || !output) {
    return undefined;
  }
  return output.slice(0, 160);
}

function firstOutputLine(output: string) {
  return output
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .find(Boolean);
}

function runProcess(
  command: string,
  args: string[],
  timeoutMs: number
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });
    } catch {
      resolve({ code: null, stdout: "", stderr: "" });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (code: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    };
    const limitAppend = (current: string, chunk: Buffer) => `${current}${chunk.toString()}`.slice(0, 12000);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = limitAppend(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = limitAppend(stderr, chunk);
    });
    child.on("error", () => settle(null));
    child.on("exit", (code) => settle(code));
    const timeout = setTimeout(() => {
      child.kill();
      settle(null);
    }, timeoutMs);
    timeout.unref();
  });
}

async function findAgentEngineConfigPath(engine: AgentEngineSettings): Promise<string | undefined> {
  const candidates = uniqueStrings([engine.configPath, ...getAgentEngineConfigCandidates(engine.id)]);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Keep scanning candidate paths.
    }
  }
  return undefined;
}

function getAgentEngineConfigCandidates(engineId: AgentEngineId) {
  const home = homedir();
  const candidates: Record<AgentEngineId, string[]> = {
    nexadesk_builtin: [],
    codex_cli: [
      path.join(home, ".codex", "config.toml"),
      path.join(home, ".codex")
    ],
    claude_code: [
      path.join(home, ".claude", "settings.json"),
      path.join(home, ".claude.json"),
      path.join(home, ".claude")
    ],
    openclaw: [
      path.join(home, ".openclaw", "openclaw.json"),
      path.join(home, ".openclaw")
    ],
    hermes: [
      path.join(home, ".hermes", "config.yaml"),
      path.join(home, ".hermes")
    ],
    opencode: [
      path.join(home, ".opencode", "config.json"),
      path.join(home, ".opencode")
    ],
    qwen_code: [
      path.join(home, ".qwen", "settings.json"),
      path.join(home, ".qwen-code"),
      path.join(home, ".qwen")
    ],
    deepseek_tui: [
      path.join(home, ".deepseek-tui", "config.json"),
      path.join(home, ".deepseek", "config.json"),
      path.join(home, ".deepseek-tui"),
      path.join(home, ".deepseek")
    ]
  };
  return candidates[engineId] ?? [];
}

async function persistProviderStatus(
  providerId: string,
  update: { test?: ProviderStatusRecord; modelRefresh?: ProviderModelsStatusRecord }
) {
  const settings = await loadSettings(snapshot.providers);
  if (!settings.providers.some((provider) => provider.id === providerId)) {
    return;
  }

  const saved = await saveSettings(
    {
      ...settings,
      providerStatus: {
        tests: {
          ...settings.providerStatus.tests,
          ...(update.test ? { [providerId]: update.test } : {})
        },
        modelRefreshes: {
          ...settings.providerStatus.modelRefreshes,
          ...(update.modelRefresh ? { [providerId]: update.modelRefresh } : {})
        }
      }
    },
    snapshot.providers
  );
  snapshot.providers = saved.providers;
}

function withCheckedAt<T extends { checkedAt?: string }>(result: T): T & { checkedAt: string } {
  return {
    ...result,
    checkedAt: new Date().toISOString()
  };
}

function buildProviderModelHeaders(provider: ProviderSettings, apiKey: string | undefined): Record<string, string> | { error: string } {
  if (provider.kind === "anthropic") {
    if (!apiKey) {
      return { error: "Anthropic 需要 API Key" };
    }
    return {
      "anthropic-version": "2023-06-01",
      "x-api-key": apiKey
    };
  }

  if (provider.kind === "local") {
    return {};
  }

  if (!apiKey) {
    return { error: "该 Provider 需要 API Key" };
  }

  return {
    Authorization: `Bearer ${apiKey}`
  };
}

function extractModelNames(payload: unknown): string[] {
  const names = new Set<string>();
  collectModelNames(payload, names);
  return Array.from(names);
}

function collectModelNames(value: unknown, names: Set<string>) {
  if (typeof value === "string") {
    addModelName(names, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectModelNames(item, names);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  const directName = record.id ?? record.name ?? record.model;
  if (typeof directName === "string") {
    addModelName(names, directName);
  }

  if (Array.isArray(record.data)) {
    collectModelNames(record.data, names);
  }
  if (Array.isArray(record.models)) {
    collectModelNames(record.models, names);
  }
}

function addModelName(names: Set<string>, value: string) {
  const name = value.trim();
  if (name) {
    names.add(name);
  }
}
