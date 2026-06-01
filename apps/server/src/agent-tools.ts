import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { AgentToolName, PermissionRisk, ToolCall, WorkspaceSettings } from "@nexadesk/shared";

const execFileAsync = promisify(execFile);

export type AgentToolRequest = {
  tool: AgentToolName;
  path?: string;
  content?: string;
  command?: string;
  query?: string;
  url?: string;
  prompt?: string;
  size?: string;
  model?: string;
};

export type AgentToolContext = {
  workspace: WorkspaceSettings;
  image?: {
    baseUrl: string;
    apiKey?: string;
    model: string;
    outputDirectory: string;
  };
};

export type AgentToolExecution = {
  toolCall: ToolCall;
  result?: string;
  requiresApproval: boolean;
};

export function parseToolRequests(text: string): AgentToolRequest[] {
  const requests: AgentToolRequest[] = [];
  const blockPattern = /```(?:nexadesk-tool|aion-tool)\s*([\s\S]*?)```/g;
  for (const match of text.matchAll(blockPattern)) {
    const parsed = parseToolJson(match[1]);
    if (parsed) {
      requests.push(...parsed);
    }
  }
  return requests;
}

export async function prepareToolRequest(
  request: AgentToolRequest,
  context: AgentToolContext
): Promise<AgentToolExecution> {
  const risk = getToolRisk(request.tool);
  const toolCall: ToolCall = {
    id: randomUUID(),
    name: request.tool,
    status: risk === "low" ? "running" : "queued",
    risk,
    summary: summarizeToolRequest(request)
  };

  if (risk !== "low") {
    return { toolCall, requiresApproval: true };
  }

  try {
    const result = await executeToolRequest(request, context);
    return {
      toolCall: { ...toolCall, status: "completed" },
      result,
      requiresApproval: false
    };
  } catch (error) {
    return {
      toolCall: { ...toolCall, status: "failed" },
      result: error instanceof Error ? error.message : "宸ュ叿鎵ц澶辫触銆?",
      requiresApproval: false
    };
  }
}

export async function executeToolRequest(request: AgentToolRequest, context: AgentToolContext): Promise<string> {
  switch (request.tool) {
    case "list_dir":
      return listDir(request, context.workspace);
    case "read_file":
      return readWorkspaceFile(request, context.workspace);
    case "write_file":
      return writeWorkspaceFile(request, context.workspace);
    case "run_command":
      return runCommand(request, context.workspace);
    case "search":
      return searchWorkspace(request, context.workspace);
    case "browser":
      return readWebPage(request);
    case "image_generate":
      return generateImage(request, context);
    default:
      return "鏈煡宸ュ叿銆?";
  }
}

export function getToolRisk(tool: AgentToolName): PermissionRisk {
  if (tool === "list_dir" || tool === "read_file" || tool === "search") {
    return "low";
  }
  if (tool === "write_file") {
    return "medium";
  }
  return "high";
}

export function summarizeToolRequest(request: AgentToolRequest) {
  if (request.tool === "list_dir") {
    return `鍒楃洰褰曪細${request.path || "."}`;
  }
  if (request.tool === "read_file") {
    return `璇诲彇鏂囦欢锛?{request.path || ""}`;
  }
  if (request.tool === "write_file") {
    return `鍐欏叆鏂囦欢锛?{request.path || ""}`;
  }
  if (request.tool === "run_command") {
    return `鎵ц鍛戒护锛?{request.command || ""}`;
  }
  if (request.tool === "search") {
    return `鎼滅储锛?{request.query || ""}`;
  }
  if (request.tool === "browser") {
    return `娴忚鍣ㄦ搷浣滐細${request.url || request.prompt || ""}`;
  }
  return `鍥剧墖鐢熸垚锛?{request.prompt || ""}`;
}

async function listDir(request: AgentToolRequest, workspace: WorkspaceSettings) {
  const target = resolveWorkspacePath(workspace, request.path || ".");
  const entries = await readdir(target, { withFileTypes: true });
  return entries
    .slice(0, 120)
    .map((entry) => `${entry.isDirectory() ? "dir " : "file"} ${entry.name}`)
    .join("\n");
}

async function readWorkspaceFile(request: AgentToolRequest, workspace: WorkspaceSettings) {
  if (!request.path) {
    throw new Error("read_file 闇€瑕?path銆?");
  }
  const target = resolveWorkspacePath(workspace, request.path);
  const info = await stat(target);
  if (!info.isFile()) {
    throw new Error("鍙兘璇诲彇鏂囦欢銆?");
  }
  if (info.size > 256_000) {
    throw new Error("鏂囦欢瓒呰繃 256KB锛岃缂╁皬鑼冨洿鍚庡啀璇诲彇銆?");
  }
  return readFile(target, "utf8");
}

async function writeWorkspaceFile(request: AgentToolRequest, workspace: WorkspaceSettings) {
  if (!request.path) {
    throw new Error("write_file 闇€瑕?path銆?");
  }
  const target = resolveWorkspacePath(workspace, request.path);
  await writeFile(target, request.content ?? "", "utf8");
  return `宸插啓鍏?${target}`;
}

async function searchWorkspace(request: AgentToolRequest, workspace: WorkspaceSettings) {
  if (!request.query) {
    throw new Error("search 闇€瑕?query銆?");
  }
  const cwd = resolveWorkspacePath(workspace, request.path || ".");
  const { stdout } = await execFileAsync("rg", ["--line-number", "--hidden", "--glob", "!node_modules", request.query], {
    cwd,
    timeout: 10_000,
    windowsHide: true,
    maxBuffer: 256_000
  }).catch((error: any) => {
    if (error?.code === 1) {
      return { stdout: "娌℃湁鍖归厤缁撴灉銆?" };
    }
    throw error;
  });
  return stdout.slice(0, 12_000);
}

