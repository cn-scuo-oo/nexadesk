import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type {
  AgentToolName,
  PermissionRisk,
  ToolCall,
  WorkspaceFilePreviewResult,
  WorkspaceListResult,
  WorkspaceSearchMatch,
  WorkspaceSearchMode,
  WorkspaceSearchResult,
  WorkspaceSettings,
  WorkspaceTreeEntry
} from "@nexadesk/shared";

const execFileAsync = promisify(execFile);
const maxPreviewFileSize = 256_000;
const maxWorkspaceSearchEntries = 3000;
const maxWorkspaceSearchMatches = 80;
const ignoredWorkspaceEntries = new Set([".git", "node_modules", "dist", "build", "release", ".vite", ".turbo", ".cache"]);

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
      result: error instanceof Error ? error.message : "工具执行失败。",
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
      return "未知工具。";
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
    return `列目录：${request.path || "."}`;
  }
  if (request.tool === "read_file") {
    return `读取文件：${request.path || ""}`;
  }
  if (request.tool === "write_file") {
    return `写入文件：${request.path || ""}`;
  }
  if (request.tool === "run_command") {
    return `执行命令：${request.command || ""}`;
  }
  if (request.tool === "search") {
    return `搜索：${request.query || ""}`;
  }
  if (request.tool === "browser") {
    return `浏览器操作：${request.url || request.prompt || ""}`;
  }
  return `图片生成：${request.prompt || ""}`;
}

async function listDir(request: AgentToolRequest, workspace: WorkspaceSettings) {
  const target = resolveWorkspacePath(workspace, request.path || ".");
  const entries = await readdir(target, { withFileTypes: true });
  return entries
    .slice(0, 120)
    .map((entry) => `${entry.isDirectory() ? "dir " : "file"} ${entry.name}`)
    .join("\n");
}

export async function listWorkspaceDirectory(
  workspace: WorkspaceSettings,
  inputPath = "."
): Promise<WorkspaceListResult> {
  const root = getWorkspaceRoot(workspace);
  let target = root;
  let currentPath = inputPath || ".";

  try {
    target = resolveWorkspacePath(workspace, inputPath || ".");
    currentPath = toWorkspacePath(relative(root, target)) || ".";
    const info = await stat(target);
    if (!info.isDirectory()) {
      return {
        root,
        path: currentPath,
        entries: [],
        exists: false,
        error: "当前路径不是目录。"
      };
    }

    const rawEntries = await readdir(target, { withFileTypes: true });
    const entries = await Promise.all(
      rawEntries.slice(0, 160).map(async (entry): Promise<WorkspaceTreeEntry> => {
        const childPath = join(target, entry.name);
        const relativePath = toWorkspacePath(relative(root, childPath)) || entry.name;
        const childInfo = await stat(childPath).catch(() => null);
        return {
          name: entry.name,
          path: relativePath,
          kind: entry.isDirectory() ? "folder" : "file",
          size: childInfo?.isFile() ? childInfo.size : undefined,
          modifiedAt: childInfo?.mtime ? childInfo.mtime.toISOString() : undefined
        };
      })
    );

    entries.sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "folder" ? -1 : 1;
      }
      return left.name.localeCompare(right.name, "zh-CN");
    });

    return {
      root,
      path: currentPath,
      entries,
      exists: true,
      error: rawEntries.length > entries.length ? `仅显示前 ${entries.length} 项。` : undefined
    };
  } catch (error) {
    return {
      root,
      path: currentPath,
      entries: [],
      exists: false,
      error: error instanceof Error ? error.message : "工作区目录读取失败。"
    };
  }
}

export async function readWorkspaceFilePreview(
  workspace: WorkspaceSettings,
  inputPath: string
): Promise<WorkspaceFilePreviewResult> {
  const root = getWorkspaceRoot(workspace);
  let currentPath = inputPath || "";

  try {
    if (!inputPath) {
      throw new Error("需要提供文件路径。");
    }
    const target = resolveWorkspacePath(workspace, inputPath);
    currentPath = toWorkspacePath(relative(root, target)) || basename(target);
    const info = await stat(target);
    if (!info.isFile()) {
      return {
        root,
        path: currentPath,
        name: basename(target),
        content: "",
        exists: false,
        error: "当前路径不是文件。"
      };
    }
    if (info.size > maxPreviewFileSize) {
      return {
        root,
        path: currentPath,
        name: basename(target),
        content: "",
        size: info.size,
        modifiedAt: info.mtime.toISOString(),
        exists: true,
        truncated: true,
        error: `文件超过 ${formatSize(maxPreviewFileSize)}，当前预览和 read_file 工具会拒绝读取，请先缩小文件范围。`
      };
    }

    return {
      root,
      path: currentPath,
      name: basename(target),
      content: await readFile(target, "utf8"),
      size: info.size,
      modifiedAt: info.mtime.toISOString(),
      exists: true
    };
  } catch (error) {
    return {
      root,
      path: currentPath,
      name: basename(currentPath || inputPath || "file"),
      content: "",
      exists: false,
      error: error instanceof Error ? error.message : "文件读取失败。"
    };
  }
}

