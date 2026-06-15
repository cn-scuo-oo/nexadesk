// @ts-nocheck
import type { Express } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { snapshot, runtimeTelemetry, setRuntimeTelemetry, pendingToolApprovals, syncSessionAgents, persistRuntimeState, sortSessions, updateToolCall } from "./state.js";
import { loadSettings, getProviderApiKey } from "./settings-store.js";
import { ProviderRuntimeError, streamProviderEvents, type RuntimeChatMessage, type RuntimeStreamEvent } from "./provider-runtime.js";
import { canRunExternalAgentEngine, streamExternalAgentEvents } from "./external-agent-runtime.js";
import { parseToolRequests, prepareToolRequest, executeToolRequest, summarizeToolRequest, type AgentToolContext, type AgentToolRequest } from "./agent-tools.js";
import { publishActivity } from "./events.js";
import { persistTelemetryEntry } from "./runtime-state-store.js";
import { estimateTokenCount, formatRuntimeError, getEnv } from "./server-utils.js";
import type { ChatStreamEvent, ChatMessage, SendMessageRequest, RuntimeTelemetryEntry, ActivityEvent, ProviderSettings, AgentEngineSettings } from "@nexadesk/shared";

export function appendToolMessage(sessionId: string, toolName: string, content: string) {
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

export async function createToolContext(settings: AppSettings): Promise<AgentToolContext> {
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

export function registerSessionsRoutes(app: Express): void {
  app.get("/api/sessions", (_req, res) => { res.json(snapshot.sessions); });
const sessionPatchSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  pinned: z.boolean().optional()
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
}
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

  // Create and push user/assistant messages BEFORE resolveRuntime so that
  // user messages are always persisted even if provider resolution fails.
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
        summary: externalEngine ? `${externalEngine.name} / codex exec (read-only)` : "Resolving model…"
      }
    ]
  };

  snapshot.messages.push(userMessage, assistantMessage);
  onEvent?.({ type: "user_message", message: userMessage });

  const runtime: ResolvedModelRuntime | undefined = externalEngine
    ? undefined
    : await resolveRuntime(settings, input.providerId, input.model, activeAgent?.providerId);

  // Update the tool summary with resolved runtime info
  if (runtime && assistantMessage.toolCalls) {
    assistantMessage.toolCalls = assistantMessage.toolCalls.map((tool) =>
      tool.name === "model.stream" ? { ...tool, summary: modelRuntimeLabel(runtime) } : tool
    );
  }

  let activityDetail = externalEngine
    ? `${externalEngine.name} used codex exec in read-only mode to answer a workbench message.`
    : `${runtime?.provider.name} used ${runtime?.model} to answer a workbench message.`;

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
