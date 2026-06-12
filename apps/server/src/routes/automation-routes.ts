import { randomUUID } from "node:crypto";
import type { Express } from "express";
import { z } from "zod";
import type { AutomationJob, CreateAutomationRequest, UpdateAutomationRequest } from "@nexadesk/shared";
import { automationScheduleLabel } from "../automation-scheduler.js";
import {
  normalizeAutomationJob,
  runAutomationJob,
  type AutomationServiceContext
} from "../services/automation-service.js";

const scheduleKindSchema = z.enum(["manual", "once", "hourly", "daily", "weekly"]);

const automationCreateSchema = z.object({
  name: z.string().trim().min(1).max(140),
  prompt: z.string().trim().min(1).max(8000),
  scheduleKind: scheduleKindSchema,
  enabled: z.boolean().optional(),
  agentId: z.string().trim().optional()
});

const automationUpdateSchema = z.object({
  name: z.string().trim().min(1).max(140).optional(),
  prompt: z.string().trim().min(1).max(8000).optional(),
  scheduleKind: scheduleKindSchema.optional(),
  enabled: z.boolean().optional(),
  agentId: z.string().trim().optional()
});

export function registerAutomationRoutes(app: Express, context: AutomationServiceContext) {
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
      context.snapshot.automations.unshift(job);
      const activity = context.publishActivity({
        level: "info",
        title: "Automation created",
        detail: `${job.name} was scheduled as ${job.schedule}.`
      });
      context.snapshot.activity.unshift(activity);
      await context.persistRuntimeState();
      res.status(201).json({
        automations: context.snapshot.automations,
        automationRuns: context.snapshot.automationRuns,
        activity
      });
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

      const index = context.snapshot.automations.findIndex((job) => job.id === req.params.jobId);
      const current = context.snapshot.automations[index];
      if (index === -1 || !current) {
        res.status(404).json({ error: "Automation not found" });
        return;
      }

      const nextJob = normalizeAutomationJob({
        ...current,
        ...parsed.data,
        schedule: parsed.data.scheduleKind ? automationScheduleLabel(parsed.data.scheduleKind) : current.schedule,
        updatedAt: new Date().toISOString()
      });
      context.snapshot.automations[index] = nextJob;
      const activity = context.publishActivity({
        level: "info",
        title: "Automation updated",
        detail: `${nextJob.name} is now ${nextJob.enabled ? "enabled" : "disabled"}.`
      });
      context.snapshot.activity.unshift(activity);
      await context.persistRuntimeState();
      res.json({ automations: context.snapshot.automations, automationRuns: context.snapshot.automationRuns, activity });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/automations/:jobId/run", async (req, res, next) => {
    try {
      const job = context.snapshot.automations.find((item): item is AutomationJob => item.id === req.params.jobId);
      if (!job) {
        res.status(404).json({ error: "Automation not found" });
        return;
      }
      const run = await runAutomationJob(context, job, "manual");
      res.status(201).json({ automations: context.snapshot.automations, automationRuns: context.snapshot.automationRuns, run });
    } catch (error) {
      next(error);
    }
  });
}
