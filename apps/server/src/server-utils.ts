export function getEnv(name: string, legacyName: string): string | undefined {
  return process.env[name] ?? process.env[legacyName];
}

export function formatRuntimeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "未知错误";
  return message.length > 240 ? `${message.slice(0, 240)}...` : message;
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
