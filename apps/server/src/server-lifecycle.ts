import type { ActivityEvent, AutomationJob, AutomationRun, AppSnapshot, RuntimeTelemetryEntry } from "@nexadesk/shared";
import type { PendingToolApprovalRecord } from "./runtime-state-store.js";

export type ServerLifecycleContext = {
  snapshot: AppSnapshot;
  pendingToolApprovals: Map<string, Omit<PendingToolApprovalRecord, "approvalId">>;
  setRuntimeTelemetry: (entries: RuntimeTelemetryEntry[]) => void;
  loadRuntimeState: (snapshot: AppSnapshot) => Promise<PendingToolApprovalRecord[]>;
  loadRuntimeTelemetry: () => Promise<RuntimeTelemetryEntry[]>;
  normalizeAutomationJob: (job: Partial<AutomationJob> & Pick<AutomationJob, "id" | "name">) => AutomationJob;
  runningAutomationJobs: Set<string>;
  runAutomationJob: (job: AutomationJob, trigger: "manual" | "schedule") => Promise<AutomationRun>;
};

export async function bootstrapServerRuntime(context: ServerLifecycleContext): Promise<void> {
  const pendingApprovals = await context.loadRuntimeState(context.snapshot);
  context.setRuntimeTelemetry(await context.loadRuntimeTelemetry());
  context.snapshot.automations = context.snapshot.automations.map((job) => context.normalizeAutomationJob(job));
  context.snapshot.automationRuns = context.snapshot.automationRuns.slice(0, 100);
  context.pendingToolApprovals.clear();
  for (const pending of pendingApprovals) {
    context.pendingToolApprovals.set(pending.approvalId, {
      request: pending.request,
      sessionId: pending.sessionId,
      agentId: pending.agentId,
      messageId: pending.messageId,
      toolCallId: pending.toolCallId
    });
  }
}

let automationScheduler: ReturnType<typeof setInterval> | null = null;

export function startAutomationScheduler(context: Pick<ServerLifecycleContext, "snapshot" | "runningAutomationJobs" | "runAutomationJob">) {
  if (automationScheduler) {
    return;
  }
  automationScheduler = setInterval(() => {
    void runDueAutomations(context);
  }, 15_000);
  void runDueAutomations(context);
}

export function startActivityHeartbeat(context: {
  snapshot: AppSnapshot;
  publishActivity: (input: { level: "info" | "warning" | "error"; title: string; detail: string }) => ActivityEvent;
}) {
  setInterval(() => {
    const event = context.publishActivity({
      level: "info",
      title: "Heartbeat",
      detail: "Local API is still connected to the workbench."
    });
    context.snapshot.activity.unshift(event);
    context.snapshot.activity = context.snapshot.activity.slice(0, 20);
  }, 20000).unref();
}

async function runDueAutomations(context: Pick<ServerLifecycleContext, "snapshot" | "runningAutomationJobs" | "runAutomationJob">) {
  const now = Date.now();
  for (const job of context.snapshot.automations) {
    const dueAt = new Date(job.nextRun).getTime();
    if (
      job.enabled &&
      job.scheduleKind !== "manual" &&
      Number.isFinite(dueAt) &&
      dueAt <= now &&
      !context.runningAutomationJobs.has(job.id)
    ) {
      await context.runAutomationJob(job, "schedule");
    }
  }
}
