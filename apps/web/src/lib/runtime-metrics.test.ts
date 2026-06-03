import { describe, expect, it } from "vitest";
import { buildRuntimeDashboardStats, estimateTokenCount } from "./runtime-metrics";

describe("runtime metrics", () => {
  it("estimates mixed Chinese and English token counts", () => {
    expect(estimateTokenCount("整改通知 review complete")).toBeGreaterThan(0);
    expect(estimateTokenCount("   ")).toBe(0);
  });

  it("builds dashboard stats for the active session", () => {
    const stats = buildRuntimeDashboardStats(
      [],
      [
        {
          id: "entry-1",
          sessionId: "session-a",
          providerName: "DeepSeek",
          model: "deepseek-v4-flash",
          startedAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:00:01.000Z",
          firstTokenMs: 120,
          durationMs: 1000,
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          status: "completed"
        },
        {
          id: "entry-2",
          sessionId: "session-b",
          providerName: "Kimi",
          model: "kimi-k2.6",
          startedAt: "2026-01-01T00:00:00.000Z",
          inputTokens: 20,
          outputTokens: 0,
          totalTokens: 20,
          status: "failed"
        }
      ],
      "session-a"
    );

    expect(stats.totalCalls).toBe(1);
    expect(stats.successRateLabel).toBe("100%");
    expect(stats.contextTokens).toBe(100);
  });
});
