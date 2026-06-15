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
 */
export async function handleAgentChat(req: Request, res: Response) {
  const body = req.body as AgentChatRequest;

  if (!body.provider || !body.model || !body.messages?.length || !body.workspace) {
    res.status(400).json({ error: "Missing required fields: provider, model, messages, workspace" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });

  const heartbeat = setInterval(() => { res.write(": heartbeat\n\n"); }, 15_000);
  let closed = false;
  req.on("close", () => { closed = true; clearInterval(heartbeat); });

  try {
    const imageConfig = process.env.NEXADESK_IMAGE_BASE_URL ? {
      baseUrl: process.env.NEXADESK_IMAGE_BASE_URL,
      apiKey: process.env.NEXADESK_IMAGE_API_KEY,
      model: process.env.NEXADESK_IMAGE_MODEL || "dall-e-3",
      outputDirectory: body.workspace.defaultWorkspace || "."
    } : undefined;

    for await (const event of runAgentLoop({
      provider: body.provider,
      model: body.model,
      apiKey: body.apiKey,
      messages: body.messages,
      workspace: body.workspace,
      image: imageConfig,
    })) {
      if (closed) break;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    if (!closed) res.write("data: [DONE]\n\n");
  } catch (error) {
    if (!closed) {
      res.write(`data: ${JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "Agent failed" })}\n\n`);
      res.write("data: [DONE]\n\n");
    }
  } finally {
    clearInterval(heartbeat);
    if (!closed) res.end();
  }
}

/**
 * Register agent routes on the Express app.
 * Call this from server/index.ts: registerAgentRoutes(app);
 */
export function registerAgentRoutes(app: any) {
  app.post("/api/agent/chat", handleAgentChat);
  app.post("/api/agent/approve", (req: Request, res: Response) => {
    const { toolCallId, approved } = req.body;
    if (!toolCallId) { res.status(400).json({ error: "Missing toolCallId" }); return; }
    res.json({ status: "ok", toolCallId, approved: !!approved });
  });
}