async function runCommand(request: AgentToolRequest, workspace: WorkspaceSettings) {
  if (!request.command) {
    throw new Error("run_command 闇€瑕?command銆?");
  }
  const cwd = resolveWorkspacePath(workspace, request.path || ".");
  const { stdout, stderr } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", request.command], {
    cwd,
    timeout: 30_000,
    windowsHide: true,
    maxBuffer: 512_000
  });
  return `${stdout}${stderr ? `\n${stderr}` : ""}`.slice(0, 16_000);
}

async function readWebPage(request: AgentToolRequest) {
  if (!request.url) {
    throw new Error("browser 闇€瑕?url銆?");
  }
  const url = new URL(request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("browser 鍙敮鎸?http/https URL銆?");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000).unref();
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "NexaDesk/0.1 (+local agent browser tool)"
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`缃戦〉璇诲彇澶辫触锛欻TTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    const raw = await response.text();
    if (!contentType.includes("text/html")) {
      return `URL: ${url.href}\nContent-Type: ${contentType || "unknown"}\n\n${raw.slice(0, 12_000)}`;
    }
    return extractPageText(url.href, raw);
  } finally {
    clearTimeout(timeout);
  }
}

async function generateImage(request: AgentToolRequest, context: AgentToolContext) {
  if (!request.prompt?.trim()) {
    throw new Error("image_generate 闇€瑕?prompt銆?");
  }
  if (!context.image?.baseUrl) {
    throw new Error("鍥剧墖鐢熸垚闇€瑕侀厤缃?OpenAI Official API Key锛屾垨璁剧疆 NEXADESK_IMAGE_BASE_URL / NEXADESK_IMAGE_API_KEY銆?");
  }

  const baseUrl = context.image.baseUrl.replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(context.image.apiKey ? { Authorization: `Bearer ${context.image.apiKey}` } : {})
    },
    body: JSON.stringify({
      model: request.model || context.image.model,
      prompt: request.prompt,
      size: request.size || "1024x1024"
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`鍥剧墖鐢熸垚澶辫触锛欻TTP ${response.status}${detail ? ` - ${detail.slice(0, 240)}` : ""}`);
  }

  const payload = (await response.json()) as any;
  const item = payload?.data?.[0];
  if (!item) {
    throw new Error("鍥剧墖鐢熸垚鎺ュ彛娌℃湁杩斿洖鍥剧墖鏁版嵁銆?");
  }

  await mkdir(context.image.outputDirectory, { recursive: true });
  const fileBase = `image-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  if (typeof item.b64_json === "string") {
    const path = join(context.image.outputDirectory, `${fileBase}.png`);
    await writeFile(path, Buffer.from(item.b64_json, "base64"));
    return `鍥剧墖宸茬敓鎴愶細${path}`;
  }

  if (typeof item.url === "string") {
    const imageResponse = await fetch(item.url);
    if (!imageResponse.ok) {
      throw new Error(`鍥剧墖涓嬭浇澶辫触锛欻TTP ${imageResponse.status}`);
    }
    const contentType = imageResponse.headers.get("content-type") ?? "image/png";
    const ext = imageExtension(contentType, item.url);
    const path = join(context.image.outputDirectory, `${fileBase}${ext}`);
    await writeFile(path, Buffer.from(await imageResponse.arrayBuffer()));
    return `鍥剧墖宸茬敓鎴愶細${path}\n婧愬湴鍧€锛?{item.url}`;
  }

  throw new Error("鍥剧墖鐢熸垚鎺ュ彛杩斿洖鏍煎紡涓嶅彈鏀寔銆?");
}

function resolveWorkspacePath(workspace: WorkspaceSettings, inputPath: string) {
  const roots = workspace.allowedRoots.length ? workspace.allowedRoots : [workspace.defaultWorkspace];
  const base = resolve(roots[0] || ".");
  const target = resolve(base, inputPath);
  const normalizedBase = base.endsWith(sep) ? base : `${base}${sep}`;
  if (target !== base && !target.startsWith(normalizedBase)) {
    throw new Error("璺緞涓嶅湪鍏佽鐨勫伐浣滃尯鑼冨洿鍐呫€?");
  }
  return target;
}

function extractPageText(url: string, html: string) {
  const title = matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    matchFirst(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i) ||
    matchFirst(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i);
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

  return [`URL: ${url}`, title ? `Title: ${title}` : "", description ? `Description: ${description}` : "", "", text.slice(0, 12_000)]
    .filter((line) => line !== "")
    .join("\n");
}

function matchFirst(input: string, pattern: RegExp) {
  return input.match(pattern)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

function imageExtension(contentType: string, url: string) {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    return ".jpg";
  }
  if (contentType.includes("webp")) {
    return ".webp";
  }
  if (contentType.includes("png")) {
    return ".png";
  }
  const parsed = extname(new URL(url).pathname);
  return parsed || ".png";
}

function parseToolJson(raw: string | undefined): AgentToolRequest[] | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw.trim());
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items.filter(isToolRequest);
  } catch {
    return null;
  }
}

function isToolRequest(value: unknown): value is AgentToolRequest {
  if (!value || typeof value !== "object") {
    return false;
  }
  const tool = (value as { tool?: unknown }).tool;
  return (
    tool === "list_dir" ||
    tool === "read_file" ||
    tool === "write_file" ||
    tool === "run_command" ||
    tool === "search" ||
    tool === "browser" ||
    tool === "image_generate"
  );
}

