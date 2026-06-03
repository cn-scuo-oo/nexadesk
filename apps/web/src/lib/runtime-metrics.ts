import type { ChatMessage, RuntimeTelemetryEntry } from "@nexadesk/shared";

export type RuntimeDashboardStats = {
  totalCalls: number;
  successRateLabel: string;
  averageCompletionLabel: string;
  averageFirstTokenLabel: string;
  outputTpsLabel: string;
  modelTpsLabel: string;
  totalTokens: number;
  contextTokens: number;
  telemetrySourceLabel: string;
  trendBars: number[];
};

export function buildRuntimeDashboardStats(
  _messages: ChatMessage[],
  telemetry: RuntimeTelemetryEntry[],
  activeSessionId: string | null
): RuntimeDashboardStats {
  const scopedTelemetry = activeSessionId
    ? telemetry.filter((entry) => entry.sessionId === activeSessionId)
    : telemetry;
  const source = scopedTelemetry.length ? scopedTelemetry : telemetry;
  const total = source.length;
  const completed = source.filter((entry) => entry.status === "completed").length;
  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const avgCompletion = source.reduce((sum, entry) => sum + (entry.durationMs ?? 0), 0) / Math.max(total, 1);
  const avgFirstToken = source.reduce((sum, entry) => sum + (entry.firstTokenMs ?? 0), 0) / Math.max(total, 1);
  const totalTokens = source.reduce((sum, entry) => sum + entry.totalTokens, 0);
  const inputTokens = source.reduce((sum, entry) => sum + entry.inputTokens, 0);
  const outputTokens = source.reduce((sum, entry) => sum + entry.outputTokens, 0);
  const totalDuration = source.reduce((sum, entry) => sum + (entry.durationMs ?? 0), 0);
  const outputTps = totalDuration > 0 ? outputTokens / (totalDuration / 1000) : 0;
  const modelTps = totalDuration > 0 ? totalTokens / (totalDuration / 1000) : 0;
  const bucketSize = Math.max(1, Math.ceil(total / 20));
  const trendBars = Array.from({ length: 20 }, (_, index) => {
    const slice = source.slice(index * bucketSize, (index + 1) * bucketSize);
    return slice.length > 0 ? Math.min(100, Math.round((slice.length / bucketSize) * 100)) : 5;
  });

  return {
    totalCalls: total,
    successRateLabel: `${successRate}%`,
    averageCompletionLabel: formatDuration(avgCompletion),
    averageFirstTokenLabel: formatDuration(avgFirstToken),
    outputTpsLabel: `${outputTps.toFixed(1)} t/s`,
    modelTpsLabel: `${modelTps.toFixed(1)} t/s`,
    totalTokens,
    contextTokens: inputTokens,
    telemetrySourceLabel: activeSessionId ? "当前会话遥测" : "全部本地遥测",
    trendBars
  };
}

export function estimateTokenCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  const cjk = trimmed.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const words = trimmed
    .replace(/[\u3400-\u9fff]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  const otherChars = Math.max(0, trimmed.length - cjk);
  return Math.max(1, Math.ceil(cjk * 0.75 + words * 1.3 + otherChars / 5));
}

function formatDuration(ms?: number): string {
  if (!ms) {
    return "-";
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${(ms / 60000).toFixed(1)}m`;
}
