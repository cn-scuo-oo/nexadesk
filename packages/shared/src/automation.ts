export type AutomationScheduleKind = "manual" | "once" | "hourly" | "daily" | "weekly";
export type AutomationRunStatus = "running" | "completed" | "failed";

export interface AutomationJob {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  nextRun: string;
  prompt: string;
  agentId?: string;
  scheduleKind: AutomationScheduleKind;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastStatus?: AutomationRunStatus;
  failureReason?: string;
}

export interface AutomationRun {
  id: string;
  jobId: string;
  jobName: string;
  agentId?: string;
  status: AutomationRunStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  resultSummary?: string;
  failureReason?: string;
}

export interface CreateAutomationRequest {
  name: string;
  prompt: string;
  scheduleKind: AutomationScheduleKind;
  enabled?: boolean;
  agentId?: string;
}

export interface UpdateAutomationRequest {
  name?: string;
  prompt?: string;
  scheduleKind?: AutomationScheduleKind;
  enabled?: boolean;
  agentId?: string;
}