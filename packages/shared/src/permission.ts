import type { AgentToolName } from "./agent.js";

export type PermissionRisk = "low" | "medium" | "high";
export type ApprovalDecision = "approved" | "rejected" | "failed";
export type PermissionPolicy = "ask" | "allow" | "deny";

export interface PermissionRequest {
  id: string;
  sessionId: string;
  agentId: string;
  action: string;
  risk: PermissionRisk;
  requestedAt: string;
  toolCallId?: string;
  messageId?: string;
  toolName?: AgentToolName;
}

export interface ApprovalHistoryEntry extends PermissionRequest {
  decision: ApprovalDecision;
  resolvedAt: string;
  reason?: string;
  resultSummary?: string;
}

export interface ResolveApprovalRequest {
  approved: boolean;
  reason?: string;
}