export async function searchWorkspaceFiles({
  workspace,
  query,
  mode,
  inputPath = "."
}: {
  workspace: WorkspaceSettings;
  query: string;
  mode: WorkspaceSearchMode;
  inputPath?: string;
}): Promise<WorkspaceSearchResult> {
  const root = getWorkspaceRoot(workspace);
  const normalizedQuery = query.trim();
  let currentPath = inputPath || ".";
  const matches: WorkspaceSearchMatch[] = [];
  let searchedEntries = 0;
  let truncated = false;

  try {
    const target = resolveWorkspacePath(workspace, inputPath || ".");
    currentPath = toWorkspacePath(relative(root, target)) || ".";
    if (!normalizedQuery) {
      return { root, path: currentPath, query: normalizedQuery, mode, matches, searchedEntries };
    }
    const info = await stat(target);
    if (!info.isDirectory()) {
      return {
        root,
        path: currentPath,
        query: normalizedQuery,
        mode,
        matches,
        searchedEntries,
        error: "搜索路径不是目录。"
      };
    }

    await walkSearchDirectory(target, root, normalizedQuery.toLocaleLowerCase(), mode, {
      onEntry() {
        searchedEntries += 1;
        if (searchedEntries >= maxWorkspaceSearchEntries) {
          truncated = true;
          return false;
        }
        return matches.length < maxWorkspaceSearchMatches;
      },
      onMatch(match) {
        if (matches.length < maxWorkspaceSearchMatches) {
          matches.push(match);
        }
      }
    });

    return {
      root,
      path: currentPath,
      query: normalizedQuery,
      mode,
      matches,
      searchedEntries,
      truncated: truncated || matches.length >= maxWorkspaceSearchMatches,
      error: truncated ? `仅搜索前 ${maxWorkspaceSearchEntries} 项。` : undefined
    };
  } catch (error) {
    return {
      root,
      path: currentPath,
      query: normalizedQuery,
      mode,
      matches,
      searchedEntries,
      error: error instanceof Error ? error.message : "工作区搜索失败。"
    };
  }
}

async function readWorkspaceFile(request: AgentToolRequest, workspace: WorkspaceSettings) {
  if (!request.path) {
    throw new Error("read_file 需要 path。");
  }
  const target = resolveWorkspacePath(workspace, request.path);
  const info = await stat(target);
  if (!info.isFile()) {
    throw new Error("只能读取文件。");
  }
  if (info.size > 256_000) {
    throw new Error("文件超过 256KB，请缩小范围后再读取。");
  }
  return readFile(target, "utf8");
}

async function writeWorkspaceFile(request: AgentToolRequest, workspace: WorkspaceSettings) {
  if (!request.path) {
    throw new Error("write_file 需要 path。");
  }
  const target = resolveWorkspacePath(workspace, request.path);
  await writeFile(target, request.content ?? "", "utf8");
  return `已写入 ${target}`;
}

async function searchWorkspace(request: AgentToolRequest, workspace: WorkspaceSettings) {
  if (!request.query) {
    throw new Error("search 需要 query。");
  }
  const cwd = resolveWorkspacePath(workspace, request.path || ".");
  const { stdout } = await execFileAsync("rg", ["--line-number", "--hidden", "--glob", "!node_modules", request.query], {
    cwd,
    timeout: 10_000,
    windowsHide: true,
    maxBuffer: 256_000
  }).catch((error: any) => {
    if (error?.code === 1) {
      return { stdout: "没有匹配结果。" };
    }
    throw error;
  });
  return stdout.slice(0, 12_000);
}

