import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  ActivityEvent,
  AgentProfile,
  AppSettings,
  AppSnapshot,
  ApprovalHistoryEntry,
  ChatMessage,
  ChatStreamEvent,
  PermissionRequest,
  ResolveApprovalRequest,
  RuntimeTelemetryEntry,
  SendMessageRequest,
  ModelProvider
} from "@nexadesk/shared";
import {
  executeToolRequest,
  parseToolRequests,
  prepareToolRequest,
  summarizeToolRequest,
  type AgentToolContext,
  type AgentToolRequest
} from "../agent-tools.js";
import { canRunExternalAgentEngine, streamExternalAgentEvents } from "../external-agent-runtime.js";
import { estimateTokenCount, formatRuntimeError, getEnv } from "../server-utils.js";
import { getProviderApiKey } from "../settings-store.js";
import {
  ProviderRuntimeError,
  streamProviderEvents,
  type RuntimeChatMessage,
  type RuntimeStreamEvent
} from "../provider-runtime.js";
import { persistTelemetryEntry, type PendingToolApprovalRecord } from "../runtime-state-store.js";

export type SessionWorkflowContext = {
  snapshot: AppSnapshot;
  runtimeTelemetry: RuntimeTelemetryEntry[];
  pendingToolApprovals: Map<string, Omit<PendingToolApprovalRecord, "approvalId">>;
  loadSettings: (providers: ModelProvider[]) => Promise<AppSettings>;
  persistRuntimeState: () => Promise<void>;
  publishActivity: (input: { level: "info" | "warning" | "error"; title: string; detail: string }) => ActivityEvent;
  syncSessionAgents: () => void;
};

type ResolvedModelRuntime = Awaited<ReturnType<typeof resolveRuntime>>;

export async function runSessionMessageExchange(
  context: SessionWorkflowContext,
  sessionId: string,
  input: SendMessageRequest,
  onEvent?: (event: ChatStreamEvent) => void
): Promise<{ messages: ChatMessage[]; activity: ActivityEvent }> {
  const session = context.snapshot.sessions.find((item) => item.id === sessionId);
  if (!session) {
    throw new ProviderRuntimeError("Session not found");
  }

  const settings = await context.loadSettings(context.snapshot.providers);
  context.snapshot.providers = settings.providers;
  context.snapshot.agents = settings.assistant.agents;
  context.snapshot.skills = settings.assistant.skills;
  context.syncSessionAgents();

  const activeAgent =
    context.snapshot.agents.find((agent) => agent.id === input.agentId && agent.enabled) ??
    context.snapshot.agents.find((agent) => agent.id === session.activeAgentId && agent.enabled) ??
    context.snapshot.agents.find((agent) => agent.enabled);
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

  context.snapshot.messages.push(userMessage, assistantMessage);
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
  upsertRuntimeTelemetry(context, telemetryBase);

  const markFirstToken = () => {
    firstTokenMs ??= Math.max(0, Date.now() - runtimeStartedMs);
  };

  try {
    const history = buildRuntimeMessages(context, session.id, activeAgent, settings);
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
        context,
        toolRequests,
        assistantMessage,
        activeAgentId: activeAgent?.id ?? session.activeAgentId,
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
    const activity = context.publishActivity({
      level: "info",
      title: "模型回答完成",
      detail: activityDetail
    });
    const outputTokens = estimateTokenCount(assistantMessage.content);
    upsertRuntimeTelemetry(context, {
      ...telemetryBase,
      completedAt: assistantMessage.createdAt,
      firstTokenMs,
      durationMs: Math.max(0, Date.now() - runtimeStartedMs),
      outputTokens,
      totalTokens: telemetryBase.inputTokens + outputTokens,
      status: "completed"
    });
    context.snapshot.activity.unshift(activity);
    await context.persistRuntimeState();
    onEvent?.({ type: "assistant_done", message: assistantMessage, activity });

    return { messages: [userMessage, assistantMessage], activity };
  } catch (error) {
    const message = formatRuntimeError(error);
    assistantMessage.toolCalls = assistantMessage.toolCalls?.map((tool) =>
      tool.name === "model.stream" ? { ...tool, status: "failed", summary: `${tool.summary} · ${message}` } : tool
    );
    upsertRuntimeTelemetry(context, {
      ...telemetryBase,
      completedAt: new Date().toISOString(),
      firstTokenMs,
      durationMs: Math.max(0, Date.now() - runtimeStartedMs),
      outputTokens: estimateTokenCount(assistantMessage.content),
      totalTokens: telemetryBase.inputTokens + estimateTokenCount(assistantMessage.content),
      status: "failed",
      error: message
    });
    await context.persistRuntimeState();
    throw error;
  }
}

