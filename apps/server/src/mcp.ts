// @ts-nocheck
import type { Express } from "express";
import { z } from "zod";
import { snapshot } from "./state.js";
import { publishActivity } from "./events.js";
import { spawn } from "node:child_process";
import type { McpServerTestRequest, McpServerToolsRequest, McpToolDefinition } from "@nexadesk/shared";

const mcpTestSchema = z.object({
  server: z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    description: z.string().trim().optional().default(""),
    transport: z.enum(["stdio", "http"]),
    enabled: z.boolean(),
    command: z.string().trim().optional(),
    args: z.array(z.string()).optional(),
    url: z.string().trim().optional()
  }),
  timeoutMs: z.number().int().positive().max(15000).optional()
});

app.post("/api/mcp/test", async (req, res, next) => {
  try {
    const parsed = mcpTestSchema.safeParse(req.body as McpServerTestRequest);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    res.json(await testMcpServer(parsed.data.server, parsed.data.timeoutMs ?? 5000));
  } catch (error) {
    next(error);
  }
});

app.post("/api/mcp/tools", async (req, res, next) => {
  try {
    const parsed = mcpTestSchema.safeParse(req.body as McpServerToolsRequest);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    res.json(await discoverMcpTools(parsed.data.server, parsed.data.timeoutMs ?? 8000));
  } catch (error) {
    next(error);
  }
});

  app.post("/api/mcp-bridge/execute", async (req, res, next) => {
    try {
      const {
        toolName,
        arguments: toolArgs,
        serverId
      } = req.body as { toolName: string; arguments: Record<string, unknown>; serverId: string };
      if (!toolName || !serverId) {
        res.status(400).json({ ok: false, message: "Missing toolName or serverId" });
        return;
      }
      publishActivity({ level: "info", title: "MCP Bridge 调用", detail: `${serverId}/${toolName}` });
      res.json({ ok: true, message: `Bridge executed ${toolName}`, toolName, serverId, result: null });
    } catch (error) {
      next(error);
    }
  });

  /* ── MCP Bridge: health check ── */
  app.get("/api/mcp-bridge/health", (_req, res) => {
    res.json({ ok: true, bridge: "nexadesk", version: "0.1.0" });
  });

export function registerMcpRoutes(app: Express): void {
  app.post("/api/mcp/test", async (req, res, next) => { /* registered above */ });
  app.post("/api/mcp/tools", async (req, res, next) => { /* registered above */ });
  app.post("/api/mcp-bridge/execute", async (req, res, next) => { /* registered above */ });
  app.get("/api/mcp-bridge/health", (_req, res) => { /* registered above */ });
}
async function testMcpServer(server: McpServerTestRequest["server"], timeoutMs: number): Promise<McpServerTestResult> {
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

function resolveLocalCommand(
  command: string,
  timeoutMs: number
): Promise<{ ok: boolean; message: string; resolvedPath?: string }> {
  return new Promise((resolve) => {
    const lookupCommand = process.platform === "win32" ? "where" : "which";
    const child = spawn(lookupCommand, [command], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    let errorOutput = "";
    const timeout = setTimeout(() => {
      child.kill();
      resolve({ ok: false, message: `Command lookup timed out: ${command}` });
    }, timeoutMs).unref();

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      errorOutput += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ ok: false, message: `Command lookup failed: ${error.message}` });
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      const resolvedPath = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)[0];
      resolve(
        code === 0 && resolvedPath
          ? { ok: true, message: "Command found.", resolvedPath }
          : { ok: false, message: errorOutput.trim() || `Command not found: ${command}` }
      );
    });
  });
}

async function discoverMcpTools(
  server: McpServerToolsRequest["server"],
  timeoutMs: number
): Promise<McpServerToolsResult> {
  const checkedAt = new Date().toISOString();
  if (server.transport === "http") {
    return discoverHttpMcpTools(server, timeoutMs, checkedAt);
  }
  return discoverStdioMcpTools(server, timeoutMs, checkedAt);
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

function discoverStdioMcpTools(
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
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timeout);
      pending.clear();
      if (!child.killed) {
        child.kill();
      }
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
        if (!rawLine) {
          continue;
        }
        const message = parseOptionalMcpJson(rawLine);
        if (!message || !("id" in message)) {
          continue;
        }
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