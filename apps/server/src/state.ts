// NexaDesk Server - Shared State Module
// All mutable server state lives here. Route modules import from this module.
import { createDemoSnapshot, createDefaultSettings, type AppSettings, type RuntimeTelemetryEntry } from "@nexadesk/shared";
import { saveRuntimeState, type PendingToolApprovalRecord } from "./runtime-state-store.js";
import { saveSettings } from "./settings-store.js";
import { getEnv } from "./server-utils.js";

export const host = getEnv("NEXADESK_HOST", "AION_LITE_HOST") ?? "127.0.0.1";
export const port = Number(getEnv("NEXADESK_PORT", "AION_LITE_PORT") ?? 3939);

export const snapshot = createDemoSnapshot();
export let runtimeTelemetry: RuntimeTelemetryEntry[] = [];
export const runningAutomationJobs = new Set<string>();
export let automationScheduler: ReturnType<typeof setInterval> | null = null;
export const pendingToolApprovals = new Map<string, Omit<PendingToolApprovalRecord, "approvalId">>();
export let currentSettings: AppSettings = createDefaultSettings(snapshot.providers);

export function setRuntimeTelemetry(value: RuntimeTelemetryEntry[]) { runtimeTelemetry = value; }
export function getRuntimeTelemetry() { return runtimeTelemetry; }
export function setAutomationScheduler(value: ReturnType<typeof setInterval> | null) { automationScheduler = value; }
export function setCurrentSettings(value: AppSettings) { currentSettings = value; }
export function getCurrentSettings() { return currentSettings; }

export async function saveCurrentSettings(): Promise<void> {
  await saveSettings(currentSettings);
}

export function sortSessions() {
  snapshot.sessions.sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

export function syncSessionAgents() {
  const enabledAgentIds = snapshot.agents.filter((agent) => agent.enabled).map((agent) => agent.id);
  for (const session of snapshot.sessions) {
    session.agentIds = enabledAgentIds;
    if (!enabledAgentIds.includes(session.activeAgentId)) {
      session.activeAgentId = enabledAgentIds[0] ?? session.activeAgentId;
    }
  }
  sortSessions();
}

export async function persistRuntimeState(): Promise<void> {
  await saveRuntimeState({
    pendingToolApprovals: pendingToolApprovalRecords(),
    runtimeTelemetry: runtimeTelemetry.slice(0, 100),
    sessions: snapshot.sessions,
    messages: snapshot.messages,
    approvals: snapshot.approvals,
    approvalHistory: snapshot.approvalHistory,
    automations: snapshot.automations,
    automationRuns: snapshot.automationRuns,
    settings: currentSettings
  });
}

export function pendingToolApprovalRecords(): PendingToolApprovalRecord[] {
  return Array.from(pendingToolApprovals.entries()).map(([approvalId, record]) => ({
    ...record,
    approvalId
  }));
}

export function updateToolCall(assistantId: string, toolCallId: string, status: string, summary?: string) {
  const message = snapshot.messages.find((m) => m.id === assistantId);
  if (!message?.toolCalls) return;
  message.toolCalls = message.toolCalls.map((tc) =>
    tc.id === toolCallId ? { ...tc, status: status as any, ...(summary ? { summary } : {}) } : tc
  );
}