export async function resolveApprovalRequest(
  context: SessionWorkflowContext,
  approvalId: string,
  body: ResolveApprovalRequest
): Promise<{ approval: PermissionRequest; history: ApprovalHistoryEntry; activity: ActivityEvent; messages: ChatMessage[] }> {
  const approvalIndex = context.snapshot.approvals.findIndex((item) => item.id === approvalId);
  if (approvalIndex === -1) {
    throw new ProviderRuntimeError("Approval not found");
  }

  const [approval] = context.snapshot.approvals.splice(approvalIndex, 1);
  if (!approval) {
    throw new ProviderRuntimeError("Approval not found");
  }

  const pending = context.pendingToolApprovals.get(approvalId);
  const messages: ChatMessage[] = [];
  const reason = body.reason?.trim();

  if (!body.approved) {
    if (pending) {
      updateToolCall(context.snapshot, pending.messageId, pending.toolCallId, "rejected");
      context.pendingToolApprovals.delete(approvalId);
    }
    const history = pushApprovalHistory(context.snapshot, approval, "rejected", { reason });
    const activity = context.publishActivity({
      level: "warning",
      title: "审批已拒绝",
      detail: `${approval.action}${reason ? `；原因：${reason}` : "；未填写拒绝原因"}`
    });
    context.snapshot.activity.unshift(activity);
    await context.persistRuntimeState();
    return { approval, history, activity, messages };
  }

  if (!pending) {
    const history = pushApprovalHistory(context.snapshot, approval, "failed", {
      reason: "审批请求的执行上下文不存在，可能来自旧版本状态或服务重启前未保存的请求。"
    });
    const activity = context.publishActivity({
      level: "error",
      title: "审批无法执行",
      detail: `${approval.action}；执行上下文不存在。`
    });
    context.snapshot.activity.unshift(activity);
    await context.persistRuntimeState();
    return { approval, history, activity, messages };
  }

  updateToolCall(context.snapshot, pending.messageId, pending.toolCallId, "running");
  const settings = await context.loadSettings(context.snapshot.providers);
  const result = await executeToolRequest(pending.request, await createToolContext(settings));
  const toolMessage = appendToolMessage(context.snapshot, pending.sessionId, pending.request.tool, result);
  messages.push(toolMessage);
  updateToolCall(context.snapshot, pending.messageId, pending.toolCallId, "completed");
  context.pendingToolApprovals.delete(approvalId);
  const history = pushApprovalHistory(context.snapshot, approval, "approved", {
    resultSummary: result.slice(0, 500)
  });
  const activity = context.publishActivity({
    level: "info",
    title: "审批已通过",
    detail: approval.action
  });
  context.snapshot.activity.unshift(activity);
  await context.persistRuntimeState();
  return { approval, history, activity, messages };
}

function resolveRuntime(
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

  return getProviderApiKey(provider.id).then((apiKey) => {
    if (provider.kind !== "local" && !apiKey) {
      throw new ProviderRuntimeError(`Provider ${provider.name} needs a saved API key first.`);
    }
    return { provider, model, apiKey };
  });
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
  engine: AppSettings["assistant"]["engines"][number],
  fallbackRuntime: ResolvedModelRuntime,
  error: unknown
) {
  return `\n\n${engine.name} 暂不可用，已回退到 ${fallbackRuntime.provider.name} / ${fallbackRuntime.model}。原因：${formatRuntimeError(error)}\n\n`;
}

function upsertRuntimeTelemetry(context: SessionWorkflowContext, entry: RuntimeTelemetryEntry) {
  const nextTelemetry = [entry, ...context.runtimeTelemetry.filter((item) => item.id !== entry.id)].slice(0, 100);
  context.runtimeTelemetry.splice(0, context.runtimeTelemetry.length, ...nextTelemetry);
  persistTelemetryEntry(entry);
}

function updateModelStreamSummary(assistantMessage: ChatMessage, summary: string) {
  assistantMessage.toolCalls = assistantMessage.toolCalls?.map((tool) =>
    tool.name === "model.stream" ? { ...tool, summary } : tool
  );
}

function buildRuntimeMessages(
  context: SessionWorkflowContext,
  sessionId: string,
  activeAgent: AgentProfile | undefined,
  settings: AppSettings
): RuntimeChatMessage[] {
  const recentMessages = context.snapshot.messages
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

async function handleAgentToolRequests({
  context,
  toolRequests,
  assistantMessage,
  activeAgentId,
  onEvent
}: {
  context: SessionWorkflowContext;
  toolRequests: AgentToolRequest[];
  assistantMessage: ChatMessage;
  activeAgentId: string;
  onEvent?: (event: ChatStreamEvent) => void;
}) {
  const settings = await context.loadSettings(context.snapshot.providers);
  const toolContext = await createToolContext(settings);
  const resultLines: string[] = [];
  const approvalLines: string[] = [];

  for (const request of toolRequests.slice(0, 6)) {
    const execution = await prepareToolRequest(request, toolContext);
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
      context.pendingToolApprovals.set(approval.id, {
        request,
        sessionId: assistantMessage.sessionId,
        agentId: activeAgentId,
        messageId: assistantMessage.id,
        toolCallId: execution.toolCall.id
      });
      context.snapshot.approvals.unshift(approval);
      onEvent?.({ type: "approval_queued", approval });
      approvalLines.push(`已进入审批队列：${approval.action}`);
      continue;
    }

    const toolMessage = appendToolMessage(context.snapshot, assistantMessage.sessionId, execution.toolCall.name, execution.result ?? "");
    onEvent?.({ type: "tool_message", message: toolMessage });
    resultLines.push(`工具 ${execution.toolCall.name} 已完成，结果已追加为工具消息。`);
  }

  return [...resultLines, ...approvalLines].length
    ? `工具状态：\n${[...resultLines, ...approvalLines].join("\n\n")}`
    : "";
}

function appendToolMessage(snapshot: AppSnapshot, sessionId: string, toolName: string, content: string) {
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

function pushApprovalHistory(
  snapshot: AppSnapshot,
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
  snapshot: AppSnapshot,
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
