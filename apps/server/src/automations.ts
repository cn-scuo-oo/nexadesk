// @ts-nocheck
import type { Express } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { snapshot, runningAutomationJobs, setAutomationScheduler, persistRuntimeState } from "./state.js";
import { automationScheduleLabel, computeNextAutomationRun, inferAutomationScheduleKind } from "./automation-scheduler.js";
import { publishActivity } from "./events.js";
import { formatRuntimeError } from "./server-utils.js";
import type { AutomationScheduleKind, AutomationRun } from "@nexadesk/shared";

const automationScheduleKindSchema = z.enum(["manual", "once", "hourly", "daily", "weekly"]);

const automationCreateSchema = z.object({
  name: z.string().trim().min(1).max(140),
  prompt: z.string().trim().min(1).max(4000),
  scheduleKind: automationScheduleKindSchema,
  enabled: z.boolean().optional(),
  agentId: z.string().trim().optional()
});

const automationUpdateSchema = z.object({
  name: z.string().trim().min(1).max(140).optional(),
  prompt: z.string().trim().min(1).max(4000).optional(),
  scheduleKind: automationScheduleKindSchema.optional(),
  enabled: z.boolean().optional(),
  agentId: z.string().trim().optional()
});

export function registerAutomationsRoutes(app: Express): void {
app.post("/api/automations", async (req, res, next) => {
  try {
    const parsed = automationCreateSchema.safeParse(req.body as CreateAutomationRequest);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const now = new Date().toISOString();
    const job = normalizeAutomationJob({
      id: `automation-${randomUUID().slice(0, 8)}`,
      ...parsed.data,
      enabled: parsed.data.enabled ?? true,
      schedule: automationScheduleLabel(parsed.data.scheduleKind),
      nextRun: "",
      createdAt: now,
      updatedAt: now
    });
    snapshot.automations.unshift(job);
    const activity = publishActivity({
      level: "info",
      title: "Automation created",
      detail: `${job.name} was scheduled as ${job.schedule}.`
    });
    snapshot.activity.unshift(activity);
    await persistRuntimeState();
    res.status(201).json({ automations: snapshot.automations, automationRuns: snapshot.automationRuns, activity });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/automations/:jobId", async (req, res, next) => {
  try {
    const parsed = automationUpdateSchema.safeParse(req.body as UpdateAutomationRequest);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const index = snapshot.automations.findIndex((job) => job.id === req.params.jobId);
    if (index === -1) {
      res.status(404).json({ error: "Automation not found" });
      return;
    }

    const current = snapshot.automations[index];
    if (!current) {
      res.status(404).json({ error: "Automation not found" });
      return;
    }
    const nextJob = normalizeAutomationJob({
      ...current,
      ...parsed.data,
      schedule: parsed.data.scheduleKind ? automationScheduleLabel(parsed.data.scheduleKind) : current.schedule,
      updatedAt: new Date().toISOString()
    });
    snapshot.automations[index] = nextJob;
    const activity = publishActivity({
      level: "info",
      title: "Automation updated",
      detail: `${nextJob.name} is now ${nextJob.enabled ? "enabled" : "disabled"}.`
    });
    snapshot.activity.unshift(activity);
    await persistRuntimeState();
    res.json({ automations: snapshot.automations, automationRuns: snapshot.automationRuns, activity });
  } catch (error) {
    next(error);
  }
});

app.post("/api/automations/:jobId/run", async (req, res, next) => {
  try {
    const job = snapshot.automations.find((item) => item.id === req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "Automation not found" });
      return;
    }
    const run = await runAutomationJob(job, "manual");
    res.status(201).json({ automations: snapshot.automations, automationRuns: snapshot.automationRuns, run });
  } catch (error) {
    next(error);
  }
});
}
function normalizeAutomationJob(job: Partial<AutomationJob> & Pick<AutomationJob, "id" | "name">): AutomationJob {
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
    prompt: job.prompt ?? `执行自动化任务：${job.name}。请总结目标、检查当前上下文并给出结果。`,
    agentId: job.agentId,
    scheduleKind,
    createdAt: job.createdAt ?? now.toISOString(),
    updatedAt: job.updatedAt ?? now.toISOString(),
    lastRunAt: job.lastRunAt,
    lastStatus: job.lastStatus,
    failureReason: job.failureReason
  };
}

function startAutomationScheduler() {
  if (automationScheduler) {
    return;
  }
  automationScheduler = setInterval(() => {
    void runDueAutomations();
  }, 15_000);
  void runDueAutomations();
}

async function runDueAutomations() {
  const now = Date.now();
  for (const job of snapshot.automations) {
    const dueAt = new Date(job.nextRun).getTime();
    if (
      job.enabled &&
      job.scheduleKind !== "manual" &&
      Number.isFinite(dueAt) &&
      dueAt <= now &&
      !runningAutomationJobs.has(job.id)
    ) {
      await runAutomationJob(job, "schedule");
    }
  }
}

async function runAutomationJob(job: AutomationJob, trigger: "manual" | "schedule"): Promise<AutomationRun> {
  if (runningAutomationJobs.has(job.id)) {
    throw new ProviderRuntimeError(`Automation ${job.name} is already running.`);
  }

  runningAutomationJobs.add(job.id);
  const startedAt = new Date();
  const run: AutomationRun = {
    id: `run-${randomUUID().slice(0, 8)}`,
    jobId: job.id,
    jobName: job.name,
    agentId: job.agentId,
    status: "running",
    startedAt: startedAt.toISOString()
  };
  snapshot.automationRuns.unshift(run);
  snapshot.automationRuns = snapshot.automationRuns.slice(0, 100);

  const activity = publishActivity({
    level: "info",
    title: "Automation started",
    detail: `${job.name} started by ${trigger}.`
  });
  snapshot.activity.unshift(activity);
  await persistRuntimeState();

  try {
    const session = snapshot.sessions[0];
    if (!session) {
      throw new ProviderRuntimeError("No session is available for automation.");
    }

    const exchange = await runModelExchange(session.id, {
      content: `【自动化任务：${job.name}】\n${job.prompt}`,
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
    const failedActivity = publishActivity({
      level: "error",
      title: "Automation failed",
      detail: `${job.name}: ${reason}`
    });
    snapshot.activity.unshift(failedActivity);
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
    runningAutomationJobs.delete(job.id);
    await persistRuntimeState();
  }

  return run;
}