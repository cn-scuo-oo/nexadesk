import type { AutomationJob } from "@nexadesk/shared";

export function inferAutomationScheduleKind(schedule?: string): AutomationJob["scheduleKind"] {
  const text = (schedule ?? "").toLowerCase();
  if (text.includes("week")) {
    return "weekly";
  }
  if (text.includes("hour")) {
    return "hourly";
  }
  if (text.includes("once")) {
    return "once";
  }
  if (text.includes("manual")) {
    return "manual";
  }
  return "daily";
}

export function automationScheduleLabel(kind: AutomationJob["scheduleKind"]): string {
  const labels: Record<AutomationJob["scheduleKind"], string> = {
    manual: "Manual only",
    once: "Run once in 1 minute",
    hourly: "Every hour",
    daily: "Every day",
    weekly: "Every week"
  };
  return labels[kind];
}

export function computeNextAutomationRun(kind: AutomationJob["scheduleKind"], from = new Date()): string {
  const offsetMs: Record<AutomationJob["scheduleKind"], number> = {
    manual: 0,
    once: 60 * 1000,
    hourly: 60 * 60 * 1000,
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000
  };
  if (kind === "manual") {
    return "Not scheduled";
  }
  return new Date(from.getTime() + offsetMs[kind]).toISOString();
}
