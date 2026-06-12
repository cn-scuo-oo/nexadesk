import { randomUUID } from "node:crypto";
import type { AutomationJob, AutomationRun } from "@nexadesk/shared";
import { automationScheduleLabel, computeNextAutomationRun, inferAutomationScheduleKind } from "../automation-scheduler.js";
import { ProviderRuntimeError } from "../provider-runtime.js";
import { formatRuntimeError } from "../server-utils.js";
import { runSessionMessageExchange, type SessionWorkflowContext } from "./session-workflow-service.js";

export type AutomationServiceContext = SessionWorkflowContext & {
  runningAutomationJobs: Set<string>;
};

export function normalizeAutomationJob(job: Partial<AutomationJob> & Pick<AutomationJob, "id" | "name">): AutomationJob {
  const now = new Date();
  const scheduleKind = job.scheduleKind ?? inferAutomationScheduleKind(job.schedule);
  const enabled = Boolean(job.enabled);
  const nextRunTime = job.nextRun ? new Date(job.nextRun).getTime() : Number.NaN;
  const hasValidFutureRun = Number.isFinite(nextRunTime) && nextRunTime > now.getTime();

  return {
    id: job.id,
    name: job.name,
    schedule: job.schedule ?? automationScheduleLabel(scheduleKind),
    enabled,
    nextRun:
      enabled && scheduleKind !== "manual"
        ? hasValidFutureRun
          ? (job.nextRun ?? "")
          : computeNextAutomationRun(scheduleKind, now)
        : "Not scheduled",
    prompt: job.prompt ?? `Run the automation task "${job.name}" and summarize the result.`,
    agentId: job.agentId,
    scheduleKind,
    createdAt: job.createdAt ?? now.toISOString(),
    updatedAt: job.updatedAt ?? now.toISOString(),
    lastRunAt: job.lastRunAt,
    lastStatus: job.lastStatus,
    failureReason: job.failureReason
  };
}

export async function runAutomationJob(
  context: AutomationServiceContext,
  job: AutomationJob,
  trigger: "manual" | "schedule"
): Promise<AutomationRun> {
  if (context.runningAutomationJobs.has(job.id)) {
    throw new ProviderRuntimeError(`Automation ${job.name} is already running.`);
  }

  context.runningAutomationJobs.add(job.id);
  const startedAt = new Date();
  const run: AutomationRun = {
    id: `run-${randomUUID().slice(0, 8)}`,
    jobId: job.id,
    jobName: job.name,
    agentId: job.agentId,
    status: "running",
    startedAt: startedAt.toISOString()
  };
  context.snapshot.automationRuns.unshift(run);
  context.snapshot.automationRuns = context.snapshot.automationRuns.slice(0, 100);

  const activity = context.publishActivity({
    level: "info",
    title: "Automation started",
    detail: `${job.name} started by ${trigger}.`
  });
  context.snapshot.activity.unshift(activity);
  await context.persistRuntimeState();

  try {
    const session = context.snapshot.sessions[0];
    if (!session) {
      throw new ProviderRuntimeError("No session is available for automation.");
    }

    const exchange = await runSessionMessageExchange(context, session.id, {
      content: `[Automation task: ${job.name}]\n${job.prompt}`,
      agentId: job.agentId
    });
    const assistantMessage = exchange.messages.find((message) => message.role === "assistant");
    run.status = "completed";
    run.resultSummary = assistantMessage?.content.slice(0, 260) || "Automation completed.";
    job.lastStatus = "completed";
    job.failureReason = undefined;
  } catch (error) {
    const reason = formatRuntimeError(error);
    run.status = "failed";
    run.failureReason = reason;
    job.lastStatus = "failed";
    job.failureReason = reason;
    const failedActivity = context.publishActivity({
      level: "error",
      title: "Automation failed",
      detail: `${job.name}: ${reason}`
    });
    context.snapshot.activity.unshift(failedActivity);
  } finally {
    const finishedAt = new Date();
    run.finishedAt = finishedAt.toISOString();
    run.durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
    job.lastRunAt = run.finishedAt;
    if (job.scheduleKind === "once") {
      job.enabled = false;
      job.nextRun = "Completed";
    } else {
      job.nextRun = job.enabled ? computeNextAutomationRun(job.scheduleKind, finishedAt) : "Not scheduled";
    }
    job.updatedAt = finishedAt.toISOString();
    context.runningAutomationJobs.delete(job.id);
    await context.persistRuntimeState();
  }

  return run;
}
