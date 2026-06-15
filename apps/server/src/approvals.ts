// @ts-nocheck
import type { Express } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { snapshot, pendingToolApprovals, persistRuntimeState, updateToolCall } from "./state.js";
import { loadSettings } from "./settings-store.js";
import { executeToolRequest, type AgentToolContext } from "./agent-tools.js";
import { publishActivity } from "./events.js";
import { getEnv } from "./server-utils.js";
import { appendToolMessage, createToolContext } from "./sessions.js";

const approvalSchema = z.object({ approved: z.boolean(), reason: z.string().optional() });

export function registerApprovalsRoutes(app: Express): void {
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
}
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