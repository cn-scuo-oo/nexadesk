import type { Express } from "express";
import { z } from "zod";
import {
  resolveApprovalRequest,
  runSessionMessageExchange,
  type SessionWorkflowContext
} from "../services/session-workflow-service.js";

const sessionPatchSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  pinned: z.boolean().optional()
});

const messageSchema = z.object({
  content: z.string().trim().min(1).max(8000),
  providerId: z.string().trim().optional(),
  model: z.string().trim().optional(),
  agentId: z.string().trim().optional()
});

const approvalSchema = z.object({
  approved: z.boolean(),
  reason: z.string().trim().max(1000).optional()
});

export function registerSessionRoutes(app: Express, context: SessionWorkflowContext) {
  app.get("/api/sessions", (_req, res) => {
    res.json(context.snapshot.sessions);
  });

  app.patch("/api/sessions/:sessionId", async (req, res, next) => {
    try {
      const parsed = sessionPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }

      const session = context.snapshot.sessions.find((item) => item.id === req.params.sessionId);
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
      sortSessions(context);
      const activity = context.publishActivity({
        level: "info",
        title: "Session updated",
        detail: `${session.title} was updated.`
      });
      context.snapshot.activity.unshift(activity);
      await context.persistRuntimeState();
      res.json({ sessions: context.snapshot.sessions, activity });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/sessions/:sessionId", async (req, res, next) => {
    try {
      const sessionIndex = context.snapshot.sessions.findIndex((item) => item.id === req.params.sessionId);
      if (sessionIndex === -1) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      if (context.snapshot.sessions.length <= 1) {
        res.status(400).json({ error: "At least one session must remain." });
        return;
      }

      const [removed] = context.snapshot.sessions.splice(sessionIndex, 1);
      context.snapshot.messages = context.snapshot.messages.filter((message) => message.sessionId !== req.params.sessionId);
      context.snapshot.approvals = context.snapshot.approvals.filter((approval) => approval.sessionId !== req.params.sessionId);
      context.snapshot.approvalHistory = context.snapshot.approvalHistory.filter(
        (approval) => approval.sessionId !== req.params.sessionId
      );
      const activity = context.publishActivity({
        level: "warning",
        title: "Session deleted",
        detail: `${removed?.title ?? "Session"} was removed.`
      });
      context.snapshot.activity.unshift(activity);
      await context.persistRuntimeState();
      res.json({ sessions: context.snapshot.sessions, activity });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions/:sessionId/messages", async (req, res, next) => {
    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const session = context.snapshot.sessions.find((item) => item.id === req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    try {
      const exchange = await runSessionMessageExchange(context, session.id, parsed.data);
      res.status(201).json(exchange);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions/:sessionId/messages/stream", async (req, res, _next) => {
    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const session = context.snapshot.sessions.find((item) => item.id === req.params.sessionId);
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
      await runSessionMessageExchange(context, session.id, parsed.data, (event) => writeChatEvent(res, event));
    } catch (error) {
      const message = error instanceof Error ? error.message : "模型调用失败：未知错误";
      writeChatEvent(res, { type: "error", message });
    } finally {
      res.end();
    }
  });

  app.post("/api/approvals/:approvalId/resolve", async (req, res, next) => {
    const parsed = approvalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      const result = await resolveApprovalRequest(context, req.params.approvalId, parsed.data);
      res.json(result);
    } catch (error) {
      if (error instanceof Error && error.message === "Approval not found") {
        res.status(404).json({ error: error.message });
        return;
      }
      next(error);
    }
  });
}

function sortSessions(context: SessionWorkflowContext) {
  context.snapshot.sessions.sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) {
      return left.pinned ? -1 : 1;
    }
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function writeChatEvent(res: import("express").Response, event: { type: string; [key: string]: unknown }) {
  res.write(`event: chat\ndata: ${JSON.stringify(event)}\n\n`);
}
