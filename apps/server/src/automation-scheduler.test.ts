import { describe, expect, it } from "vitest";
import { automationScheduleLabel, computeNextAutomationRun, inferAutomationScheduleKind } from "./automation-scheduler";

describe("automation scheduler helpers", () => {
  it("infers schedule kind from legacy labels", () => {
    expect(inferAutomationScheduleKind("Every week")).toBe("weekly");
    expect(inferAutomationScheduleKind("Manual only")).toBe("manual");
    expect(inferAutomationScheduleKind("Run once")).toBe("once");
  });

  it("computes next run for recurring jobs", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    expect(computeNextAutomationRun("manual", from)).toBe("Not scheduled");
    expect(computeNextAutomationRun("hourly", from)).toBe("2026-01-01T01:00:00.000Z");
    expect(automationScheduleLabel("daily")).toBe("Every day");
  });
});
