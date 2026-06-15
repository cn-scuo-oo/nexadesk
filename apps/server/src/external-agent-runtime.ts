// @ts-nocheck
import { createInterface } from "node:readline";
import type { AgentEngineSettings } from "@nexadesk/shared";
import { ProviderRuntimeError, type RuntimeChatMessage, type RuntimeStreamEvent } from "./provider-runtime.js";

const CODEX_EXEC_TIMEOUT_MS = 180000;
const MAX_PROMPT_CHARS = 12000;
const MAX_DIAGNOSTIC_CHARS = 4000;

export type ExternalAgentRuntimeRequest = {
  engine: AgentEngineSettings;
  messages: RuntimeChatMessage[];
  cwd?: string;
  timeoutMs?: number;
};

export function canRunExternalAgentEngine(engine: AgentEngineSettings | undefined): engine is AgentEngineSettings {
  return Boolean(
    engine &&
      engine.id === "codex_cli" &&
      engine.kind === "cli" &&
      engine.enabled &&
      engine.installed &&
      engine.setupStatus === "ready" &&
      (engine.command?.trim() || "codex")
  );
}

export async function* streamExternalAgentEvents(
  request: ExternalAgentRuntimeRequest
): AsyncGenerator<RuntimeStreamEvent> {
  if (request.engine.id !== "codex_cli") {
    throw new ProviderRuntimeError(`${request.engine.name} 还没有接入外部运行适配器。`);
  }

  yield* streamCodexCliEvents(request);
}

async function* streamCodexCliEvents(request: ExternalAgentRuntimeRequest): AsyncGenerator<RuntimeStreamEvent> {
  const commandLine = splitCommandLine(request.engine.command?.trim() || "codex");
  const command = commandLine[0] || "codex";
  const commandArgs = commandLine.slice(1);
  const prompt = buildCodexPrompt(request.messages);
  const args = [
    ...commandArgs,
    "exec",
    "--json",
    "--ephemeral",
    "--sandbox",
    "read-only",
    prompt
  ];
  const { spawn } = await import("node:child_process");
  const child = spawn(command, args, {
    cwd: request.cwd || process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  let stderr = "";
  let rawStdout = "";
  let emittedText = false;
  let sawJson = false;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, request.timeoutMs ?? CODEX_EXEC_TIMEOUT_MS).unref();

  child.stderr?.on("data", (chunk) => {
    stderr = clampDiagnostic(`${stderr}${chunk.toString("utf8")}`);
  });

  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null; error?: Error }>((resolve) => {
    child.once("error", (error) => resolve({ code: null, signal: null, error }));
    child.once("close", (code, signal) => resolve({ code, signal }));
  });

  try {
    if (child.stdout) {
      const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
      for await (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        const parsed = parseJsonObject(line);
        if (!parsed) {
          rawStdout = clampDiagnostic(`${rawStdout}${line}\n`);
          continue;
        }

        sawJson = true;
        const failure = extractFailure(parsed);
        if (failure) {
          child.kill();
          throw new ProviderRuntimeError(`Codex CLI 执行失败：${failure}`);
        }

        const text = extractAgentText(parsed);
        if (text) {
          emittedText = true;
          yield { type: "text", delta: text };
        }
      }
    }

    const result = await exit;
    if (timedOut) {
      throw new ProviderRuntimeError("Codex CLI 执行超时，已停止本次外部引擎调用。");
    }
    if (result.error) {
      throw new ProviderRuntimeError(`Codex CLI 无法启动：${result.error.message}`);
    }
    if (result.code !== 0) {
      throw new ProviderRuntimeError(
        `Codex CLI 退出码 ${result.code ?? "unknown"}${stderr ? `：${stderr.slice(0, 500)}` : ""}`
      );
    }
    if (!emittedText && !sawJson && rawStdout.trim()) {
      emittedText = true;
      yield { type: "text", delta: rawStdout.trim() };
    }
    if (!emittedText) {
      throw new ProviderRuntimeError(
        `Codex CLI 没有返回可展示的助手消息${stderr ? `：${stderr.slice(0, 500)}` : "。"}`
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

function buildCodexPrompt(messages: RuntimeChatMessage[]) {
  const content = messages
    .map((message) => {
      const role = message.role === "system" ? "SYSTEM" : message.role === "assistant" ? "ASSISTANT" : "USER";
      return `${role}:\n${message.content}`;
    })
    .join("\n\n");
  const instruction = [
    "你正在 NexaDesk 里作为代码助手运行。",
    "本次外部 Codex CLI 调用被限制为 read-only sandbox；不要尝试直接写文件。",
    "如果需要修改文件，请说明建议改动，或输出 NexaDesk 工具请求让主工作台进入审批流程。",
    "",
    content
  ].join("\n");

  return instruction.length > MAX_PROMPT_CHARS
    ? `${instruction.slice(0, MAX_PROMPT_CHARS)}\n\n[Prompt truncated by NexaDesk]`
    : instruction;
}

function extractAgentText(payload: any): string {
  if (payload?.type === "item.completed" || payload?.type === "item.done") {
    const item = payload.item ?? {};
    if (isAgentMessageItem(item)) {
      return extractTextValue(item).trim();
    }
  }
  if (payload?.type === "agent_message" || payload?.item_type === "agent_message") {
    return extractTextValue(payload).trim();
  }
  if (payload?.type === "message" && payload?.role === "assistant") {
    return extractTextValue(payload).trim();
  }
  return "";
}

function isAgentMessageItem(item: any) {
  return item?.type === "agent_message" || item?.item_type === "agent_message" || item?.role === "assistant";
}

function extractTextValue(value: any): string {
  if (typeof value?.text === "string") {
    return value.text;
  }
  if (typeof value?.content === "string") {
    return value.content;
  }
  if (Array.isArray(value?.content)) {
    return value.content
      .map((item: any) => item?.text ?? item?.content ?? item?.value ?? "")
      .filter((text: unknown): text is string => typeof text === "string")
      .join("");
  }
  if (typeof value?.message === "string") {
    return value.message;
  }
  return "";
}

function extractFailure(payload: any): string {
  if (payload?.type === "error") {
    return payload.message ?? payload.error ?? "unknown error";
  }
  if (payload?.type === "turn.failed") {
    return payload.message ?? payload.error?.message ?? "turn failed";
  }
  return "";
}

function splitCommandLine(commandLine: string) {
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "'" | "" = "";

  for (let index = 0; index < commandLine.length; index += 1) {
    const char = commandLine[index] ?? "";
    if ((char === '"' || char === "'") && !quote) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = "";
      continue;
    }
    if (/\s/.test(char) && !quote) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}

function parseJsonObject(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function clampDiagnostic(text: string) {
  return text.length > MAX_DIAGNOSTIC_CHARS ? text.slice(-MAX_DIAGNOSTIC_CHARS) : text;
}
