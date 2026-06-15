import type { Request, Response } from "express";
import { runAgentLoop, type AgentEngineEvent } from "./agent-engine.js";
import type { RuntimeChatMessage } from "./provider-runtime.js";
import type { AgentToolContext } from "./agent-tools.js";
import type { ProviderSettings, WorkspaceSettings } from "@nexadesk/shared";

// ──────────────────────────────────────────────────────────
//  NexaDesk Agent API Routes
//  Provides SSE endpoints for the built-in agent engine
// ──────────────────────────────────────────────────────────

type AgentChatRequest = {
  provider: ProviderSettings;
  model: string;
  apiKey?: string;
  messages: RuntimeChatMessage[];
  workspace: WorkspaceSettings;
  autoApprove?: boolean;
};

/**
 * POST /api/agent/chat
 * Streams agent responses via Server-Sent Events (SSE).
 *
 * Request body: AgentChatRequest
 * Response: text/event-stream
 *
 * Event types:
 *   text_delta     - Incremental text from the LLM
 *   tool_start     - A tool call is starting
 *   tool_result    - A tool call completed
 *   approval_needed - A high-risk tool needs user approval
 *   error          - An error occurred
 *   done           - Agent loop finished
 */
export async function handleAgentChat(req: Request, res: Response) {
  const body = req.body as AgentChatRequest;

  // Validate required fields
  if (!body.provider || !body.model || !body.messages?.length || !body.workspace) {
    res.status(400).json({
      error: "缺少必要字段：provider, model, messages, workspace"
    });
    return;
  }

  // Set up SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no" // Disable nginx buffering
  });

  // Send heartbeat every 15 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15_000);

  // Clean up on client disconnect
  let closed = false;
  req.on("close", () => {
    closed = true;
    clearInterval(heartbeat);
  });

  try {
    const imageConfig = process.env.NEXADESK_IMAGE_BASE_URL
      ? {
          baseUrl: process.env.NEXADESK_IMAGE_BASE_URL,
          apiKey: process.env.NEXADESK_IMAGE_API_KEY,
          model: process.env.NEXADESK_IMAGE_MODEL || "dall-e-3",
          outputDirectory: body.workspace.defaultWorkspace || "."
        }
      : undefined;

    const agentRequest = {
      provider: body.provider,
      model: body.model,
      apiKey: body.apiKey,
      messages: body.messages,
      workspace: body.workspace,
      image: imageConfig,
      onApproval: body.autoApprove
        ? undefined // Will auto-reject high-risk
        : async (toolCallId: string, tool: string, summary: string): Promise<boolean> => {
            // In API mode without approval callback, auto-approve medium risk, reject high risk
            return false;
          }
    };

    // Stream agent events
    for await (const event of runAgentLoop(agentRequest)) {
      if (closed) break;

      const sseData = formatSSE(event);
      res.write(sseData);
    }

    if (!closed) {
      res.write("data: [DONE]\n\n");
    }
  } catch (error) {
    if (!closed) {
      const errorEvent: AgentEngineEvent = {
        type: "error",
        message: error instanceof Error ? error.message : "Agent 执行失败"
      };
      res.write(formatSSE(errorEvent));
      res.write("data: [DONE]\n\n");
    }
  } finally {
    clearInterval(heartbeat);
    if (!closed) {
      res.end();
    }
  }
}

/**
 * POST /api/agent/approve
 * Approves or rejects a pending tool call.
 *
 * In the current implementation, the agent loop runs synchronously,
 * so approval is handled within the same SSE stream.
 * This endpoint is reserved for future async approval flows.
 */
export function handleAgentApproval(req: Request, res: Response) {
  const { toolCallId, approved } = req.body;
  if (!toolCallId) {
    res.status(400).json({ error: "缺少 toolCallId" });
    return;
  }
  res.json({ status: "ok", toolCallId, approved: !!approved });
}

/** Format an AgentEngineEvent as an SSE message */
function formatSSE(event: AgentEngineEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