async function runCommand(request: AgentToolRequest, workspace: WorkspaceSettings) {
  if (!request.command) {
    throw new Error("run_command 需要 command。");
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
    throw new Error("browser 需要 url。");
  }
  const url = new URL(request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("browser 只支持 http/https URL。");
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
      throw new Error(`网页读取失败：HTTP ${response.status}`);
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
    throw new Error("image_generate 需要 prompt。");
  }
  if (!context.image?.baseUrl) {
    throw new Error("图片生成需要配置 OpenAI Official API Key，或设置 NEXADESK_IMAGE_BASE_URL / NEXADESK_IMAGE_API_KEY。");
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
    throw new Error(`图片生成失败：HTTP ${response.status}${detail ? ` - ${detail.slice(0, 240)}` : ""}`);
  }

  const payload = (await response.json()) as any;
  const item = payload?.data?.[0];
  if (!item) {
    throw new Error("图片生成接口没有返回图片数据。");
  }

  await mkdir(context.image.outputDirectory, { recursive: true });
  const fileBase = `image-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  if (typeof item.b64_json === "string") {
    const path = join(context.image.outputDirectory, `${fileBase}.png`);
    await writeFile(path, Buffer.from(item.b64_json, "base64"));
    return `图片已生成：${path}`;
  }

  if (typeof item.url === "string") {
    const imageResponse = await fetch(item.url);
    if (!imageResponse.ok) {
      throw new Error(`图片下载失败：HTTP ${imageResponse.status}`);
    }
    const contentType = imageResponse.headers.get("content-type") ?? "image/png";
    const ext = imageExtension(contentType, item.url);
    const path = join(context.image.outputDirectory, `${fileBase}${ext}`);
    await writeFile(path, Buffer.from(await imageResponse.arrayBuffer()));
    return `图片已生成：${path}\n源地址：${item.url}`;
  }

  throw new Error("图片生成接口返回格式不受支持。");
}

export function resolveWorkspacePath(workspace: WorkspaceSettings, inputPath: string) {
  const roots = getWorkspaceRoots(workspace);
  const base = getWorkspaceRoot(workspace);
  const target = resolve(base, inputPath);
  if (!roots.some((root) => isPathInside(root, target))) {
    throw new Error("路径不在允许的工作区范围内。");
  }
  return target;
}

export function getWorkspaceRoot(workspace: WorkspaceSettings) {
  return resolve(workspace.defaultWorkspace || workspace.allowedRoots[0] || ".");
}

function getWorkspaceRoots(workspace: WorkspaceSettings) {
  const roots = Array.from(new Set([workspace.defaultWorkspace, ...workspace.allowedRoots].filter(Boolean)));
  return (roots.length ? roots : ["."]).map((root) => resolve(root));
}

function isPathInside(root: string, target: string) {
  const normalizedRoot = root.endsWith(sep) ? root : `${root}${sep}`;
  return target === root || target.startsWith(normalizedRoot);
}

function toWorkspacePath(path: string) {
  return path.split(sep).join("/");
}

async function walkSearchDirectory(
  directory: string,
  root: string,
  query: string,
  mode: WorkspaceSearchMode,
  callbacks: {
    onEntry: () => boolean;
    onMatch: (match: WorkspaceSearchMatch) => void;
  }
) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  entries.sort((left, right) => {
    if (left.isDirectory() !== right.isDirectory()) {
      return left.isDirectory() ? -1 : 1;
    }
    return left.name.localeCompare(right.name, "zh-CN");
  });

  for (const entry of entries) {
    if (!callbacks.onEntry()) {
      return;
    }
    if (isIgnoredWorkspaceEntry(entry.name)) {
      continue;
    }

    const childPath = join(directory, entry.name);
    const relativePath = toWorkspacePath(relative(root, childPath)) || entry.name;
    const info = await stat(childPath).catch(() => null);
    const kind = entry.isDirectory() ? "folder" : "file";

    if (mode === "name" && entry.name.toLocaleLowerCase().includes(query)) {
      callbacks.onMatch({
        name: entry.name,
        path: relativePath,
        kind,
        size: info?.isFile() ? info.size : undefined,
        modifiedAt: info?.mtime ? info.mtime.toISOString() : undefined
      });
    }

    if (mode === "content" && entry.isFile() && info?.size !== undefined && info.size <= maxPreviewFileSize) {
      const match = await findContentMatch(childPath, relativePath, entry.name, info.size, info.mtime.toISOString(), query);
      if (match) {
        callbacks.onMatch(match);
      }
    }

    if (entry.isDirectory()) {
      await walkSearchDirectory(childPath, root, query, mode, callbacks);
    }
  }
}

async function findContentMatch(
  filePath: string,
  relativePath: string,
  name: string,
  size: number,
  modifiedAt: string,
  query: string
) {
  try {
    const content = await readFile(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    const lineIndex = lines.findIndex((line) => line.toLocaleLowerCase().includes(query));
    if (lineIndex === -1) {
      return null;
    }
    const matchedLine = lines[lineIndex] ?? "";
    return {
      name,
      path: relativePath,
      kind: "file" as const,
      size,
      modifiedAt,
      line: lineIndex + 1,
      preview: matchedLine.trim().slice(0, 220)
    };
  } catch {
    return null;
  }
}

function isIgnoredWorkspaceEntry(name: string) {
  return ignoredWorkspaceEntries.has(name.toLocaleLowerCase());
}

function formatSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
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
