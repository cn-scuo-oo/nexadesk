import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import type {
  AgentEngineDetectionRecord,
  AgentEngineSettings,
  McpServerToolsRequest,
  McpServerToolsResult,
  McpServerTestRequest,
  McpServerTestResult,
  McpToolDefinition,
  ProviderModelsResult,
  ProviderSettings,
  ProviderTestResult
} from "@nexadesk/shared";

const agentEngineCommandAliases: Record<string, string[]> = {
  nexadesk_builtin: [],
  codex_cli: ["codex"],
  claude_code: ["claude"],
  openclaw: ["openclaw"],
  hermes: ["hermes"],
  opencode: ["opencode"],
  qwen_code: ["qwen", "qwen-code"],
  deepseek_tui: ["deepseek", "deepseek-tui"]
};

export async function testMcpServer(
  server: McpServerTestRequest["server"],
  timeoutMs: number
): Promise<McpServerTestResult> {
  const checkedAt = new Date().toISOString();
  if (server.transport === "http") {
    const url = server.url?.trim();
    if (!url) {
      return { ok: false, checkedAt, transport: "http", message: "请先填写 MCP HTTP URL。" };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs).unref();
    try {
      const response = await fetch(url, { method: "GET", signal: controller.signal });
      return {
        ok: response.status < 500,
        checkedAt,
        transport: "http",
        status: response.status,
        resolvedTarget: url,
        message:
          response.status < 500
            ? `HTTP MCP endpoint reachable: ${response.status}.`
            : `HTTP MCP endpoint returned ${response.status}.`
      };
    } catch (error) {
      return {
        ok: false,
        checkedAt,
        transport: "http",
        resolvedTarget: url,
        message: error instanceof Error ? `HTTP MCP test failed: ${error.message}` : "HTTP MCP test failed."
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  const command = server.command?.trim();
  if (!command) {
    return { ok: false, checkedAt, transport: "stdio", message: "请先填写 stdio MCP 命令。" };
  }
  const commandResult = await resolveLocalCommand(command, timeoutMs);
  return {
    ok: commandResult.ok,
    checkedAt,
    transport: "stdio",
    resolvedTarget: commandResult.resolvedPath ?? command,
    message: commandResult.ok
      ? `stdio command is available: ${commandResult.resolvedPath ?? command}.`
      : commandResult.message
  };
}

export async function discoverMcpTools(
  server: McpServerToolsRequest["server"],
  timeoutMs: number
): Promise<McpServerToolsResult> {
  const checkedAt = new Date().toISOString();
  if (server.transport === "http") {
    return discoverHttpMcpTools(server, timeoutMs, checkedAt);
  }
  return discoverStdioMcpTools(server, timeoutMs, checkedAt);
}

export async function testProviderConnection(
  provider: ProviderSettings,
  apiKey: string | undefined,
  timeoutMs: number
): Promise<ProviderTestResult> {
  const baseUrl = provider.baseUrl?.replace(/\/+$/, "");
  if (!baseUrl) {
    return { ok: false, message: "请先填写 Base URL" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs).unref();

  try {
    const checkedUrl = buildProviderTestUrl(provider, baseUrl);
    const headers: Record<string, string> = {};

    if (provider.kind === "anthropic") {
      if (!apiKey) {
        return { ok: false, checkedUrl, message: "Anthropic 需要 API Key" };
      }
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else if (provider.kind !== "local" && apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    } else if (provider.kind !== "local" && !apiKey) {
      return { ok: false, checkedUrl, message: "该 Provider 需要 API Key" };
    }

    const response = await fetch(checkedUrl, {
      headers,
      signal: controller.signal
    });

    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        checkedUrl,
        message: "Connection succeeded. Provider is reachable."
      };
    }

    const detail = await response.text();
    return {
      ok: false,
      status: response.status,
      checkedUrl,
      message: `Connection failed: HTTP ${response.status}${detail ? ` - ${detail.slice(0, 180)}` : ""}`
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? `Connection failed: ${error.message}` : "Connection failed: unknown error"
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchProviderModels(
  provider: ProviderSettings,
  apiKey: string | undefined,
  timeoutMs: number
): Promise<ProviderModelsResult> {
  const baseUrl = provider.baseUrl?.replace(/\/+$/, "");
  if (!baseUrl) {
    return { ok: false, message: "请先填写 Base URL", models: [] };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs).unref();

  try {
    const checkedUrl = buildProviderTestUrl(provider, baseUrl);
    const headers = buildProviderModelHeaders(apiKey);
    if ("error" in headers) {
      return { ok: false, checkedUrl, message: headers.error, models: [] };
    }

    const response = await fetch(checkedUrl, {
      headers,
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text();
      return {
        ok: false,
        status: response.status,
        checkedUrl,
        message: `Fetch models failed: HTTP ${response.status}${detail ? ` - ${detail.slice(0, 180)}` : ""}`,
        models: []
      };
    }

    const payload = (await response.json()) as unknown;
    const models = extractModelNames(payload);
    return {
      ok: true,
      status: response.status,
      checkedUrl,
      models,
      message: models.length
        ? `Fetched ${models.length} model(s).`
        : "Provider responded but did not return model names."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? `Fetch models failed: ${error.message}` : "Fetch models failed: unknown error",
      models: []
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function detectAgentEngine(
  engine: AgentEngineSettings,
  checkedAt: string
): Promise<AgentEngineDetectionRecord> {
  if (engine.kind === "builtin") {
    return {
      engineId: engine.id,
      installed: true,
      setupStatus: "ready",
      message: "NexaDesk built-in runtime is always available.",
      checkedAt
    };
  }

  const commands = uniqueStrings([engine.command, ...(agentEngineCommandAliases[engine.id] ?? [])]);
  for (const command of commands) {
    const resolved = await resolveCommandCandidate(command);
    if (!resolved) {
      continue;
    }
    const version = await readCommandVersion(resolved.resolvedPath || command);
    const configPath = await findAgentEngineConfigPath(engine.id);
    return {
      engineId: engine.id,
      installed: true,
      command,
      resolvedPath: resolved.resolvedPath,
      version,
      configPath,
      setupStatus: "ready",
      message: `${engine.name} was detected${version ? ` (${version})` : ""}.`,
      checkedAt
    };
  }

  const configPath = await findAgentEngineConfigPath(engine.id);
  return {
    engineId: engine.id,
    installed: false,
    configPath,
    setupStatus: configPath ? "needs_setup" : "not_installed",
    message: configPath
      ? `${engine.name} config was found, but no CLI command was found in PATH.`
      : `${engine.name} was not found in PATH.`,
    checkedAt
  };
}

function buildProviderModelHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  return headers;
}

function extractModelNames(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.data)) {
    return obj.data.map((m: any) => m.id).filter(Boolean);
  }
  if (Array.isArray(obj.models)) {
    return obj.models.map((m: any) => (typeof m === "string" ? m : m.name)).filter(Boolean);
  }
  return [];
}

async function readCommandVersion(command: string): Promise<string | undefined> {
  try {
    const result = await runProcess(command, ["--version"], 3000);
    return result.code === 0 ? result.stdout.trim().split("\n")[0] : undefined;
  } catch {
    return undefined;
  }
}

async function findAgentEngineConfigPath(engineId: string): Promise<string | undefined> {
  const home = homedir();
  const paths: Record<string, string[]> = {
    codex_cli: [`${home}/.codex/config.json`],
    claude_code: [`${home}/.claude/settings.json`],
    openclaw: [`${home}/.openclaw/config.yaml`],
    hermes: [`${home}/.hermes/config.json`],
    opencode: [`${home}/.opencode/config.json`],
    qwen_code: [`${home}/.qwen/config.json`],
    deepseek_tui: [`${home}/.deepseek/config.json`]
  };
  const candidates = paths[engineId] ?? [];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  return undefined;
}

async function resolveCommandCandidate(command: string): Promise<{ resolvedPath?: string } | null> {
  if (hasPathSegment(command)) {
    try {
      await access(command);
      return { resolvedPath: command };
    } catch {
      return null;
    }
  }

  const lookup = process.platform === "win32" ? "where.exe" : "which";
  const result = await runProcess(lookup, [command], 2500);
  if (result.code !== 0) {
    return null;
  }
  return { resolvedPath: result.stdout.trim() };
}

function uniqueStrings(values: Array<string | undefined>) {
  const seen = new Set<string>();
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function buildProviderTestUrl(provider: ProviderSettings, baseUrl: string) {
  if (provider.apiMode === "ollama_generate") {
    return `${baseUrl}/api/tags`;
  }
  if (provider.kind === "anthropic") {
    return `${baseUrl || "https://api.anthropic.com"}/v1/models`;
  }
  return `${baseUrl}/models`;
}

async function resolveLocalCommand(
  command: string,
  timeoutMs: number
): Promise<{ ok: boolean; message: string; resolvedPath?: string }> {
  const lookupCommand = process.platform === "win32" ? "where" : "which";
  const result = await runProcess(lookupCommand, [command], timeoutMs);
  const resolvedPath = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)[0];
  return result.code === 0 && resolvedPath
    ? { ok: true, message: "Command found.", resolvedPath }
    : { ok: false, message: result.stderr.trim() || `Command not found: ${command}` };
}

async function discoverHttpMcpTools(
  server: McpServerToolsRequest["server"],
  timeoutMs: number,
  checkedAt: string
): Promise<McpServerToolsResult> {
  const url = server.url?.trim();
  if (!url) {
    return {
      ok: false,
      checkedAt,
      serverId: server.id,
      transport: "http",
      tools: [],
      message: "请先填写 MCP HTTP URL。"
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs).unref();
  try {
    await postMcpJsonRpc(url, 1, "initialize", buildMcpInitializeParams(), controller.signal);
    const result = await postMcpJsonRpc(url, 2, "tools/list", {}, controller.signal);
    const tools = normalizeMcpTools(server, result);
    return {
      ok: true,
      checkedAt,
      serverId: server.id,
      transport: "http",
      resolvedTarget: url,
      tools,
      message: tools.length ? `发现 ${tools.length} 个 MCP 工具。` : "MCP 连接成功，但未返回工具。"
    };
  } catch (error) {
    return {
      ok: false,
      checkedAt,
      serverId: server.id,
      transport: "http",
      resolvedTarget: url,
      tools: [],
      message: error instanceof Error ? `MCP tools/list 失败：${error.message}` : "MCP tools/list 失败。"
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function postMcpJsonRpc(url: string, id: number, method: string, params: unknown, signal: AbortSignal) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params
    }),
    signal
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}${text ? `: ${text.slice(0, 160)}` : ""}`);
  }
  const message = parseMcpJson(text, id);
  if (isMcpErrorMessage(message)) {
    throw new Error(message.error.message || `MCP error ${message.error.code}`);
  }
  if (!isRecord(message) || !("result" in message)) {
    throw new Error("MCP endpoint did not return a JSON-RPC result.");
  }
  return message.result;
}

async function discoverStdioMcpTools(
  server: McpServerToolsRequest["server"],
  timeoutMs: number,
  checkedAt: string
): Promise<McpServerToolsResult> {
  return new Promise((resolve) => {
    const command = server.command?.trim();
    if (!command) {
      resolve({
        ok: false,
        checkedAt,
        serverId: server.id,
        transport: "stdio",
        tools: [],
        message: "请先填写 stdio MCP 命令。"
      });
      return;
    }

    const child = spawn(command, server.args ?? [], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const pending = new Map<string, (message: Record<string, unknown>) => void>();
    let stdoutBuffer = "";
    let stderr = "";
    let finished = false;
    const timeout = setTimeout(() => {
      finish({
        ok: false,
        checkedAt,
        serverId: server.id,
        transport: "stdio",
        resolvedTarget: [command, ...(server.args ?? [])].join(" "),
        tools: [],
        message: `MCP tools/list 超时：${command}`
      });
    }, timeoutMs).unref();

    function finish(result: McpServerToolsResult) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      pending.clear();
      if (!child.killed) child.kill();
      resolve(result);
    }

    function send(message: Record<string, unknown>) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    }

    function request(id: number, method: string, params: unknown): Promise<unknown> {
      return new Promise((requestResolve, requestReject) => {
        pending.set(String(id), (message) => {
          if (isMcpErrorMessage(message)) {
            requestReject(new Error(message.error.message || `MCP error ${message.error.code}`));
            return;
          }
          if (!("result" in message)) {
            requestReject(new Error(`MCP ${method} did not return a result.`));
            return;
          }
          requestResolve(message.result);
        });
        send({ jsonrpc: "2.0", id, method, params });
      });
    }

    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString();
      let newlineIndex = stdoutBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const rawLine = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        newlineIndex = stdoutBuffer.indexOf("\n");
        if (!rawLine) continue;
        const message = parseOptionalMcpJson(rawLine);
        if (!message || !("id" in message)) continue;
        const handler = pending.get(String(message.id));
        if (handler) {
          pending.delete(String(message.id));
          handler(message);
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      finish({
        ok: false,
        checkedAt,
        serverId: server.id,
        transport: "stdio",
        resolvedTarget: [command, ...(server.args ?? [])].join(" "),
        tools: [],
        message: `MCP 命令启动失败：${error.message}`
      });
    });
    child.on("exit", (code) => {
      if (!finished) {
        finish({
          ok: false,
          checkedAt,
          serverId: server.id,
          transport: "stdio",
          resolvedTarget: [command, ...(server.args ?? [])].join(" "),
          tools: [],
          message: stderr.trim() || `MCP 命令过早退出，退出码 ${code ?? "unknown"}。`
        });
      }
    });

    void (async () => {
      try {
        await request(1, "initialize", buildMcpInitializeParams());
        send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
        const result = await request(2, "tools/list", {});
        const tools = normalizeMcpTools(server, result);
        finish({
          ok: true,
          checkedAt,
          serverId: server.id,
          transport: "stdio",
          resolvedTarget: [command, ...(server.args ?? [])].join(" "),
          tools,
          message: tools.length ? `发现 ${tools.length} 个 MCP 工具。` : "MCP 连接成功，但未返回工具。"
        });
      } catch (error) {
        finish({
          ok: false,
          checkedAt,
          serverId: server.id,
          transport: "stdio",
          resolvedTarget: [command, ...(server.args ?? [])].join(" "),
          tools: [],
          message: error instanceof Error ? `MCP tools/list 失败：${error.message}` : "MCP tools/list 失败。"
        });
      }
    })();
  });
}

function buildMcpInitializeParams() {
  return {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: {
      name: "NexaDesk",
      version: process.env.NEXADESK_APP_VERSION ?? "0.1.0"
    }
  };
}

function normalizeMcpTools(server: McpServerToolsRequest["server"], result: unknown): McpToolDefinition[] {
  if (!isRecord(result) || !Array.isArray(result.tools)) {
    return [];
  }
  return result.tools
    .filter(
      (tool): tool is Record<string, unknown> =>
        isRecord(tool) && typeof tool.name === "string" && Boolean(tool.name.trim())
    )
    .map((tool) => {
      const name = typeof tool.name === "string" ? tool.name : String(tool.name);
      return {
        id: `${server.id}:${name}`,
        serverId: server.id,
        serverName: server.name,
        name,
        title: typeof tool.title === "string" ? tool.title : undefined,
        description: typeof tool.description === "string" && tool.description.trim() ? tool.description : "MCP tool",
        inputSchema: "inputSchema" in tool ? tool.inputSchema : undefined
      };
    });
}

function parseMcpJson(text: string, id: number) {
  const parsed = JSON.parse(text) as unknown;
  if (Array.isArray(parsed)) {
    const message = parsed.find((item) => isRecord(item) && item.id === id);
    if (message) {
      return message;
    }
  }
  return parsed;
}

function parseOptionalMcpJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isMcpErrorMessage(message: unknown): message is { error: { code?: number; message?: string } } {
  return isRecord(message) && isRecord(message.error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function runProcess(command: string, args: string[], timeoutMs: number) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      resolve({ code: null, stdout, stderr: `Process timed out: ${command}` });
    }, timeoutMs).unref();

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
}

function hasPathSegment(command: string) {
  return /[\\/]/.test(command);
}
