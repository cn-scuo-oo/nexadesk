// @ts-nocheck
import {
  Bot,
  Brain,
  Check,
  CircleDot,
  Database,
  FileText,
  Folder,
  KeyRound,
  ListChecks,
  Mail,
  Pencil,
  Pin,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Tag,
  Terminal,
  Trash2,
  Users,
  Workflow,
  X,
  Zap,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";
import { FormEvent, type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  createDefaultProviders,
  createDefaultSettings,
  createDemoSnapshot,
  type AutomationScheduleKind,
  type AgentEngineDetectionRecord,
  type AgentEngineSettings,
  type ActivityEvent,
  type ApprovalHistoryEntry,
  type AppSettings,
  type AgentProfile,
  type AppSnapshot,
  type ChatMessage,
  type DesktopStatus,
  type McpServerSettings,
  type McpServerToolsResult,
  type McpServerTestResult,
  type McpToolDefinition,
  type McpToolPolicy,
  type MemoryEntry,
  type MemoryEntryKind,
  type SessionSummary,
  type ModelProvider,
  type PermissionRequest,
  type PermissionPolicy,
  type ProviderModelsResult,
  type ProviderApiMode,
  type ProviderCapability,
  type ProviderSecretUpdate,
  type ProviderSettings,
  type ProviderStatusSettings,
  type ProviderStatusRecord,
  type ProviderModelsStatusRecord,
  type ProviderTestResult,
  type RuntimeTelemetryEntry,
  type SkillProfile,
  type ToolCall,
  type WorkspaceFilePreviewResult,
  type WorkspaceFile,
  type WorkspaceListResult,
  type WorkspaceTreeEntry
} from "@nexadesk/shared";
import {
  createAutomation,
  detectAgentEngines,
  deleteSession,
  fetchDesktopStatus,
  fetchMcpServerTools,
  fetchProviderModels,
  fetchSettings as fetchAppSettings,
  fetchSnapshot,
  fetchWorkspaceFile,
  fetchWorkspaceList,
  recoverSettings as recoverAppSettings,
  resolveApproval,
  runAutomation,
  saveSettings as persistAppSettings,
  fetchRuntimeTelemetry,
  saveRuntimeTelemetry,
  streamMessage,
  subscribeActivity,
  testProvider,
  testMcpServer,
  updateAutomation,
  updateSession
} from "./api";
import {
  readInitialAppView,
  readStoredBoolean,
  settingsTabGroups,
  settingsTabs,
  writeStoredBoolean,
  type AppView,
  type SettingsTab
} from "./lib/app-shell";
import { applyChatStreamEvent } from "./lib/chat-stream";
import type { RuntimeDashboardStats } from "./lib/runtime-metrics";
import {
  automationRunStatusLabel,
  automationScheduleKindLabel,
  policyLabel,
  runtimeStatusLabel,
  toolNameLabel,
  toolStatusLabel
} from "./lib/labels";
import { buildRuntimeDashboardStats, estimateTokenCount } from "./lib/runtime-metrics";

declare global {
  interface Window {
    nexadeskDesktop?: {
      selectDirectory(options?: { title?: string; defaultPath?: string }): Promise<string | null>;
    };
  }
}

type DataMode = "live" | "demo";

type ProviderDraft = {
  id: string;
  name: string;
  kind: ProviderSettings["kind"];
  connected: boolean;
  baseUrl: string;
  apiMode: ProviderApiMode;
  apiKey: string;
  modelsText: string;
  defaultModel: string;
  apiKeyConfigured: boolean;
  capabilities: Record<ProviderCapability, boolean>;
};

type ProviderMatrixItem = {
  id: string;
  label: string;
  baseUrl: string;
  apiMode: ProviderApiMode;
  requiredModels: string[];
  requiredCapabilities: ProviderCapability[];
  envKey: string;
  officialUrl: string;
};

const workspaceContextCollapsedStorageKey = "nexadesk.workspaceContext.collapsed";
const sidebarCollapsedStorageKey = "nexadesk.sidebar.collapsed";
const workspaceRecentFilesStorageKey = "nexadesk.workspaceContext.recentFiles";
const runtimeTelemetryStorageKey = "nexadesk.runtime.telemetry";
const maxWorkspaceRecentFiles = 8;
const maxRuntimeTelemetryEntries = 80;

const apiModeOptions: Array<{ value: ProviderApiMode; label: string }> = [
  { value: "responses", label: "OpenAI Responses API" },
  { value: "chat_completions", label: "OpenAI 兼容 Chat Completions" },
  { value: "anthropic_messages", label: "Anthropic Messages" },
  { value: "ollama_generate", label: "Ollama 本地接口" }
];

const capabilityOptions: Array<{ value: ProviderCapability; label: string; hint: string }> = [
  { value: "streaming", label: "Streaming", hint: "Token or event streaming" },
  { value: "function_calling", label: "Tool calling", hint: "function calling / tool use" },
  { value: "vision", label: "Vision", hint: "Image understanding and multimodal input" },
  { value: "web_search", label: "Web search", hint: "Built-in or provider-routed search" },
  { value: "file_search", label: "File search", hint: "File upload, knowledge base, or vector search" },
  { value: "structured_output", label: "Structured output", hint: "JSON/schema mode" }
];

const fontOptions = [
  "Inter, Microsoft YaHei",
  "Microsoft YaHei",
  "PingFang SC",
  "Noto Sans SC",
  "Source Han Sans SC",
  "Arial",
  "Segoe UI",
  "JetBrains Mono",
  "Fira Code",
  "Custom"
];

/* ── Theme System ── */
type ThemeAppearance = "light" | "dark";
type ThemeId =
  | "honey-warm"
  | "classic-dark"
  | "midnight"
  | "nord"
  | "emerald"
  | "sakura"
  | "rose"
  | "cyber"
  | "paper"
  | "mocha"
  | "ocean"
  | "dawn"
  | "sunset"
  | "daylight";
type ThemeMode = "light" | "dark" | "system";
interface ThemeMeta {
  id: ThemeId;
  name: string;
  description: string;
  appearance: ThemeAppearance;
  preview: string[];
}
const THEMES: ThemeMeta[] = [
  {
    id: "honey-warm",
    name: "蜂蜜暖光",
    description: "NexaDesk 默认暖色主题",
    appearance: "light",
    preview: ["#fff4c8", "#1f6b50", "#d97800", "#2e6f55"]
  },
  {
    id: "daylight",
    name: "日光清透",
    description: "清爽蓝调浅色主题",
    appearance: "light",
    preview: ["#f0f4f8", "#1f6b50", "#0ea5e9", "#2e6f55"]
  },
  {
    id: "paper",
    name: "纸墨淡雅",
    description: "仿纸质感温暖浅色",
    appearance: "light",
    preview: ["#f5f0e8", "#1f6b50", "#b8860b", "#2e6f55"]
  },
  {
    id: "sakura",
    name: "樱花粉白",
    description: "柔和粉色主题",
    appearance: "light",
    preview: ["#fdf2f8", "#ec4899", "#a855f7", "#10b981"]
  },
  {
    id: "classic-dark",
    name: "经典深色",
    description: "纯净近黑暗色主题",
    appearance: "dark",
    preview: ["#0f1117", "#1f6b50", "#d97800", "#3daa7a"]
  },
  {
    id: "midnight",
    name: "午夜深蓝",
    description: "深邃冷调暗色主题",
    appearance: "dark",
    preview: ["#0f172a", "#14b8a6", "#d97800", "#14b8a6"]
  },
  {
    id: "nord",
    name: "Nord 极光",
    description: "受 Nord 配色启发",
    appearance: "dark",
    preview: ["#2e3440", "#88c0d0", "#ebcb8b", "#a3be8c"]
  },
  {
    id: "emerald",
    name: "翡翠暗绿",
    description: "自然灵动翡翠绿",
    appearance: "dark",
    preview: ["#0a1a14", "#10b981", "#67e8f9", "#10b981"]
  },
  {
    id: "rose",
    name: "暗夜玫红",
    description: "深邃浪漫玫红",
    appearance: "dark",
    preview: ["#1a0f14", "#f472b6", "#c084fc", "#34d399"]
  },
  {
    id: "cyber",
    name: "赛博霓虹",
    description: "科技感霓虹暗色",
    appearance: "dark",
    preview: ["#0a0a14", "#818cf8", "#22d3ee", "#34d399"]
  },
  {
    id: "mocha",
    name: "摩卡棕韵",
    description: "温暖棕调暗色主题",
    appearance: "dark",
    preview: ["#1a1410", "#d97800", "#c084fc", "#8fbc6a"]
  },
  {
    id: "ocean",
    name: "深海蔚蓝",
    description: "深邃海洋蓝调",
    appearance: "dark",
    preview: ["#0a1628", "#38bdf8", "#f59e0b", "#34d399"]
  },
  {
    id: "dawn",
    name: "黎明暖橙",
    description: "破晓暖橙暗色",
    appearance: "dark",
    preview: ["#1a1018", "#f97316", "#e879f9", "#4ade80"]
  },
  {
    id: "sunset",
    name: "落日余晖",
    description: "夕阳暖金色调",
    appearance: "dark",
    preview: ["#1a1008", "#f59e0b", "#ef4444", "#84cc16"]
  }
];
const themeStorageKey = "nexadesk.theme.id";
const themeModeStorageKey = "nexadesk.theme.mode";

/* ── Toast ── */
interface ToastMessage {
  id: string;
  message: string;
  level: "info" | "success" | "error";
}

/* ── Slash Commands ── */
const SLASH_COMMANDS = [
  { cmd: "/model", label: "切换模型", desc: "选择 Provider 和模型" },
  { cmd: "/context", label: "工作区上下文", desc: "查看实时工作区" },
  { cmd: "/clear", label: "清空对话", desc: "清除当前会话消息" },
  { cmd: "/new", label: "新建任务", desc: "开始新的协作" },
  { cmd: "/settings", label: "打开设置", desc: "进入设置面板" },
  { cmd: "/mcp", label: "MCP 工具", desc: "查看 MCP 工具服务器" },
  { cmd: "/agents", label: "Agent 列表", desc: "查看和管理 Agent" },
  { cmd: "/skills", label: "技能市场", desc: "查看可用技能" },
  { cmd: "/memory", label: "记忆管理", desc: "查看和管理记忆" },
  { cmd: "/runtime", label: "运行监控", desc: "查看运行时指标" }
];

/* ── Quick Actions ── */
const QUICK_ACTIONS = [
  { id: "code-review", label: "代码审查", icon: "🔍" },
  { id: "write-doc", label: "写文档", icon: "📄" },
  { id: "analyze", label: "数据分析", icon: "📊" },
  { id: "debug", label: "调试问题", icon: "🐛" },
  { id: "refactor", label: "重构代码", icon: "♻️" }
];

/* ── i18n ── */
type Lang = "zh" | "en";
const I18N: Record<string, Record<Lang, string>> = {
  "app.title": { zh: "NexaDesk", en: "NexaDesk" },
  "app.subtitle": { zh: "AI 智能体工作台", en: "AI Agentic Workspace" },
  "nav.newTask": { zh: "新建任务", en: "New Task" },
  "nav.newTask.desc": { zh: "开始一次协作", en: "Start a session" },
  "nav.search": { zh: "搜索任务", en: "Search" },
  "nav.search.desc": { zh: "会话与文件", en: "Sessions & files" },
  "nav.scheduled": { zh: "定时任务", en: "Scheduled" },
  "nav.scheduled.desc": { zh: "计划与自动化", en: "Automation" },
  "nav.runtime": { zh: "运行监控", en: "Runtime" },
  "nav.runtime.desc": { zh: "调用与成本", en: "Calls & cost" },
  "nav.skills": { zh: "技能", en: "Skills" },
  "nav.skills.desc": { zh: "市场与启用", en: "Marketplace" },
  "nav.mcp": { zh: "MCP", en: "MCP" },
  "nav.mcp.desc": { zh: "工具服务器", en: "Tool servers" },
  "nav.agents": { zh: "我的 Agent", en: "Agents" },
  "nav.agents.desc": { zh: "助手与团队", en: "Assistants" },
  "nav.memory": { zh: "记忆", en: "Memory" },
  "nav.memory.desc": { zh: "项目 · 会话 · 长期", en: "Project · Session · Long-term" },
  "nav.history": { zh: "任务记录", en: "History" },
  "settings.title": { zh: "设置", en: "Settings" },
  "settings.appearance": { zh: "外观", en: "Appearance" },
  "settings.theme": { zh: "主题", en: "Theme" },
  "settings.darkMode": { zh: "深色模式", en: "Dark Mode" },
  "settings.language": { zh: "语言", en: "Language" },
  "settings.providers": { zh: "模型服务", en: "Providers" },
  "settings.model": { zh: "模型中心", en: "Model" },
  "settings.engines": { zh: "Agent 引擎", en: "Engines" },
  "settings.assistants": { zh: "内置助手", en: "Assistants" },
  "settings.skills": { zh: "技能系统", en: "Skills" },
  "settings.workspace": { zh: "工作区", en: "Workspace" },
  "settings.permissions": { zh: "权限审批", en: "Permissions" },
  "settings.memory": { zh: "记忆", en: "Memory" },
  "settings.im": { zh: "IM 集成", en: "IM Integration" },
  "settings.email": { zh: "邮件", en: "Email" },
  "settings.shortcuts": { zh: "快捷键", en: "Shortcuts" },
  "settings.about": { zh: "关于", en: "About" },
  "settings.desktop": { zh: "桌面诊断", en: "Desktop" },
  "toast.saved": { zh: "已保存", en: "Saved" },
  "toast.error": { zh: "操作失败", en: "Operation failed" },
  "toast.success": { zh: "操作成功", en: "Success" },
  "toast.copy": { zh: "已复制到剪贴板", en: "Copied to clipboard" },
  "dashboard.title": { zh: "AI Runtime Dashboard", en: "AI Runtime Dashboard" },
  "dashboard.calls": { zh: "总调用", en: "Total Calls" },
  "dashboard.success": { zh: "成功率", en: "Success Rate" },
  "dashboard.tokens": { zh: "总 Tokens", en: "Total Tokens" },
  "dashboard.cost": { zh: "预估费用", en: "Est. Cost" },
  "dashboard.trend": { zh: "调用趋势", en: "Call Trend" },
  "dashboard.ttft": { zh: "平均首字", en: "Avg TTFT" },
  "dashboard.tps": { zh: "输出 TPS", en: "Output TPS" },
  "mcp.servers": { zh: "MCP 工具服务器", en: "MCP Tool Servers" },
  "mcp.installed": { zh: "已安装", en: "Installed" },
  "mcp.marketplace": { zh: "市场", en: "Marketplace" },
  "mcp.custom": { zh: "自定义", en: "Custom" },
  "mcp.testConnection": { zh: "测试连接", en: "Test Connection" },
  "mcp.refreshTools": { zh: "刷新工具", en: "Refresh Tools" },
  "mcp.addServer": { zh: "新增 MCP", en: "Add MCP" },
  "mcp.schema": { zh: "输入 Schema", en: "Input Schema" },
  "mcp.example": { zh: "参数示例", en: "Parameter Example" },
  "mcp.permission": { zh: "工具权限", en: "Tool Permission" },
  "mcp.allow": { zh: "允许", en: "Allow" },
  "mcp.ask": { zh: "询问", en: "Ask" },
  "mcp.deny": { zh: "拒绝", en: "Deny" },
  "skills.title": { zh: "技能", en: "Skills" },
  "skills.installed": { zh: "已安装技能", en: "Installed Skills" },
  "skills.marketplace": { zh: "技能市场", en: "Skill Marketplace" },
  "skills.enable": { zh: "启用", en: "Enable" },
  "skills.disable": { zh: "停用", en: "Disable" },
  "skills.import": { zh: "导入技能包", en: "Import Skill" },
  "agents.title": { zh: "我的 Agent", en: "My Agents" },
  "agents.teams": { zh: "团队", en: "Teams" },
  "agents.create": { zh: "新建 Agent", en: "New Agent" },
  "agents.activate": { zh: "切换到工作台", en: "Switch to Workspace" },
  "memory.title": { zh: "记忆管理", en: "Memory Management" },
  "memory.project": { zh: "项目记忆", en: "Project Memory" },
  "memory.session": { zh: "会话摘要", en: "Session Summaries" },
  "memory.longTerm": { zh: "长期记忆", en: "Long-term Memory" },
  "memory.add": { zh: "添加记忆", en: "Add Memory" },
  "memory.search": { zh: "搜索记忆...", en: "Search memories..." },
  "chat.send": { zh: "发送", en: "Send" },
  "chat.placeholder": { zh: "输入消息或 / 查看命令...", en: "Type a message or / for commands..." },
  "chat.newTask": { zh: "新建任务", en: "New Task" },
  "common.save": { zh: "保存", en: "Save" },
  "common.cancel": { zh: "取消", en: "Cancel" },
  "common.delete": { zh: "删除", en: "Delete" },
  "common.edit": { zh: "编辑", en: "Edit" },
  "common.close": { zh: "关闭", en: "Close" },
  "common.search": { zh: "搜索", en: "Search" },
  "common.loading": { zh: "加载中...", en: "Loading..." },
  "common.empty": { zh: "暂无数据", en: "No data" },
  "common.enabled": { zh: "启用", en: "Enabled" },
  "common.disabled": { zh: "停用", en: "Disabled" },
  "status.online": { zh: "在线", en: "Online" },
  "status.offline": { zh: "离线", en: "Offline" },
  "status.running": { zh: "运行中", en: "Running" },
  "status.idle": { zh: "空闲", en: "Idle" },
  "status.error": { zh: "错误", en: "Error" },
  "im.title": { zh: "即时通讯集成", en: "IM Integration" },
  "im.desc": { zh: "连接飞书、钉钉、Telegram 等平台", en: "Connect Feishu, DingTalk, Telegram, etc." },
  "email.title": { zh: "邮件集成", en: "Email Integration" },
  "email.desc": { zh: "IMAP/SMTP 邮箱配置", en: "IMAP/SMTP email config" },
  "update.available": { zh: "有新版本", en: "Update Available" },
  "update.download": { zh: "下载更新", en: "Download" },
  "update.later": { zh: "稍后", en: "Later" },
  "privacy.title": { zh: "欢迎使用 NexaDesk", en: "Welcome to NexaDesk" },
  "privacy.accept": { zh: "同意并继续", en: "Accept & Continue" },
  "privacy.reject": { zh: "不同意", en: "Decline" },
  "pet.greeting": { zh: "你好！", en: "Hello!" },
  "pet.help": { zh: "需要帮忙吗？", en: "Need help?" },
  "pet.working": { zh: "我在工作中~", en: "Working hard~" }
};

/* ── Agent Teams ── */
interface AgentTeam {
  id: string;
  name: string;
  emoji: string;
  description: string;
  agentIds: string[];
  workflow: "sequential" | "parallel" | "round_robin";
}

const defaultProviderIds = new Set(createDefaultProviders().map((provider) => provider.id));

const domesticProviderMatrix: ProviderMatrixItem[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    apiMode: "chat_completions",
    requiredModels: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner"],
    requiredCapabilities: ["streaming", "function_calling", "structured_output"],
    envKey: "DEEPSEEK_API_KEY",
    officialUrl: "https://api-docs.deepseek.com/"
  },
  {
    id: "dashscope-qwen",
    label: "阿里云百炼 / 通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiMode: "chat_completions",
    requiredModels: ["qwen-plus", "qwen-max", "qwen-turbo", "qwen-vl-plus"],
    requiredCapabilities: ["streaming", "function_calling", "vision", "structured_output"],
    envKey: "DASHSCOPE_API_KEY",
    officialUrl: "https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope"
  },
  {
    id: "siliconflow-cn",
    label: "硅基流动 SiliconFlow",
    baseUrl: "https://api.siliconflow.cn/v1",
    apiMode: "chat_completions",
    requiredModels: ["deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct"],
    requiredCapabilities: ["streaming", "function_calling", "structured_output"],
    envKey: "SILICONFLOW_API_KEY",
    officialUrl: "https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions"
  },
  {
    id: "moonshot",
    label: "月之暗面 Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    apiMode: "chat_completions",
    requiredModels: ["kimi-k2.6", "kimi-k2.5", "moonshot-v1-128k"],
    requiredCapabilities: ["streaming", "function_calling", "vision", "structured_output"],
    envKey: "MOONSHOT_API_KEY",
    officialUrl: "https://platform.kimi.com/docs/api/overview"
  },
  {
    id: "zhipu",
    label: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiMode: "chat_completions",
    requiredModels: ["glm-5.1", "glm-5-turbo", "glm-5", "glm-4.7", "glm-4.7-flash"],
    requiredCapabilities: ["streaming", "function_calling", "web_search", "structured_output"],
    envKey: "ZHIPU_API_KEY",
    officialUrl: "https://docs.bigmodel.cn/api-reference"
  }
];

function readStoredWorkspaceRecentFiles(): WorkspaceTreeEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(workspaceRecentFilesStorageKey) ?? "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(
        (item): item is WorkspaceTreeEntry =>
          typeof item?.name === "string" && typeof item?.path === "string" && item.kind === "file"
      )
      .map(
        (item): WorkspaceTreeEntry => ({
          name: item.name,
          path: item.path,
          kind: "file",
          size: typeof item.size === "number" ? item.size : undefined,
          modifiedAt: typeof item.modifiedAt === "string" ? item.modifiedAt : undefined
        })
      )
      .slice(0, maxWorkspaceRecentFiles);
  } catch {
    return [];
  }
}

function writeStoredWorkspaceRecentFiles(entries: WorkspaceTreeEntry[]) {
  try {
    window.localStorage.setItem(
      workspaceRecentFilesStorageKey,
      JSON.stringify(entries.slice(0, maxWorkspaceRecentFiles))
    );
  } catch {
    // Local storage can be unavailable in hardened browser contexts.
  }
}

function readStoredRuntimeTelemetry(): RuntimeTelemetryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(runtimeTelemetryStorageKey) ?? "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(
        (item): item is RuntimeTelemetryEntry =>
          typeof item?.id === "string" &&
          typeof item.sessionId === "string" &&
          typeof item.providerName === "string" &&
          typeof item.model === "string" &&
          typeof item.startedAt === "string" &&
          typeof item.inputTokens === "number" &&
          typeof item.outputTokens === "number" &&
          typeof item.totalTokens === "number" &&
          (item.status === "running" || item.status === "completed" || item.status === "failed")
      )
      .slice(0, maxRuntimeTelemetryEntries);
  } catch {
    return [];
  }
}

function writeStoredRuntimeTelemetry(entries: RuntimeTelemetryEntry[]) {
  try {
    window.localStorage.setItem(
      runtimeTelemetryStorageKey,
      JSON.stringify(entries.slice(0, maxRuntimeTelemetryEntries))
    );
  } catch {
    // Local storage can be unavailable in hardened browser contexts.
  }
}

function rememberWorkspaceFile(current: WorkspaceTreeEntry[], entry: WorkspaceTreeEntry) {
  if (entry.kind !== "file") {
    return current;
  }

  return [entry, ...current.filter((item) => item.path !== entry.path)].slice(0, maxWorkspaceRecentFiles);
}

const taskBoard = [
  {
    id: "task-1",
    title: "Map product modules",
    ownerId: "cowork",
    status: "Running",
    detail: "Leader is splitting the workbench into reusable runtime surfaces."
  },
  {
    id: "task-2",
    title: "Inspect runtime adapters",
    ownerId: "reviewer",
    status: "Needs approval",
    detail: "Waiting before launching terminal checks in the workspace."
  },
  {
    id: "task-3",
    title: "Draft office assistant path",
    ownerId: "docs",
    status: "Queued",
    detail: "Document agent will define PPT, Word, and spreadsheet workflows."
  }
];

type TaskBoardItem = (typeof taskBoard)[number];

const mailbox = [
  {
    id: "mail-1",
    from: "Leader",
    to: "Reviewer Agent",
    subject: "Please verify the runtime boundary after the UI pass."
  },
  {
    id: "mail-2",
    from: "Document Agent",
    to: "Leader",
    subject: "Office assistant presets need file export policy."
  }
];

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeView, setActiveView] = useState<AppView>(() => readInitialAppView());
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>("providers");
  const [settingsOpen, setSettingsOpen] = useState(() => window.location.hash.replace(/^#/, "") === "settings");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionBatchMode, setSessionBatchMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(() => new Set());
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameSessionDraft, setRenameSessionDraft] = useState("");
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editingMcpServerId, setEditingMcpServerId] = useState<string | null>(null);
  const [mcpTestResults, setMcpTestResults] = useState<Record<string, McpServerTestResult>>({});
  const [mcpToolResults, setMcpToolResults] = useState<Record<string, McpServerToolsResult>>({});
  const [testingMcpServerId, setTestingMcpServerId] = useState<string | null>(null);
  const [refreshingMcpToolsServerId, setRefreshingMcpToolsServerId] = useState<string | null>(null);
  const [mode, setMode] = useState<DataMode>("live");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsStatus, setSettingsStatus] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [recoveringSettings, setRecoveringSettings] = useState(false);
  const [batchRejectReason, setBatchRejectReason] = useState("");
  const [resolvingBatchApprovals, setResolvingBatchApprovals] = useState(false);
  const [workspacePath, setWorkspacePath] = useState(".");
  const [workspaceList, setWorkspaceList] = useState<WorkspaceListResult | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceRefreshTick, setWorkspaceRefreshTick] = useState(0);
  const [selectedWorkspaceFile, setSelectedWorkspaceFile] = useState<WorkspaceTreeEntry | null>(null);
  const [workspaceFilePreview, setWorkspaceFilePreview] = useState<WorkspaceFilePreviewResult | null>(null);
  const [workspaceFileLoading, setWorkspaceFileLoading] = useState(false);
  const [workspaceFileError, setWorkspaceFileError] = useState<string | null>(null);
  const [workspaceContextCollapsed, setWorkspaceContextCollapsed] = useState(() =>
    readStoredBoolean(workspaceContextCollapsedStorageKey, false)
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    readStoredBoolean(sidebarCollapsedStorageKey, false)
  );
  const [threadContextOpen, setThreadContextOpen] = useState(false);
  const [recentWorkspaceFiles, setRecentWorkspaceFiles] = useState<WorkspaceTreeEntry[]>(() =>
    readStoredWorkspaceRecentFiles()
  );
  const [runtimeTelemetry, setRuntimeTelemetry] = useState<RuntimeTelemetryEntry[]>(() => readStoredRuntimeTelemetry());
  const [runtimeTelemetryLoaded, setRuntimeTelemetryLoaded] = useState(false);
  const runtimeTelemetryRuntimeRef = useRef(new Map<string, { startedMs: number; outputTokens: number }>());

  /* ── Theme State ── */
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    try {
      return (localStorage.getItem(themeStorageKey) as ThemeId) || "honey-warm";
    } catch {
      return "honey-warm";
    }
  });
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    try {
      return (localStorage.getItem(themeModeStorageKey) as ThemeMode) || "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    let effectiveId = themeId;
    if (themeMode === "system") {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const match = THEMES.find((t) => t.appearance === (isDark ? "dark" : "light"));
      effectiveId = match?.id ?? themeId;
    }
    root.setAttribute("data-theme", effectiveId);
    const meta = THEMES.find((t) => t.id === effectiveId);
    if (meta?.appearance === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    root.classList.add("nexadesk-theme-transition");
    window.setTimeout(() => root.classList.remove("nexadesk-theme-transition"), 350);
    try {
      localStorage.setItem(themeStorageKey, themeId);
    } catch {}
    try {
      localStorage.setItem(themeModeStorageKey, themeMode);
    } catch {}
  }, [themeId, themeMode]);

  /* ── Toast State ── */
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  function showToast(message: string, level: ToastMessage["level"] = "info") {
    const id = `toast-${Date.now()}`;
    setToasts((prev) => [...prev, { id, message, level }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }

  /* ── Language State ── */
  const [lang, setLang] = useState<Lang>("zh");
  function t(key: string): string {
    return I18N[key]?.[lang] ?? key;
  }

  /* ── Slash Command State ── */
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashHighlight, setSlashHighlight] = useState(0);
  const filteredSlashCommands = SLASH_COMMANDS.filter(
    (c) => c.cmd.includes(slashFilter) || c.label.includes(slashFilter)
  );

  /* ── Image Attachments State ── */
  const [imageAttachments, setImageAttachments] = useState<Array<{ name: string; dataUrl: string }>>([]);

  /* ── Teams State ── */
  const [teams, setTeams] = useState<AgentTeam[]>([
    {
      id: "team-code",
      name: "代码团队",
      emoji: "💻",
      description: "代码助手 + 代码审查 + 终端",
      agentIds: ["code", "cowork"],
      workflow: "sequential"
    },
    {
      id: "team-office",
      name: "办公团队",
      emoji: "📋",
      description: "Word + Excel + PPT + 报告",
      agentIds: ["word", "excel", "ppt", "report"],
      workflow: "parallel"
    }
  ]);

  /* ── Privacy Dialog State ── */
  const [privacyAccepted, setPrivacyAccepted] = useState(() => {
    try {
      return localStorage.getItem("nexadesk.privacy.accepted") === "true";
    } catch {
      return true;
    }
  });

  /* ── Activity Sidebar State ── */
  const [activitySidebarOpen, setActivitySidebarOpen] = useState(false);

  /* ── Desktop Pet State ── */
  const [petVisible, setPetVisible] = useState(false);
  const [petVariant, setPetVariant] = useState("nexabot");

  /* ── Update Modal State ── */
  const [updateModalOpen, setUpdateModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchSnapshot()
      .then(async (data) => {
        if (!cancelled) {
          setSnapshot(data);
          setMode("live");
          setError(null);
        }

        try {
          const loadedSettings = await fetchAppSettings();
          if (!cancelled) {
            setSettings(loadedSettings);
          }
        } catch (reason) {
          if (!cancelled) {
            setSettings(createDefaultSettings(data.providers));
            setSettingsStatus(
              reason instanceof Error ? `Settings fallback: ${reason.message}` : "Settings fallback loaded"
            );
          }
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          const demoSnapshot = createDemoSnapshot();
          setSnapshot(demoSnapshot);
          setSettings(createDefaultSettings(demoSnapshot.providers));
          setMode("demo");
          setError(reason instanceof Error ? reason.message : "API unavailable");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mode !== "live") {
      return;
    }

    return subscribeActivity((event) => {
      setSnapshot((current) => {
        if (!current || current.activity.some((item) => item.id === event.id)) {
          return current;
        }
        return {
          ...current,
          activity: [event, ...current.activity].slice(0, 20)
        };
      });
    });
  }, [mode]);

  useEffect(() => {
    writeStoredBoolean(workspaceContextCollapsedStorageKey, workspaceContextCollapsed);
  }, [workspaceContextCollapsed]);

  useEffect(() => {
    writeStoredBoolean(sidebarCollapsedStorageKey, sidebarCollapsed);
  }, [sidebarCollapsed]);

  useEffect(() => {
    writeStoredWorkspaceRecentFiles(recentWorkspaceFiles);
  }, [recentWorkspaceFiles]);

  useEffect(() => {
    writeStoredRuntimeTelemetry(runtimeTelemetry);
  }, [runtimeTelemetry]);

  useEffect(() => {
    if (mode !== "live") {
      setRuntimeTelemetryLoaded(true);
      return;
    }
    let cancelled = false;
    fetchRuntimeTelemetry()
      .then((entries) => {
        if (cancelled) {
          return;
        }
        setRuntimeTelemetry(entries.length ? entries : readStoredRuntimeTelemetry());
        setRuntimeTelemetryLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setRuntimeTelemetryLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    if (!runtimeTelemetryLoaded || mode !== "live") {
      return;
    }
    const timeout = window.setTimeout(() => {
      void saveRuntimeTelemetry(runtimeTelemetry).catch(() => {
        // Keep the local telemetry cache when the backend is temporarily unavailable.
      });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [mode, runtimeTelemetry, runtimeTelemetryLoaded]);

  useEffect(() => {
    if (activeView !== "thread" && threadContextOpen) {
      setThreadContextOpen(false);
    }
  }, [activeView, threadContextOpen]);

  useEffect(() => {
    if (!snapshot?.sessions.length) {
      setActiveSessionId(null);
      return;
    }
    if (!activeSessionId || !snapshot.sessions.some((session) => session.id === activeSessionId)) {
      setActiveSessionId(snapshot.sessions[0]?.id ?? null);
    }
  }, [activeSessionId, snapshot]);

  const orderedSessions = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    return [...snapshot.sessions].sort((left, right) => {
      if (Boolean(left.pinned) !== Boolean(right.pinned)) {
        return left.pinned ? -1 : 1;
      }
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  }, [snapshot]);
  const activeSession = orderedSessions.find((session) => session.id === activeSessionId) ?? orderedSessions[0];
  const teamAgents = useMemo(() => {
    if (!snapshot || !activeSession) {
      return [];
    }
    return activeSession.agentIds
      .map((agentId) => snapshot.agents.find((agent) => agent.id === agentId))
      .filter(Boolean) as AgentProfile[];
  }, [activeSession, snapshot]);

  const activeAgent = useMemo(() => {
    if (!snapshot || !activeSession) {
      return null;
    }
    return snapshot.agents.find((agent) => agent.id === activeSession.activeAgentId) ?? null;
  }, [activeSession, snapshot]);

  const activeMessages = useMemo(() => {
    if (!snapshot || !activeSession) {
      return [];
    }
    return snapshot.messages.filter((message) => message.sessionId === activeSession.id);
  }, [activeSession, snapshot]);
  const sessionMessageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const message of snapshot?.messages ?? []) {
      counts.set(message.sessionId, (counts.get(message.sessionId) ?? 0) + 1);
    }
    return counts;
  }, [snapshot]);

  const runtimeSettings = settings ?? createDefaultSettings(snapshot?.providers ?? []);
  const configuredProviders = runtimeSettings.providers.filter((provider) => provider.connected).length;
  const activeApprovals = snapshot?.approvals.length ?? 0;
  const batchApprovableApprovals = snapshot?.approvals.filter((approval) => approval.risk !== "high") ?? [];
  const highRiskApprovals = snapshot?.approvals.filter((approval) => approval.risk === "high").length ?? 0;
  const activeRuntimeProvider =
    runtimeSettings.providers.find((provider) => provider.id === runtimeSettings.model.activeProviderId) ??
    runtimeSettings.providers.find((provider) => provider.connected) ??
    runtimeSettings.providers[0];
  const activeRuntimeModel =
    runtimeSettings.model.activeModel || activeRuntimeProvider?.defaultModel || activeRuntimeProvider?.models[0] || "";
  const enabledSkills = snapshot?.skills.filter((skill) => skill.enabled) ?? [];
  const discoveredMcpTools = useMemo(
    () => Object.values(mcpToolResults).flatMap((result) => result.tools),
    [mcpToolResults]
  );
  const runningAgents = snapshot?.agents.filter((agent) => agent.status === "running") ?? [];
  const runtimeStats = useMemo(
    () => buildRuntimeDashboardStats(snapshot?.messages ?? [], runtimeTelemetry, activeSession?.id ?? null),
    [activeSession, runtimeTelemetry, snapshot]
  );
  const workspaceSignature = [
    runtimeSettings.workspace.defaultWorkspace,
    runtimeSettings.workspace.exportDirectory,
    ...runtimeSettings.workspace.allowedRoots
  ].join("|");

  useEffect(() => {
    setWorkspacePath(".");
  }, [workspaceSignature]);

  useEffect(() => {
    if (!settings || mode === "demo") {
      setWorkspaceList(null);
      setWorkspaceError(mode === "demo" ? "当前是演示数据，启动本地 API 后显示真实工作区。" : null);
      return;
    }

    let cancelled = false;
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    fetchWorkspaceList(workspacePath)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setWorkspaceList(result);
        setWorkspaceError(result.error ?? null);
      })
      .catch((reason) => {
        if (cancelled) {
          return;
        }
        setWorkspaceList(null);
        setWorkspaceError(reason instanceof Error ? reason.message : "工作区读取失败。");
      })
      .finally(() => {
        if (!cancelled) {
          setWorkspaceLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mode, settings, workspacePath, workspaceRefreshTick, workspaceSignature]);

  useEffect(() => {
    if (!selectedWorkspaceFile) {
      setWorkspaceFilePreview(null);
      setWorkspaceFileError(null);
      return;
    }
    if (mode === "demo") {
      setWorkspaceFilePreview(null);
      setWorkspaceFileError("演示模式不读取本地文件。");
      return;
    }

    let cancelled = false;
    setWorkspaceFileLoading(true);
    setWorkspaceFileError(null);
    fetchWorkspaceFile(selectedWorkspaceFile.path)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setWorkspaceFilePreview(result);
        setWorkspaceFileError(result.error ?? null);
      })
      .catch((reason) => {
        if (cancelled) {
          return;
        }
        setWorkspaceFilePreview(null);
        setWorkspaceFileError(reason instanceof Error ? reason.message : "文件预览失败。");
      })
      .finally(() => {
        if (!cancelled) {
          setWorkspaceFileLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mode, selectedWorkspaceFile]);

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content) {
      return;
    }

    setDraft("");
    await sendWorkbenchMessage(content);
  }

  function handleOpenWorkspaceFile(entry: WorkspaceTreeEntry) {
    if (entry.kind !== "file") {
      return;
    }
    setSelectedWorkspaceFile(entry);
    setRecentWorkspaceFiles((current) => rememberWorkspaceFile(current, entry));
  }

  async function sendWorkbenchMessage(content: string) {
    const trimmedContent = content.trim();
    if (!snapshot || !activeSession || !trimmedContent) {
      return;
    }

    if (mode === "demo") {
      const now = new Date().toISOString();
      const optimisticMessages: ChatMessage[] = [
        {
          id: crypto.randomUUID(),
          sessionId: activeSession.id,
          role: "user",
          author: "You",
          content: trimmedContent,
          createdAt: now
        },
        {
          id: crypto.randomUUID(),
          sessionId: activeSession.id,
          role: "assistant",
          author: "Cowork Agent",
          content: "Demo mode only. Start the API server to connect this request to a runtime.",
          createdAt: now
        }
      ];
      setSnapshot({ ...snapshot, messages: [...snapshot.messages, ...optimisticMessages] });
      handleOpenView("thread");
      return;
    }

    setSending(true);
    setError(null);
    handleOpenView("thread");
    try {
      const streamStartedMs = performance.now();
      let activeTelemetryMessageId: string | null = null;
      await streamMessage(
        activeSession.id,
        {
          content: trimmedContent,
          providerId: activeRuntimeProvider?.id,
          model: activeRuntimeModel,
          agentId: activeAgent?.id
        },
        (streamEvent) => {
          if (streamEvent.type === "assistant_start") {
            activeTelemetryMessageId = streamEvent.message.id;
            runtimeTelemetryRuntimeRef.current.set(streamEvent.message.id, {
              startedMs: streamStartedMs,
              outputTokens: 0
            });
            const entry: RuntimeTelemetryEntry = {
              id: streamEvent.message.id,
              sessionId: activeSession.id,
              providerName: streamEvent.provider.name,
              model: streamEvent.provider.model,
              startedAt: new Date().toISOString(),
              inputTokens: estimateTokenCount(trimmedContent),
              outputTokens: 0,
              totalTokens: estimateTokenCount(trimmedContent),
              status: "running",
              messagePreview: trimmedContent.slice(0, 240)
            };
            setRuntimeTelemetry((current) =>
              [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, maxRuntimeTelemetryEntries)
            );
          }
          if (streamEvent.type === "assistant_delta") {
            const runtime = runtimeTelemetryRuntimeRef.current.get(streamEvent.messageId);
            if (runtime) {
              const nowMs = performance.now();
              const deltaTokens = estimateTokenCount(streamEvent.delta);
              runtime.outputTokens += deltaTokens;
              runtimeTelemetryRuntimeRef.current.set(streamEvent.messageId, runtime);
              setRuntimeTelemetry((current) =>
                current.map((entry) =>
                  entry.id === streamEvent.messageId
                    ? {
                        ...entry,
                        firstTokenMs: entry.firstTokenMs ?? Math.max(0, Math.round(nowMs - runtime.startedMs)),
                        outputTokens: runtime.outputTokens,
                        totalTokens: entry.inputTokens + runtime.outputTokens
                      }
                    : entry
                )
              );
            }
          }
          if (streamEvent.type === "assistant_done") {
            const runtime = runtimeTelemetryRuntimeRef.current.get(streamEvent.message.id);
            const finishedMs = performance.now();
            const outputTokens = estimateTokenCount(streamEvent.message.content);
            setRuntimeTelemetry((current) =>
              current.map((entry) =>
                entry.id === streamEvent.message.id
                  ? {
                      ...entry,
                      completedAt: new Date().toISOString(),
                      durationMs: runtime ? Math.max(0, Math.round(finishedMs - runtime.startedMs)) : entry.durationMs,
                      outputTokens,
                      totalTokens: entry.inputTokens + outputTokens,
                      status: "completed"
                    }
                  : entry
              )
            );
            runtimeTelemetryRuntimeRef.current.delete(streamEvent.message.id);
          }
          if (streamEvent.type === "error") {
            setError(streamEvent.message);
            const failedMessageId = streamEvent.messageId ?? activeTelemetryMessageId;
            if (failedMessageId) {
              const runtime = runtimeTelemetryRuntimeRef.current.get(failedMessageId);
              setRuntimeTelemetry((current) =>
                current.map((entry) =>
                  entry.id === failedMessageId
                    ? {
                        ...entry,
                        completedAt: new Date().toISOString(),
                        durationMs: runtime
                          ? Math.max(0, Math.round(performance.now() - runtime.startedMs))
                          : entry.durationMs,
                        status: "failed",
                        error: streamEvent.message
                      }
                    : entry
                )
              );
              runtimeTelemetryRuntimeRef.current.delete(failedMessageId);
            }
          }
          setSnapshot((current) => (current ? applyChatStreamEvent(current, streamEvent) : current));
        }
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  async function handleAskAgentToReadFile(path: string) {
    await sendWorkbenchMessage(
      `请使用 read_file 工具读取工作区文件 "${path}"，然后总结关键内容、可能的问题和下一步建议。`
    );
  }

  async function handleWorkbenchRuntimeChange(providerId: string, model?: string) {
    if (!settings) {
      return;
    }
    const provider = settings.providers.find((item) => item.id === providerId);
    const nextModel = model || provider?.defaultModel || provider?.models[0] || "";
    const nextSettings: AppSettings = {
      ...settings,
      model: {
        activeProviderId: providerId,
        activeModel: nextModel
      }
    };

    setSettings(nextSettings);
    try {
      await handleSaveSettings(nextSettings);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to switch model");
    }
  }

  async function handleResolveApproval(approval: PermissionRequest, approved: boolean, reason?: string) {
    if (!snapshot) {
      return;
    }

    if (mode === "demo") {
      const history = createLocalApprovalHistory(approval, approved ? "approved" : "rejected", reason);
      setSnapshot((current) =>
        current
          ? {
              ...current,
              approvals: current.approvals.filter((item) => item.id !== approval.id),
              approvalHistory: [history, ...current.approvalHistory].slice(0, 100),
              activity: [
                {
                  id: crypto.randomUUID(),
                  level: approved ? "info" : "warning",
                  title: approved ? "Approval granted" : "Approval rejected",
                  detail: approved || !reason ? approval.action : `${approval.action}；原因：${reason}`,
                  createdAt: new Date().toISOString()
                },
                ...current.activity
              ]
            }
          : current
      );
      return;
    }

    try {
      const result = await resolveApproval(approval.id, approved, reason);
      setSnapshot((current) => {
        if (!current) {
          return current;
        }
        const incomingMessages = result.messages ?? [];
        const existingIds = new Set(current.messages.map((message) => message.id));
        return {
          ...current,
          approvals: current.approvals.filter((item) => item.id !== approval.id),
          approvalHistory: [
            result.history,
            ...current.approvalHistory.filter((item) => item.id !== result.history.id)
          ].slice(0, 100),
          messages: [
            ...current.messages.map((message) =>
              message.id === approval.messageId
                ? {
                    ...message,
                    toolCalls: message.toolCalls?.map((tool) =>
                      tool.id === approval.toolCallId
                        ? { ...tool, status: (approved ? "completed" : "rejected") as ToolCall["status"] }
                        : tool
                    )
                  }
                : message
            ),
            ...incomingMessages.filter((message) => !existingIds.has(message.id))
          ],
          activity: [result.activity, ...current.activity].slice(0, 20)
        };
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to resolve approval");
    }
  }

  async function handleResolveApprovalBatch(approved: boolean) {
    if (!snapshot || resolvingBatchApprovals) {
      return;
    }

    const targets = approved ? batchApprovableApprovals : snapshot.approvals;
    if (approved && targets.length === 0) {
      setError("高风险审批必须逐条确认，不能批量批准。");
      return;
    }
    if (targets.length === 0) {
      return;
    }

    setResolvingBatchApprovals(true);
    setError(null);
    try {
      const reason = approved ? undefined : batchRejectReason.trim() || "批量拒绝";
      for (const approval of targets) {
        await handleResolveApproval(approval, approved, reason);
      }
      if (!approved) {
        setBatchRejectReason("");
      }
    } finally {
      setResolvingBatchApprovals(false);
    }
  }

  function handleActivateAgent(agentId: string) {
    setSnapshot((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        sessions: current.sessions.map((session) =>
          session.id === activeSession?.id
            ? {
                ...session,
                activeAgentId: agentId,
                agentIds: current.agents.filter((agent) => agent.enabled).map((agent) => agent.id)
              }
            : session
        )
      };
    });
  }

  function applySessionResult(sessions: AppSnapshot["sessions"], activity?: ActivityEvent) {
    setSnapshot((current) =>
      current
        ? {
            ...current,
            sessions,
            activity: activity ? [activity, ...current.activity].slice(0, 20) : current.activity
          }
        : current
    );
    setSelectedSessionIds(
      (current) => new Set([...current].filter((id) => sessions.some((session) => session.id === id)))
    );
    if (!sessions.some((session) => session.id === activeSessionId)) {
      setActiveSessionId(sessions[0]?.id ?? null);
    }
  }

  function applyAutomationResult(
    automations: AppSnapshot["automations"],
    automationRuns: AppSnapshot["automationRuns"],
    activity?: ActivityEvent
  ) {
    setSnapshot((current) =>
      current
        ? {
            ...current,
            automations,
            automationRuns,
            activity: activity ? [activity, ...current.activity].slice(0, 20) : current.activity
          }
        : current
    );
  }

  async function handleCreateAutomation(payload: {
    name: string;
    prompt: string;
    scheduleKind: AutomationScheduleKind;
    enabled: boolean;
    agentId?: string;
  }) {
    if (!snapshot) {
      return;
    }
    if (mode === "demo") {
      const now = new Date().toISOString();
      const job = {
        id: `demo-automation-${crypto.randomUUID().slice(0, 8)}`,
        name: payload.name,
        prompt: payload.prompt,
        scheduleKind: payload.scheduleKind,
        schedule: automationScheduleKindLabel(payload.scheduleKind),
        enabled: payload.enabled,
        nextRun:
          payload.enabled && payload.scheduleKind !== "manual"
            ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
            : "Not scheduled",
        agentId: payload.agentId,
        createdAt: now,
        updatedAt: now
      };
      applyAutomationResult([job, ...snapshot.automations], snapshot.automationRuns);
      return;
    }
    const result = await createAutomation(payload);
    applyAutomationResult(result.automations, result.automationRuns, result.activity);
  }

  async function handleUpdateAutomation(
    jobId: string,
    patch: {
      name?: string;
      prompt?: string;
      scheduleKind?: AutomationScheduleKind;
      enabled?: boolean;
      agentId?: string;
    }
  ) {
    if (!snapshot) {
      return;
    }
    if (mode === "demo") {
      const automations = snapshot.automations.map((job) =>
        job.id === jobId
          ? {
              ...job,
              ...patch,
              schedule: patch.scheduleKind ? automationScheduleKindLabel(patch.scheduleKind) : job.schedule,
              updatedAt: new Date().toISOString()
            }
          : job
      );
      applyAutomationResult(automations, snapshot.automationRuns);
      return;
    }
    const result = await updateAutomation(jobId, patch);
    applyAutomationResult(result.automations, result.automationRuns, result.activity);
  }

  async function handleRunAutomation(jobId: string) {
    if (!snapshot) {
      return;
    }
    if (mode === "demo") {
      const job = snapshot.automations.find((item) => item.id === jobId);
      if (!job) {
        return;
      }
      const now = new Date().toISOString();
      applyAutomationResult(snapshot.automations, [
        {
          id: `demo-run-${crypto.randomUUID().slice(0, 8)}`,
          jobId,
          jobName: job.name,
          agentId: job.agentId,
          status: "completed",
          startedAt: now,
          finishedAt: now,
          durationMs: 320,
          resultSummary: "Demo run completed. Start the desktop API to execute this through a real model."
        },
        ...snapshot.automationRuns
      ]);
      return;
    }
    const result = await runAutomation(jobId);
    applyAutomationResult(result.automations, result.automationRuns);
  }

  function handleOpenSession(sessionId: string) {
    setActiveSessionId(sessionId);
    handleOpenView("thread");
  }

  function handleStartRenameSession(session: AppSnapshot["sessions"][number]) {
    setRenamingSessionId(session.id);
    setRenameSessionDraft(session.title);
  }

  async function handleConfirmRenameSession(sessionId: string) {
    const title = renameSessionDraft.trim();
    if (!title || !snapshot) {
      setRenamingSessionId(null);
      return;
    }

    if (mode === "demo") {
      applySessionResult(
        snapshot.sessions.map((session) =>
          session.id === sessionId ? { ...session, title, updatedAt: new Date().toISOString() } : session
        )
      );
    } else {
      const result = await updateSession(sessionId, { title });
      applySessionResult(result.sessions, result.activity);
    }
    setRenamingSessionId(null);
    setRenameSessionDraft("");
  }

  async function handleToggleSessionPin(session: AppSnapshot["sessions"][number]) {
    if (!snapshot) {
      return;
    }
    const pinned = !session.pinned;
    if (mode === "demo") {
      applySessionResult(
        snapshot.sessions.map((item) =>
          item.id === session.id ? { ...item, pinned, updatedAt: new Date().toISOString() } : item
        )
      );
      return;
    }
    const result = await updateSession(session.id, { pinned });
    applySessionResult(result.sessions, result.activity);
  }

  function handleToggleSessionSelection(sessionId: string) {
    setSelectedSessionIds((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }

  async function handleDeleteSession(sessionId: string) {
    if (!snapshot || snapshot.sessions.length <= 1) {
      setError("至少需要保留一个任务会话。");
      return;
    }

    if (mode === "demo") {
      applySessionResult(snapshot.sessions.filter((session) => session.id !== sessionId));
      return;
    }
    const result = await deleteSession(sessionId);
    applySessionResult(result.sessions, result.activity);
  }

  async function handleDeleteSelectedSessions() {
    if (!snapshot || selectedSessionIds.size === 0) {
      return;
    }
    const ids = [...selectedSessionIds].filter((id) => snapshot.sessions.some((session) => session.id === id));
    if (snapshot.sessions.length - ids.length < 1) {
      setError("至少需要保留一个任务会话。");
      return;
    }
    for (const sessionId of ids) {
      await handleDeleteSession(sessionId);
    }
    setSelectedSessionIds(new Set());
    setSessionBatchMode(false);
  }

  async function handleSaveAgentFromHub(agent: AgentProfile) {
    if (!settings) {
      return;
    }
    const exists = settings.assistant.agents.some((item) => item.id === agent.id);
    const nextSettings: AppSettings = {
      ...settings,
      assistant: {
        ...settings.assistant,
        agents: exists
          ? settings.assistant.agents.map((item) => (item.id === agent.id ? agent : item))
          : [...settings.assistant.agents, agent]
      }
    };
    await handleSaveSettings(nextSettings);
    setEditingAgentId(null);
  }

  async function handleToggleSkillFromHub(skillId: string, enabled: boolean) {
    if (!settings) {
      return;
    }
    const nextSettings: AppSettings = {
      ...settings,
      assistant: {
        ...settings.assistant,
        skills: settings.assistant.skills.map((skill) => (skill.id === skillId ? { ...skill, enabled } : skill))
      }
    };
    await handleSaveSettings(nextSettings);
  }

  async function handleRefreshRuntimeTelemetry() {
    if (mode !== "live") {
      setSettingsStatus("演示模式下没有后端调用明细。");
      return;
    }
    try {
      setRuntimeTelemetry(await fetchRuntimeTelemetry());
      setSettingsStatus("Runtime 调用明细已刷新。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Runtime telemetry refresh failed.");
    }
  }

  async function handleImportSkillPackage(raw: string, fileName = "skill-package.json") {
    if (!settings) {
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      const importedSkills = sanitizeImportedSkills(parsed, fileName);
      if (importedSkills.length === 0) {
        setSettingsStatus("技能包没有可导入的技能。");
        return;
      }
      const mergedSkills = mergeImportedSkills(settings.assistant.skills, importedSkills);
      await handleSaveSettings({
        ...settings,
        assistant: {
          ...settings.assistant,
          skills: mergedSkills
        }
      });
      setSettingsStatus(
        `已导入 ${importedSkills.length} 个技能：${importedSkills.map((skill) => skill.name).join("、")}`
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "技能包导入失败。");
    }
  }

  async function handleImportPluginDirectory() {
    if (!settings) {
      return;
    }
    if (!window.nexadeskDesktop?.selectDirectory) {
      setSettingsStatus("当前环境没有桌面目录选择器，启动桌面应用后可导入本地插件目录。");
      return;
    }
    const directory = await window.nexadeskDesktop.selectDirectory({
      title: "选择本地技能或插件目录",
      defaultPath: runtimeSettings.workspace.defaultWorkspace || runtimeSettings.workspace.exportDirectory
    });
    if (!directory) {
      return;
    }
    const importedSkill = createSkillFromPluginDirectory(directory);
    const mergedSkills = mergeImportedSkills(settings.assistant.skills, [importedSkill]);
    await handleSaveSettings({
      ...settings,
      assistant: {
        ...settings.assistant,
        skills: mergedSkills
      }
    });
    setSettingsStatus(`已接入本地插件目录：${importedSkill.name}`);
  }

  async function handleSaveMcpServer(server: McpServerSettings) {
    if (!settings) {
      return;
    }
    const exists = settings.mcp.servers.some((item) => item.id === server.id);
    const nextSettings: AppSettings = {
      ...settings,
      mcp: {
        servers: exists
          ? settings.mcp.servers.map((item) => (item.id === server.id ? server : item))
          : [...settings.mcp.servers, server]
      }
    };
    await handleSaveSettings(nextSettings);
    setEditingMcpServerId(null);
  }

  async function handleToggleMcpServer(serverId: string, enabled: boolean) {
    const server = runtimeSettings.mcp.servers.find((item) => item.id === serverId);
    if (!server) {
      return;
    }
    await handleSaveMcpServer({ ...server, enabled });
  }

  async function handleDeleteMcpServer(serverId: string) {
    if (!settings) {
      return;
    }
    const nextSettings: AppSettings = {
      ...settings,
      mcp: {
        servers: settings.mcp.servers.filter((server) => server.id !== serverId)
      }
    };
    await handleSaveSettings(nextSettings);
  }

  async function handleTestMcpServer(server: McpServerSettings) {
    setTestingMcpServerId(server.id);
    try {
      const result =
        mode === "demo"
          ? {
              ok: false,
              message: "演示模式不测试本地 MCP。启动桌面后端后可测试。",
              checkedAt: new Date().toISOString(),
              transport: server.transport
            }
          : await testMcpServer({ server, timeoutMs: 6000 });
      setMcpTestResults((current) => ({ ...current, [server.id]: result }));
    } catch (reason) {
      setMcpTestResults((current) => ({
        ...current,
        [server.id]: {
          ok: false,
          message: reason instanceof Error ? reason.message : "MCP 测试失败。",
          checkedAt: new Date().toISOString(),
          transport: server.transport
        }
      }));
    } finally {
      setTestingMcpServerId(null);
    }
  }

  async function handleRefreshMcpTools(server: McpServerSettings) {
    setRefreshingMcpToolsServerId(server.id);
    try {
      const result =
        mode === "demo"
          ? {
              ok: false,
              message: "演示模式不发现 MCP 工具。启动桌面后端后可刷新。",
              checkedAt: new Date().toISOString(),
              serverId: server.id,
              transport: server.transport,
              tools: []
            }
          : await fetchMcpServerTools({ server, timeoutMs: 9000 });
      setMcpToolResults((current) => ({ ...current, [server.id]: result }));
    } catch (reason) {
      setMcpToolResults((current) => ({
        ...current,
        [server.id]: {
          ok: false,
          message: reason instanceof Error ? reason.message : "MCP 工具发现失败。",
          checkedAt: new Date().toISOString(),
          serverId: server.id,
          transport: server.transport,
          tools: []
        }
      }));
    } finally {
      setRefreshingMcpToolsServerId(null);
    }
  }

  function handleOpenView(view: AppView) {
    setActiveView(view);
    window.location.hash = view === "new" ? "" : view;
  }

  function handleOpenSettings(tab: SettingsTab = "providers") {
    setSettingsInitialTab(tab);
    setSettingsOpen(true);
  }

  function handleCloseSettings() {
    setSettingsOpen(false);
  }

  async function handleSaveSettings(nextSettings: AppSettings, providerSecrets: ProviderSecretUpdate[] = []) {
    const updatedSettings = {
      ...nextSettings,
      updatedAt: new Date().toISOString()
    };

    if (mode === "demo") {
      setSettings(updatedSettings);
      setSettingsStatus("Saved in demo state. Start the API server for disk persistence.");
      setSnapshot((current) =>
        current
          ? {
              ...current,
              providers: updatedSettings.providers,
              agents: updatedSettings.assistant.agents,
              skills: updatedSettings.assistant.skills
            }
          : current
      );
      return updatedSettings;
    }

    const result = await persistAppSettings({
      settings: updatedSettings,
      providerSecrets
    });
    setSettings(result.settings);
    setSettingsStatus("Saved to local settings storage.");
    setSnapshot((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        providers: result.settings.providers,
        agents: result.settings.assistant.agents,
        skills: result.settings.assistant.skills,
        sessions: current.sessions.map((session) => ({
          ...session,
          agentIds: result.settings.assistant.agents.filter((agent) => agent.enabled).map((agent) => agent.id),
          activeAgentId: result.settings.assistant.agents.some(
            (agent) => agent.id === session.activeAgentId && agent.enabled
          )
            ? session.activeAgentId
            : (result.settings.assistant.agents.find((agent) => agent.enabled)?.id ?? session.activeAgentId)
        })),
        activity: [result.activity, ...current.activity].slice(0, 20)
      };
    });
    return result.settings;
  }

  async function handleRecoverSettings(resetSecrets = false) {
    setRecoveringSettings(true);
    try {
      const result = await recoverAppSettings(resetSecrets);
      const refreshedSnapshot = await fetchSnapshot();
      setSnapshot(refreshedSnapshot);
      setSettings(result.settings);
      setMode("live");
      setError(null);
      setSettingsStatus(result.warning ?? `设置已恢复，已备份 ${result.backupPaths.length} 个旧文件。`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to recover settings");
    } finally {
      setRecoveringSettings(false);
    }
  }

  if (loading || !snapshot || !settings) {
    return <LoadingScreen />;
  }

  if (!privacyAccepted) {
    return (
      <PrivacyDialog
        onAccept={() => {
          setPrivacyAccepted(true);
          try {
            localStorage.setItem("nexadesk.privacy.accepted", "true");
          } catch {}
        }}
        onReject={() => {}}
      />
    );
  }

  return (
    <main className={`app-shell no-context${settingsOpen ? " overlay-open" : ""}${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <WindowTitleBar title={`NexaDesk — ${activeAgent?.name ?? "Cowork 助手"}`} />

      <aside className="rail">
        <div className="brand-mark">
          <Workflow size={22} />
        </div>
        <button
          className={activeView === "new" || activeView === "thread" ? "rail-button active" : "rail-button"}
          aria-label="New task"
          onClick={() => {
            window.location.hash = "";
            setActiveView("new");
          }}
          type="button"
        >
          <Sparkles size={19} />
        </button>
        <button
          className={activeView === "agents" ? "rail-button active" : "rail-button"}
          aria-label="Agents"
          onClick={() => handleOpenView("agents")}
          type="button"
        >
          <Bot size={19} />
        </button>
        <button
          className={activeView === "search" ? "rail-button active" : "rail-button"}
          aria-label="Workspace"
          onClick={() => handleOpenView("search")}
          type="button"
        >
          <Folder size={19} />
        </button>
        <button
          className={settingsOpen ? "rail-button active" : "rail-button"}
          aria-label="Settings"
          onClick={() => handleOpenSettings("providers")}
          type="button"
        >
          <Settings size={19} />
        </button>
      </aside>

      <aside className="sidebar">
        <div className="product-title">
          <p className="eyebrow">智能体工作台</p>
          <h1>NexaDesk</h1>
          <span>AI Agentic Workspace</span>
        </div>

        <section className="sidebar-section">
          <div className="section-heading">
            <span>导航</span>
          </div>
          <nav className="nav-list workspace-nav-list" aria-label="Workspace sections">
            <button
              className={
                activeView === "new" || activeView === "thread" ? "nav-item nav-button active" : "nav-item nav-button"
              }
              onClick={() => handleOpenView("new")}
              type="button"
            >
              <Sparkles size={17} />
              <span>
                <strong>新建任务</strong>
                <small>开始一次协作</small>
              </span>
            </button>
            <button
              className={activeView === "search" ? "nav-item nav-button active" : "nav-item nav-button"}
              onClick={() => handleOpenView("search")}
              type="button"
            >
              <Search size={17} />
              <span>
                <strong>搜索任务</strong>
                <small>会话与文件</small>
              </span>
            </button>
            <button
              className={activeView === "scheduled" ? "nav-item nav-button active" : "nav-item nav-button"}
              onClick={() => handleOpenView("scheduled")}
              type="button"
            >
              <CircleDot size={17} />
              <span>
                <strong>定时任务</strong>
                <small>计划与自动化</small>
              </span>
            </button>
            <button
              className={activeView === "runtime" ? "nav-item nav-button active" : "nav-item nav-button"}
              onClick={() => handleOpenView("runtime")}
              type="button"
            >
              <Zap size={17} />
              <span>
                <strong>运行监控</strong>
                <small>调用与成本</small>
              </span>
            </button>
            <button
              className={activeView === "skills" ? "nav-item nav-button active" : "nav-item nav-button"}
              onClick={() => handleOpenView("skills")}
              type="button"
            >
              <Workflow size={17} />
              <span>
                <strong>技能</strong>
                <small>市场与启用</small>
              </span>
              <b>{enabledSkills.length}</b>
            </button>
            <button
              className={activeView === "mcp" ? "nav-item nav-button active" : "nav-item nav-button"}
              onClick={() => handleOpenView("mcp")}
              type="button"
            >
              <Terminal size={17} />
              <span>
                <strong>MCP</strong>
                <small>工具服务器</small>
              </span>
            </button>
            <button
              className={activeView === "agents" ? "nav-item nav-button active" : "nav-item nav-button"}
              onClick={() => handleOpenView("agents")}
              type="button"
            >
              <Users size={17} />
              <span>
                <strong>我的 Agent</strong>
                <small>助手与团队</small>
              </span>
              <b>{snapshot.agents.filter((agent) => agent.enabled).length}</b>
            </button>
            <button
              className={activeView === "memory" ? "nav-item nav-button active" : "nav-item nav-button"}
              onClick={() => handleOpenView("memory")}
              type="button"
            >
              <Brain size={17} />
              <span>
                <strong>记忆</strong>
                <small>项目 · 会话 · 长期</small>
              </span>
              <b>{(settings.memoryEntries ?? []).length}</b>
            </button>
          </nav>
        </section>

        <button className="sidebar-branch-card" onClick={() => handleOpenSettings("assistants")} type="button">
          <span className="branch-icon">main</span>
          <span>
            <strong>{activeAgent?.name ?? "Cowork 助手"}</strong>
            <small>
              {teamAgents.length} 个助手 · {activeRuntimeModel || "未选择模型"}
            </small>
          </span>
        </button>

        <section className="sidebar-section history-section grow">
          <div className="section-heading">
            <span>任务记录</span>
            <div className="section-heading-actions">
              <button className="mini-button" onClick={() => handleOpenView("search")} type="button">
                搜索
              </button>
              <button className="mini-button" onClick={() => setSessionBatchMode((current) => !current)} type="button">
                {sessionBatchMode ? "取消" : "批量"}
              </button>
            </div>
          </div>
          {sessionBatchMode ? (
            <div className="session-batch-bar">
              <span>已选 {selectedSessionIds.size}</span>
              <button
                className="mini-button danger-mini-button"
                disabled={selectedSessionIds.size === 0}
                onClick={() => void handleDeleteSelectedSessions()}
                type="button"
              >
                删除
              </button>
            </div>
          ) : null}
          <div className="session-history-list">
            {orderedSessions.map((session) => (
              <button
                className={
                  session.id === activeSession?.id && activeView === "thread"
                    ? "session-history-card active"
                    : "session-history-card"
                }
                key={session.id}
                onClick={() =>
                  sessionBatchMode ? handleToggleSessionSelection(session.id) : handleOpenSession(session.id)
                }
                type="button"
              >
                {sessionBatchMode ? (
                  <input
                    aria-label={`选择 ${session.title}`}
                    checked={selectedSessionIds.has(session.id)}
                    onChange={() => handleToggleSessionSelection(session.id)}
                    onClick={(event) => event.stopPropagation()}
                    type="checkbox"
                  />
                ) : (
                  <span className={session.pinned ? "history-status-dot pinned" : "history-status-dot"} />
                )}
                {renamingSessionId === session.id ? (
                  <span className="session-rename-inline" onClick={(event) => event.stopPropagation()}>
                    <input
                      value={renameSessionDraft}
                      onChange={(event) => setRenameSessionDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          void handleConfirmRenameSession(session.id);
                        }
                        if (event.key === "Escape") {
                          setRenamingSessionId(null);
                          setRenameSessionDraft("");
                        }
                      }}
                      autoFocus
                    />
                    <button
                      className="mini-button"
                      onClick={() => void handleConfirmRenameSession(session.id)}
                      type="button"
                    >
                      保存
                    </button>
                  </span>
                ) : (
                  <span>
                    <strong>{session.title}</strong>
                    <small>
                      {formatRelativeTime(session.updatedAt)} · {sessionMessageCounts.get(session.id) ?? 0} 条消息 ·{" "}
                      {runtimeSettings.workspace.defaultWorkspace || session.workspace}
                    </small>
                  </span>
                )}
                <span className="session-card-actions" onClick={(event) => event.stopPropagation()}>
                  <button
                    className={session.pinned ? "icon-button active-icon-button" : "icon-button"}
                    onClick={() => void handleToggleSessionPin(session)}
                    type="button"
                    aria-label="置顶任务"
                  >
                    <Pin size={13} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => handleStartRenameSession(session)}
                    type="button"
                    aria-label="重命名任务"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    className="icon-button danger-icon-button"
                    onClick={() => void handleDeleteSession(session.id)}
                    type="button"
                    aria-label="删除任务"
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              </button>
            ))}
            <article className="session-history-card muted-history-card">
              <span className="history-status-dot muted" />
              <span>
                <strong>桌面发布 QA</strong>
                <small>安装包、保留数据、私有分发</small>
              </span>
              <b>计划</b>
            </article>
          </div>
        </section>

        <div className="sidebar-user-bar">
          <UpdateBadge onClick={() => setUpdateModalOpen(true)} />
          <button className="sidebar-user-button" onClick={() => handleOpenSettings("desktop")} type="button">
            <span className="sidebar-user-avatar">N</span>
            <span>
              <strong>NexaDesk</strong>
              <small>{mode === "live" ? "本地 API 已连接" : "演示模式"}</small>
            </span>
          </button>
          <button
            className={settingsOpen ? "sidebar-settings-button active" : "sidebar-settings-button"}
            onClick={() => handleOpenSettings("providers")}
            type="button"
          >
            <Settings size={16} />
            设置
          </button>
        </div>
      </aside>

      <section className="main-stage">
        <div className="sidebar-collapse-trigger">
          <button
            aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
            className="icon-button"
            onClick={() => setSidebarCollapsed((current) => !current)}
            type="button"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        {activeView === "new" ? (
          <NewTaskView
            activeRuntimeModel={activeRuntimeModel}
            activeRuntimeProvider={activeRuntimeProvider}
            draft={draft}
            error={error}
            providers={settings.providers}
            recoveringSettings={recoveringSettings}
            sending={sending}
            onDraftChange={setDraft}
            onRecoverSettings={() => void handleRecoverSettings(false)}
            onRuntimeChange={handleWorkbenchRuntimeChange}
            onSend={handleSend}
          />
        ) : activeView === "thread" ? (
          <TaskThreadView
            activeAgent={activeAgent}
            activeApprovals={activeApprovals}
            activeMessages={activeMessages}
            activeRuntimeModel={activeRuntimeModel}
            activeRuntimeProvider={activeRuntimeProvider}
            draft={draft}
            providers={settings.providers}
            sending={sending}
            taskBoard={taskBoard}
            workspaceLabel={runtimeSettings.workspace.defaultWorkspace || workspaceList?.root || "未设置工作区"}
            onDraftChange={setDraft}
            onOpenContext={() => setThreadContextOpen(true)}
            onRuntimeChange={handleWorkbenchRuntimeChange}
            onSend={handleSend}
          />
        ) : activeView === "search" ? (
          <TaskSearchView
            activeSessionId={activeSession?.id ?? null}
            files={snapshot.files}
            messages={snapshot.messages}
            recentFiles={recentWorkspaceFiles}
            sessions={snapshot.sessions}
            onNewTask={() => handleOpenView("new")}
            onOpenSession={handleOpenSession}
            onSelectSession={setActiveSessionId}
            onOpenWorkspace={() => handleOpenView("thread")}
          />
        ) : activeView === "scheduled" ? (
          <ScheduledTasksView
            agents={snapshot.agents}
            automationRuns={snapshot.automationRuns}
            automations={snapshot.automations}
            taskBoard={taskBoard}
            onCreateAutomation={(payload) => handleCreateAutomation(payload)}
            onRunAutomation={(jobId) => handleRunAutomation(jobId)}
            onUpdateAutomation={(jobId, patch) => handleUpdateAutomation(jobId, patch)}
          />
        ) : activeView === "runtime" ? (
          <RuntimeDashboardView
            activeRuntimeModel={activeRuntimeModel}
            activeRuntimeProvider={activeRuntimeProvider}
            activeApprovals={activeApprovals}
            configuredProviders={configuredProviders}
            enabledSkills={enabledSkills.length}
            runtimeStats={runtimeStats}
            telemetry={runtimeTelemetry}
            runningAgents={runningAgents.length}
            totalAgents={snapshot.agents.length}
            onRefreshTelemetry={() => void handleRefreshRuntimeTelemetry()}
          />
        ) : activeView === "skills" ? (
          <SkillsHubView
            skills={snapshot.skills}
            onImportPluginDirectory={() => void handleImportPluginDirectory()}
            onImportSkillPackage={(raw, fileName) => void handleImportSkillPackage(raw, fileName)}
            onOpenSettings={() => handleOpenSettings("skills")}
            onToggleSkill={(skillId, enabled) => void handleToggleSkillFromHub(skillId, enabled)}
          />
        ) : activeView === "mcp" ? (
          <McpHubView
            servers={runtimeSettings.mcp.servers}
            testResults={mcpTestResults}
            toolResults={mcpToolResults}
            testingServerId={testingMcpServerId}
            refreshingToolsServerId={refreshingMcpToolsServerId}
            toolPolicies={settings.permissions.mcpToolPolicies ?? []}
            onCreate={() => setEditingMcpServerId("__new__")}
            onDelete={(serverId) => void handleDeleteMcpServer(serverId)}
            onEdit={(serverId) => setEditingMcpServerId(serverId)}
            onOpenSettings={() => handleOpenSettings("permissions")}
            onRefreshTools={(server) => void handleRefreshMcpTools(server)}
            onTest={(server) => void handleTestMcpServer(server)}
            onToggle={(serverId, enabled) => void handleToggleMcpServer(serverId, enabled)}
            onUpdateToolPolicy={(policy) => {
              const existing = settings.permissions.mcpToolPolicies ?? [];
              const idx = existing.findIndex((p) => p.toolId === policy.toolId);
              const updated = idx >= 0 ? existing.map((p, i) => (i === idx ? policy : p)) : [...existing, policy];
              void handleSaveSettings({
                ...settings,
                permissions: { ...settings.permissions, mcpToolPolicies: updated }
              });
            }}
          />
        ) : activeView === "memory" ? (
          <MemoryHubView
            memoryEntries={settings.memoryEntries ?? []}
            sessionSummaries={settings.sessionSummaries ?? []}
            memorySettings={settings.memory}
            onOpenSettings={() => handleOpenSettings("memory")}
            onAddEntry={(entry) => {
              const updated = [...(settings.memoryEntries ?? []), entry];
              void handleSaveSettings({ ...settings, memoryEntries: updated });
            }}
            onUpdateEntry={(entryId, patch) => {
              const updated = (settings.memoryEntries ?? []).map((e) =>
                e.id === entryId ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e
              );
              void handleSaveSettings({ ...settings, memoryEntries: updated });
            }}
            onDeleteEntry={(entryId) => {
              const updated = (settings.memoryEntries ?? []).filter((e) => e.id !== entryId);
              void handleSaveSettings({ ...settings, memoryEntries: updated });
            }}
          />
        ) : (
          <AgentsHubView
            activeAgent={activeAgent}
            agents={snapshot.agents}
            engines={runtimeSettings.assistant.engines}
            teams={teams}
            onActivate={handleActivateAgent}
            onCreate={() => setEditingAgentId("__new__")}
            onEdit={(agentId) => setEditingAgentId(agentId)}
            onOpenSettings={() => handleOpenSettings("assistants")}
          />
        )}
      </section>

      {activeView === "thread" && threadContextOpen ? (
        <>
          <button
            aria-label="关闭实时工作区"
            className="context-drawer-backdrop"
            onClick={() => setThreadContextOpen(false)}
            type="button"
          />
          <aside className="context-drawer" role="dialog" aria-modal="true" aria-label="实时工作区上下文">
            <div className="right-dock-heading context-drawer-heading">
              <div>
                <p className="eyebrow">Live Context</p>
                <h3>实时工作区</h3>
              </div>
              <div className="right-dock-heading-actions">
                <span>{activeRuntimeModel || "未选择模型"}</span>
                <button
                  aria-label="收起实时工作区"
                  className="icon-button"
                  onClick={() => setThreadContextOpen(false)}
                  type="button"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <ProviderStatusPanel
              providers={settings.providers}
              onOpenSettings={() => handleOpenSettings("providers")}
            />

            <section className="panel-block">
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">运行概览</p>
                  <h3>任务执行状态</h3>
                </div>
                <ListChecks size={18} />
              </div>
              <div className="task-list compact-task-list">
                {taskBoard.map((task) => (
                  <TaskCard key={task.id} task={task} agents={snapshot.agents} />
                ))}
              </div>
            </section>

            <section className="panel-block" id="approvals">
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">权限网关</p>
                  <h3>审批队列</h3>
                </div>
                <ShieldCheck size={18} />
              </div>
              {snapshot.approvals.length > 0 ? (
                <div className="approval-bulk-panel">
                  <div className="approval-bulk-stats">
                    <span>
                      待处理 <b>{snapshot.approvals.length}</b>
                    </span>
                    <span>
                      可批量批准 <b>{batchApprovableApprovals.length}</b>
                    </span>
                    <span>
                      高风险 <b>{highRiskApprovals}</b>
                    </span>
                  </div>
                  <p className="approval-bulk-note">高风险动作必须逐条确认；批量批准只处理低/中风险审批。</p>
                  <label className="approval-reason batch-reason">
                    <span>批量拒绝原因</span>
                    <input
                      value={batchRejectReason}
                      onChange={(event) => setBatchRejectReason(event.target.value)}
                      placeholder="例如：目标目录不明确，先暂停执行"
                    />
                  </label>
                  <div className="approval-bulk-actions">
                    <button
                      className="secondary-button"
                      disabled={resolvingBatchApprovals || batchApprovableApprovals.length === 0}
                      onClick={() => void handleResolveApprovalBatch(true)}
                      type="button"
                    >
                      批量批准低/中风险
                    </button>
                    <button
                      className="secondary-button danger-button"
                      disabled={resolvingBatchApprovals}
                      onClick={() => void handleResolveApprovalBatch(false)}
                      type="button"
                    >
                      批量拒绝全部
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="stack-list">
                {snapshot.approvals.length === 0 ? (
                  <EmptyState title="No pending approvals" detail="High-risk actions will appear here." />
                ) : (
                  snapshot.approvals.map((approval) => (
                    <ApprovalCard
                      key={approval.id}
                      approval={approval}
                      agent={snapshot.agents.find((agent) => agent.id === approval.agentId)}
                      onResolve={handleResolveApproval}
                    />
                  ))
                )}
              </div>
            </section>

            <section className="panel-block">
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">审计记录</p>
                  <h3>审批历史</h3>
                </div>
                <ListChecks size={18} />
              </div>
              <div className="stack-list">
                {snapshot.approvalHistory.length === 0 ? (
                  <EmptyState title="No approval history" detail="Resolved approvals will stay here." />
                ) : (
                  snapshot.approvalHistory
                    .slice(0, 6)
                    .map((history) => (
                      <ApprovalHistoryCard
                        key={`${history.id}-${history.resolvedAt}`}
                        history={history}
                        agent={snapshot.agents.find((agent) => agent.id === history.agentId)}
                      />
                    ))
                )}
              </div>
            </section>

            <section className="panel-block">
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">邮箱</p>
                  <h3>智能体消息</h3>
                </div>
                <Mail size={18} />
              </div>
              <div className="mail-list">
                {mailbox.map((item) => (
                  <article className="mail-card" key={item.id}>
                    <strong>{item.from}</strong>
                    <span>to {item.to}</span>
                    <p>{item.subject}</p>
                  </article>
                ))}
              </div>
            </section>

            <section
              className={`panel-block workspace-context-block${workspaceContextCollapsed ? " collapsed" : ""}`}
              id="workspace-context"
            >
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">上下文</p>
                  <h3>工作区上下文</h3>
                </div>
                <div className="workspace-context-heading-actions">
                  <button
                    aria-expanded={!workspaceContextCollapsed}
                    className="mini-button workspace-context-toggle"
                    onClick={() => setWorkspaceContextCollapsed((current) => !current)}
                    type="button"
                  >
                    {workspaceContextCollapsed ? "展开" : "收起"}
                  </button>
                  <FileText size={18} />
                </div>
              </div>
              {workspaceContextCollapsed ? null : (
                <WorkspaceFilePanel
                  configuredWorkspace={runtimeSettings.workspace.defaultWorkspace}
                  currentPath={workspacePath}
                  error={workspaceError}
                  fallbackFiles={snapshot.files}
                  loading={workspaceLoading}
                  recentFiles={recentWorkspaceFiles}
                  result={workspaceList}
                  onClearRecentFiles={() => setRecentWorkspaceFiles([])}
                  onOpenFile={handleOpenWorkspaceFile}
                  onOpenPath={setWorkspacePath}
                  onRefresh={() => setWorkspaceRefreshTick((current) => current + 1)}
                  onAskAgent={handleAskAgentToReadFile}
                  sending={sending}
                />
              )}
            </section>

            <section className="panel-block">
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">时间线</p>
                  <h3>活动记录</h3>
                </div>
                <CircleDot size={18} />
              </div>
              <div className="timeline">
                {snapshot.activity.slice(0, 8).map((event) => (
                  <ActivityItem key={event.id} event={event} />
                ))}
              </div>
            </section>
          </aside>
        </>
      ) : null}
      {selectedWorkspaceFile ? (
        <WorkspaceFilePreviewDrawer
          entry={selectedWorkspaceFile}
          error={workspaceFileError}
          loading={workspaceFileLoading}
          preview={workspaceFilePreview}
          sending={sending}
          onAskAgent={handleAskAgentToReadFile}
          onClose={() => setSelectedWorkspaceFile(null)}
        />
      ) : null}
      {settingsOpen ? (
        <SettingsModal onClose={handleCloseSettings}>
          <SettingsCenter
            initialTab={settingsInitialTab}
            settings={settings}
            status={settingsStatus}
            onSave={handleSaveSettings}
          />
        </SettingsModal>
      ) : null}
      {editingAgentId ? (
        <AgentEditorModal
          agent={
            editingAgentId === "__new__" ? null : (snapshot.agents.find((agent) => agent.id === editingAgentId) ?? null)
          }
          engines={runtimeSettings.assistant.engines}
          providers={runtimeSettings.providers}
          skills={runtimeSettings.assistant.skills}
          mcpServers={runtimeSettings.mcp.servers}
          mcpTools={discoveredMcpTools}
          onClose={() => setEditingAgentId(null)}
          onSave={(agent) => void handleSaveAgentFromHub(agent)}
        />
      ) : null}
      {editingMcpServerId ? (
        <McpServerEditorModal
          server={
            editingMcpServerId === "__new__"
              ? null
              : (runtimeSettings.mcp.servers.find((server) => server.id === editingMcpServerId) ?? null)
          }
          onClose={() => setEditingMcpServerId(null)}
          onSave={(server) => void handleSaveMcpServer(server)}
        />
      ) : null}

      {toasts.map((toast) => (
        <div
          className="toast-backdrop"
          key={toast.id}
          onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
        >
          <div className="toast-card" onClick={(e) => e.stopPropagation()}>
            <div className="toast-icon">
              {toast.level === "success" ? (
                <Check size={16} />
              ) : toast.level === "error" ? (
                <X size={16} />
              ) : (
                <Sparkles size={16} />
              )}
            </div>
            <span className="toast-message">{toast.message}</span>
            <button
              className="toast-close"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              type="button"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ))}

      {activitySidebarOpen && activeView === "thread" ? (
        <ActivitySidebar activities={snapshot.activity} onClose={() => setActivitySidebarOpen(false)} />
      ) : null}

      {petVisible ? (
        <DesktopPet
          variant={petVariant}
          mood="idle"
          taskTitle={activeSession?.title}
          onClose={() => setPetVisible(false)}
        />
      ) : null}

      {updateModalOpen ? (
        <UpdateModal
          state="info"
          onClose={() => setUpdateModalOpen(false)}
          onDownload={() => {}}
          onInstall={() => {}}
        />
      ) : null}
    </main>
  );
}

function SettingsModal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="settings-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="应用设置"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="settings-modal-close icon-button" onClick={onClose} type="button" aria-label="关闭设置">
          <X size={17} />
        </button>
        {children}
      </section>
    </div>
  );
}

function AgentEditorModal({
  agent,
  engines,
  mcpServers,
  mcpTools,
  providers,
  skills,
  onClose,
  onSave
}: {
  agent: AgentProfile | null;
  engines: AgentEngineSettings[];
  mcpServers: McpServerSettings[];
  mcpTools: McpToolDefinition[];
  providers: ProviderSettings[];
  skills: SkillProfile[];
  onClose: () => void;
  onSave: (agent: AgentProfile) => void;
}) {
  const fallbackEngine = engines.find((engine) => engine.enabled) ?? engines[0];
  const fallbackProvider = providers.find((provider) => provider.connected) ?? providers[0];
  const [name, setName] = useState(agent?.name ?? "自定义 Agent");
  const [description, setDescription] = useState(agent?.description ?? "描述这个 Agent 负责的任务。");
  const [category, setCategory] = useState<AgentProfile["category"]>(agent?.category ?? "custom");
  const [enabled, setEnabled] = useState(agent?.enabled ?? true);
  const [engineId, setEngineId] = useState(agent?.engineId ?? fallbackEngine?.id ?? "nexadesk_builtin");
  const [providerId, setProviderId] = useState(agent?.providerId ?? fallbackProvider?.id ?? "openai-compatible");
  const [instructions, setInstructions] = useState(
    agent?.instructions ?? "说明这个 Agent 应该如何处理任务、何时请求工具、输出什么结果。"
  );
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(() => new Set(agent?.skills ?? []));
  const [selectedMcpToolIds, setSelectedMcpToolIds] = useState<Set<string>>(() => new Set(agent?.mcpToolIds ?? []));
  const selectedEngine = engines.find((engine) => engine.id === engineId) ?? fallbackEngine;
  const mcpToolChoices = buildMcpToolChoices(mcpServers, mcpTools, selectedMcpToolIds);

  function toggleSkill(skillId: string) {
    setSelectedSkillIds((current) => {
      const next = new Set(current);
      if (next.has(skillId)) {
        next.delete(skillId);
      } else {
        next.add(skillId);
      }
      return next;
    });
  }

  function toggleMcpTool(toolId: string) {
    setSelectedMcpToolIds((current) => {
      const next = new Set(current);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  }

  function submitAgent(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }
    onSave({
      id: agent?.id ?? `custom-agent-${crypto.randomUUID().slice(0, 8)}`,
      name: trimmedName,
      description: description.trim() || "自定义 Agent",
      runtime: selectedEngine?.name ?? "NexaDesk Built-in",
      engineId,
      providerId,
      status: agent?.status ?? "idle",
      skills: [...selectedSkillIds],
      mcpToolIds: [...selectedMcpToolIds],
      enabled,
      category,
      instructions: instructions.trim() || "按用户目标完成任务，必要时请求工具和审批。"
    });
  }

  return (
    <div className="agent-editor-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="agent-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Agent 编辑器"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submitAgent}
      >
        <div className="agent-editor-header">
          <div>
            <p className="eyebrow">Agent Builder</p>
            <h2>{agent ? "编辑 Agent" : "新建 Agent"}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="关闭 Agent 编辑器">
            <X size={17} />
          </button>
        </div>
        <div className="agent-editor-grid">
          <section className="settings-form">
            <label>
              <span>名称</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              <span>描述</span>
              <input value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <label>
              <span>类型</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as AgentProfile["category"])}
              >
                <option value="cowork">Cowork</option>
                <option value="code">代码</option>
                <option value="office">Office</option>
                <option value="file">文件</option>
                <option value="report">报告</option>
                <option value="custom">自定义</option>
              </select>
            </label>
            <label>
              <span>Agent 引擎</span>
              <select
                value={engineId}
                onChange={(event) => setEngineId(event.target.value as AgentEngineSettings["id"])}
              >
                {engines.map((engine) => (
                  <option key={engine.id} value={engine.id}>
                    {engine.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>默认 Provider</span>
              <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-check-row">
              <input checked={enabled} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" />
              <span>启用这个 Agent</span>
            </label>
          </section>
          <section className="settings-form">
            <label>
              <span>系统提示词</span>
              <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} />
            </label>
            <div className="agent-skill-picker">
              <span>绑定技能</span>
              <div>
                {skills.map((skill) => (
                  <label key={skill.id}>
                    <input
                      checked={selectedSkillIds.has(skill.id)}
                      onChange={() => toggleSkill(skill.id)}
                      type="checkbox"
                    />
                    <strong>{skill.name}</strong>
                  </label>
                ))}
              </div>
            </div>
            <div className="agent-skill-picker mcp-tool-picker">
              <span>绑定 MCP 工具</span>
              <div>
                {mcpToolChoices.length === 0 ? (
                  <small className="empty-picker-note">先到 MCP 页面新增服务器并刷新工具。</small>
                ) : (
                  mcpToolChoices.map((choice) => (
                    <label key={choice.id}>
                      <input
                        checked={selectedMcpToolIds.has(choice.id)}
                        onChange={() => toggleMcpTool(choice.id)}
                        type="checkbox"
                      />
                      <strong>{choice.label}</strong>
                      <small>{choice.detail}</small>
                    </label>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
        <div className="agent-editor-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            取消
          </button>
          <button className="primary-button" type="submit">
            保存 Agent
          </button>
        </div>
      </form>
    </div>
  );
}

function buildMcpToolChoices(servers: McpServerSettings[], tools: McpToolDefinition[], selectedIds: Set<string>) {
  const choices = servers.map((server) => ({
    id: `${server.id}:*`,
    label: `${server.name} · 全部工具`,
    detail: `${server.transport} · ${server.enabled ? "启用" : "停用"}`
  }));
  const knownIds = new Set(choices.map((choice) => choice.id));
  for (const tool of tools) {
    if (knownIds.has(tool.id)) {
      continue;
    }
    knownIds.add(tool.id);
    choices.push({
      id: tool.id,
      label: tool.title || tool.name,
      detail: `${tool.serverName} · ${tool.description}`
    });
  }
  for (const selectedId of selectedIds) {
    if (knownIds.has(selectedId)) {
      continue;
    }
    const [serverId, toolName] = selectedId.split(":");
    const server = servers.find((item) => item.id === serverId);
    choices.push({
      id: selectedId,
      label: toolName === "*" ? `${server?.name ?? serverId} · 全部工具` : toolName || selectedId,
      detail: server ? `${server.name} · 已保存绑定` : "已保存绑定，当前 MCP 服务器不存在"
    });
  }
  return choices;
}

function McpServerEditorModal({
  server,
  onClose,
  onSave
}: {
  server: McpServerSettings | null;
  onClose: () => void;
  onSave: (server: McpServerSettings) => void;
}) {
  const [name, setName] = useState(server?.name ?? "自定义 MCP");
  const [description, setDescription] = useState(server?.description ?? "描述这个 MCP 服务器提供的工具。");
  const [transport, setTransport] = useState<McpServerSettings["transport"]>(server?.transport ?? "stdio");
  const [enabled, setEnabled] = useState(server?.enabled ?? true);
  const [command, setCommand] = useState(server?.command ?? "npx");
  const [argsText, setArgsText] = useState((server?.args ?? []).join("\n"));
  const [url, setUrl] = useState(server?.url ?? "http://127.0.0.1:8787/mcp");

  function submitMcpServer(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }
    const args = argsText
      .split(/\r?\n/)
      .map((arg) => arg.trim())
      .filter(Boolean);

    onSave({
      id: server?.id ?? `custom-mcp-${crypto.randomUUID().slice(0, 8)}`,
      name: trimmedName,
      description: description.trim() || "自定义 MCP 服务器。",
      transport,
      enabled,
      command: transport === "stdio" ? command.trim() || undefined : undefined,
      args: transport === "stdio" ? args : undefined,
      url: transport === "http" ? url.trim() || undefined : undefined
    });
  }

  return (
    <div className="agent-editor-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="agent-editor-modal mcp-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-label="MCP 编辑器"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submitMcpServer}
      >
        <div className="agent-editor-header">
          <div>
            <p className="eyebrow">MCP Server</p>
            <h2>{server ? "编辑 MCP" : "新增 MCP"}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="关闭 MCP 编辑器">
            <X size={17} />
          </button>
        </div>
        <div className="agent-editor-grid">
          <section className="settings-form">
            <label>
              <span>名称</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              <span>描述</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <label>
              <span>连接方式</span>
              <select
                value={transport}
                onChange={(event) => setTransport(event.target.value as McpServerSettings["transport"])}
              >
                <option value="stdio">stdio 本地命令</option>
                <option value="http">HTTP 远程端点</option>
              </select>
            </label>
            <label className="inline-check-row">
              <input checked={enabled} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" />
              <span>启用这个 MCP</span>
            </label>
          </section>
          <section className="settings-form">
            {transport === "stdio" ? (
              <>
                <label>
                  <span>命令</span>
                  <input
                    value={command}
                    onChange={(event) => setCommand(event.target.value)}
                    placeholder="npx / node / uvx"
                  />
                </label>
                <label>
                  <span>参数（每行一个）</span>
                  <textarea
                    value={argsText}
                    onChange={(event) => setArgsText(event.target.value)}
                    placeholder={"-y\n@modelcontextprotocol/server-filesystem"}
                  />
                </label>
              </>
            ) : (
              <label>
                <span>HTTP URL</span>
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="http://127.0.0.1:8787/mcp"
                />
              </label>
            )}
            <div className="mcp-editor-note">
              <strong>测试连接</strong>
              <span>保存后在 MCP 页面点击"测试连接"。stdio 会检查本地命令是否存在，HTTP 会请求端点并返回状态码。</span>
            </div>
          </section>
        </div>
        <div className="agent-editor-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            取消
          </button>
          <button className="primary-button" type="submit">
            保存 MCP
          </button>
        </div>
      </form>
    </div>
  );
}

function RuntimePicker({
  activeRuntimeModel,
  activeRuntimeProvider,
  providers,
  onRuntimeChange
}: {
  activeRuntimeModel: string;
  activeRuntimeProvider?: ProviderSettings;
  providers: ProviderSettings[];
  onRuntimeChange: (providerId: string, model?: string) => Promise<void>;
}) {
  return (
    <div className="compact-runtime-picker">
      <label>
        <span>模型服务</span>
        <select value={activeRuntimeProvider?.id ?? ""} onChange={(event) => void onRuntimeChange(event.target.value)}>
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.connected ? "已启用 - " : "未启用 - "}
              {provider.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>模型</span>
        <select
          value={activeRuntimeModel}
          onChange={(event) => void onRuntimeChange(activeRuntimeProvider?.id ?? "", event.target.value)}
        >
          {Array.from(new Set([activeRuntimeModel, ...(activeRuntimeProvider?.models ?? [])]))
            .filter(Boolean)
            .map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}

function NewTaskView({
  activeRuntimeModel,
  activeRuntimeProvider,
  draft,
  error,
  providers,
  recoveringSettings,
  sending,
  onDraftChange,
  onRecoverSettings,
  onRuntimeChange,
  onSend
}: {
  activeRuntimeModel: string;
  activeRuntimeProvider?: ProviderSettings;
  draft: string;
  error: string | null;
  providers: ProviderSettings[];
  recoveringSettings: boolean;
  sending: boolean;
  onDraftChange: (value: string) => void;
  onRecoverSettings: () => void;
  onRuntimeChange: (providerId: string, model?: string) => Promise<void>;
  onSend: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const quickTasks = [
    {
      label: "制作幻灯片",
      detail: "结构、页面、讲稿",
      prompt: "帮我制作一个项目汇报 PPT 大纲，并列出每页标题和要点。"
    },
    {
      label: "数据分析",
      detail: "表格、口径、结论",
      prompt: "帮我分析当前工作区里的数据文件，先总结字段和可能的分析方向。"
    },
    {
      label: "创建网页",
      detail: "产品页、工具页、小游戏",
      prompt: "帮我创建一个可运行的网页原型，先给出结构再实现。"
    },
    {
      label: "整理文件",
      detail: "目录、命名、归档",
      prompt: "帮我扫描工作区目录，提出文件整理和归档方案。"
    }
  ];

  return (
    <section className="workspace welcome-workspace">
      <header className="minimal-topbar assignment-topbar">
        <div className="assignment-topbar-title">
          <span className="workspace-view-pill">对话</span>
          <span>工作室</span>
          <strong>新建任务</strong>
        </div>
        <RuntimePicker
          activeRuntimeModel={activeRuntimeModel}
          activeRuntimeProvider={activeRuntimeProvider}
          providers={providers}
          onRuntimeChange={onRuntimeChange}
        />
        <span className="safe-badge">
          <ShieldCheck size={14} />
          安全防护中
        </span>
      </header>

      {error ? (
        <div className="notice notice-with-actions start-notice">
          <span>API note: {error}. The workbench is using demo data until the server is available.</span>
          <button className="mini-button" disabled={recoveringSettings} onClick={onRecoverSettings} type="button">
            {recoveringSettings ? "恢复中..." : "恢复本地设置"}
          </button>
        </div>
      ) : null}

      <div className="start-canvas">
        <div className="assignment-bot-mark">
          <Sparkles size={32} />
        </div>
        <div className="assignment-heading">
          <h2>开始协作</h2>
          <p>把一个任务交给 Cowork，NexaDesk 会把模型、工具、文件上下文和审批串起来。</p>
        </div>

        <form className="new-task-composer" onSubmit={onSend}>
          <textarea
            aria-label="新建任务"
            placeholder="分配任务或提出问题..."
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
          />
          <div className="new-task-composer-footer">
            <span>
              <Folder size={15} />
              当前工作区
              <b>已连接上下文</b>
            </span>
            <div>
              <button className="icon-button" type="button" aria-label="附件">
                <FileText size={15} />
              </button>
              <button className="icon-button" type="button" aria-label="技能">
                <Workflow size={15} />
              </button>
              <button className="send-orb" disabled={sending || !draft.trim()} type="submit">
                <Send size={20} />
              </button>
            </div>
          </div>
        </form>

        <div className="quick-prompt-row assignment-quick-row">
          {quickTasks.map((task, index) => (
            <button key={task.label} onClick={() => onDraftChange(task.prompt)} type="button">
              {index === 0 ? (
                <FileText size={16} />
              ) : index === 1 ? (
                <Zap size={16} />
              ) : index === 2 ? (
                <Workflow size={16} />
              ) : (
                <Folder size={16} />
              )}
              <span>
                <strong>{task.label}</strong>
                <small>{task.detail}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="assignment-context-strip">
          <span>Local runtime · {activeRuntimeProvider?.name ?? "未选择模型服务"}</span>
          <span>{activeRuntimeModel || "未选择模型"}</span>
          <span>工具审批已开启</span>
        </div>
      </div>
    </section>
  );
}

function TaskThreadView({
  activeAgent,
  activeApprovals,
  activeMessages,
  activeRuntimeModel,
  activeRuntimeProvider,
  draft,
  providers,
  sending,
  taskBoard,
  workspaceLabel,
  onDraftChange,
  onOpenContext,
  onRuntimeChange,
  onSend
}: {
  activeAgent: AgentProfile | null;
  activeApprovals: number;
  activeMessages: ChatMessage[];
  activeRuntimeModel: string;
  activeRuntimeProvider?: ProviderSettings;
  draft: string;
  providers: ProviderSettings[];
  sending: boolean;
  taskBoard: TaskBoardItem[];
  workspaceLabel: string;
  onDraftChange: (value: string) => void;
  onOpenContext: () => void;
  onRuntimeChange: (providerId: string, model?: string) => Promise<void>;
  onSend: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const currentTask = taskBoard.find((task) => task.status === "Running") ?? taskBoard[0];
  const completedTasks = taskBoard.filter((task) => task.status === "Done").length;
  const pendingTasks = taskBoard.filter((task) => task.status !== "Done").length;
  const toolActivity = activeMessages.flatMap((message) =>
    (message.toolCalls ?? []).map((tool) => ({
      ...tool,
      messageAuthor: message.author,
      createdAt: message.createdAt
    }))
  );

  return (
    <section className="workspace thread-workspace">
      <header className="task-command-bar run-topbar">
        <div className="task-command-left">
          <div className="thread-tabs" aria-label="任务视图">
            <span className="active">对话</span>
            <span>工作室</span>
          </div>
          <div>
            <strong>任务工作台</strong>
            <small>{currentTask?.title ?? "开始协作"}</small>
          </div>
        </div>
        <div className="task-command-actions">
          <RuntimePicker
            activeRuntimeModel={activeRuntimeModel}
            activeRuntimeProvider={activeRuntimeProvider}
            providers={providers}
            onRuntimeChange={onRuntimeChange}
          />
          <button className="secondary-button thread-context-trigger" onClick={onOpenContext} type="button">
            <FileText size={15} />
            上下文
            {activeApprovals > 0 ? <b>{activeApprovals}</b> : null}
          </button>
        </div>
      </header>

      <div className="task-workbench-canvas">
        <section className="task-workbench-stage task-run-layout">
          <section className="task-chat-column" aria-label="任务对话区">
            <div className="task-chat-header">
              <div>
                <p className="eyebrow">Conversation</p>
                <h2>{activeAgent?.name ?? "Cowork 助手"}</h2>
                <span>{currentTask?.detail ?? "把问题交给 Cowork，工具、审批和上下文会进入右侧运行面板。"}</span>
              </div>
              <div className="task-chat-pills" aria-label="任务状态">
                <span>
                  <Bot size={14} />
                  {activeAgent?.status === "running" ? "运行中" : "待命"}
                </span>
                <span>
                  <ShieldCheck size={14} />
                  {activeApprovals > 0 ? `${activeApprovals} 个审批` : "安全防护中"}
                </span>
              </div>
            </div>

            <div className="task-conversation-pane">
              <div className="message-list workbench-message-list run-message-list">
                {activeMessages.length === 0 ? (
                  <EmptyState title="还没有任务消息" detail="从新建任务发起一次协作，消息会出现在这里。" />
                ) : (
                  activeMessages.map((message) => <MessageBubble key={message.id} message={message} compactTools />)
                )}
              </div>

              <form className="workbench-composer run-composer" onSubmit={onSend}>
                <textarea
                  aria-label="任务输入"
                  placeholder="分配任务或继续提问..."
                  value={draft}
                  onChange={(event) => onDraftChange(event.target.value)}
                />
                <div className="workbench-composer-footer">
                  <span>
                    <Folder size={15} />
                    {workspaceLabel || "当前工作区"}
                  </span>
                  <div>
                    <button className="icon-button" onClick={onOpenContext} type="button" aria-label="打开上下文">
                      <FileText size={15} />
                    </button>
                    <button className="icon-button" type="button" aria-label="选择技能">
                      <Workflow size={15} />
                    </button>
                    <button
                      className="send-orb"
                      disabled={sending || !draft.trim()}
                      type="submit"
                      aria-label="发送任务"
                    >
                      <Send size={20} />
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </section>

          <TaskRunPanel
            activeAgent={activeAgent}
            activeRuntimeModel={activeRuntimeModel}
            activeRuntimeProvider={activeRuntimeProvider}
            approvals={activeApprovals}
            completedTasks={completedTasks}
            messageCount={activeMessages.length}
            pendingTasks={pendingTasks}
            taskBoard={taskBoard}
            toolActivity={toolActivity}
            workspaceLabel={workspaceLabel}
            onOpenContext={onOpenContext}
          />
        </section>
      </div>
    </section>
  );
}

function TaskRunPanel({
  activeAgent,
  activeRuntimeModel,
  activeRuntimeProvider,
  approvals,
  completedTasks,
  messageCount,
  pendingTasks,
  taskBoard,
  toolActivity,
  workspaceLabel,
  onOpenContext
}: {
  activeAgent: AgentProfile | null;
  activeRuntimeModel: string;
  activeRuntimeProvider?: ProviderSettings;
  approvals: number;
  completedTasks: number;
  messageCount: number;
  pendingTasks: number;
  taskBoard: TaskBoardItem[];
  toolActivity: Array<ToolCall & { messageAuthor: string; createdAt: string }>;
  workspaceLabel: string;
  onOpenContext: () => void;
}) {
  const [activePanel, setActivePanel] = useState<"changes" | "activity" | "overview">("changes");
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
  const fileChanges = toolActivity.filter((tool) => {
    const name = String(tool.name);
    return name.includes("write") || name.includes("file") || name.includes("command");
  });
  const visibleTools = toolActivity.slice(-5).reverse();
  const visibleChanges = fileChanges.slice(-4).reverse();
  const selectedChange = visibleChanges.find((tool) => tool.id === selectedChangeId) ?? visibleChanges[0] ?? null;
  const runningTools = toolActivity.filter((tool) => tool.status === "running" || tool.status === "queued").length;
  const completedTools = toolActivity.filter(
    (tool) => tool.status === "completed" || tool.status === "approved"
  ).length;
  const previewTools = selectedChange
    ? [selectedChange, ...visibleChanges.filter((tool) => tool.id !== selectedChange.id).slice(0, 2)]
    : [];
  const codePreviewLines =
    previewTools.length > 0
      ? previewTools.map((tool) => ({
          id: tool.id,
          sign: tool.status === "failed" || tool.status === "rejected" ? "-" : "+",
          text: `${toolNameLabel(tool.name)} · ${tool.summary}`
        }))
      : [
          { id: "waiting-1", sign: "+", text: "等待 Agent 产生文件写入、命令输出或代码 diff。" },
          { id: "waiting-2", sign: "+", text: "高风险写入会先进入审批队列，批准后再执行。" },
          { id: "waiting-3", sign: "+", text: "这里会作为任务运行页的代码变更预览区。" }
        ];

  return (
    <aside className="task-run-panel" aria-label="任务执行面板">
      <div className="task-run-panel-head">
        <div>
          <p className="eyebrow">Run Inspector</p>
          <h3>代码变更</h3>
          <span>
            {activeAgent?.name ?? "Cowork 助手"} · {activeRuntimeModel || "未选择模型"}
          </span>
        </div>
        <button className="secondary-button" onClick={onOpenContext} type="button">
          上下文
        </button>
      </div>

      <div className="task-run-tabs run-panel-tabs" aria-label="运行面板标签">
        <button
          className={activePanel === "overview" ? "active" : ""}
          onClick={() => setActivePanel("overview")}
          type="button"
        >
          运行概览
        </button>
        <button
          className={activePanel === "activity" ? "active" : ""}
          onClick={() => setActivePanel("activity")}
          type="button"
        >
          工具活动
        </button>
        <button
          className={activePanel === "changes" ? "active" : ""}
          onClick={() => setActivePanel("changes")}
          type="button"
        >
          代码变更
        </button>
      </div>

      {activePanel === "changes" ? (
        <section className="task-run-card code-change-card task-run-primary">
          <div className="task-run-heading">
            <div>
              <p className="eyebrow">代码变更</p>
              <h3>文件与命令</h3>
            </div>
            <FileText size={17} />
          </div>
          <div className="change-inspector">
            <div className="change-file-list" aria-label="代码变更列表">
              {visibleChanges.length === 0 ? (
                <article className="change-empty-card">
                  <strong>等待变更</strong>
                  <span>写文件、读文件或执行命令后会进入这里。</span>
                </article>
              ) : (
                visibleChanges.map((tool) => (
                  <button
                    className={selectedChange?.id === tool.id ? "active" : ""}
                    key={`${tool.id}-change`}
                    onClick={() => setSelectedChangeId(tool.id)}
                    type="button"
                  >
                    <span className={`tool-call-dot ${tool.status}`} />
                    <span>
                      <strong>{toolNameLabel(tool.name)}</strong>
                      <small>{tool.summary}</small>
                    </span>
                    <b>{toolStatusLabel(tool.status)}</b>
                  </button>
                ))
              )}
            </div>
            <div className="change-preview-stack">
              <div className="change-selected-summary">
                <span>{selectedChange ? toolStatusLabel(selectedChange.status) : "待生成"}</span>
                <strong>{selectedChange ? toolNameLabel(selectedChange.name) : "实时写入预览"}</strong>
                <small>{selectedChange?.summary ?? "暂无真实文件变更，先保留写入预览区域。"}</small>
              </div>
              <div className="code-preview-window" aria-label="实时写入预览">
                <div className="code-preview-title">
                  <span />
                  实时写入
                </div>
                <pre>
                  {codePreviewLines.map((line, index) => (
                    <code className={line.sign === "-" ? "removed" : "added"} key={line.id}>
                      {String(index + 1).padStart(2, "0")} {line.sign} {line.text}
                    </code>
                  ))}
                </pre>
              </div>
            </div>
          </div>
        </section>
      ) : activePanel === "activity" ? (
        <section className="task-run-card task-run-primary">
          <div className="task-run-heading">
            <div>
              <p className="eyebrow">工具活动</p>
              <h3>实时执行</h3>
            </div>
            <Terminal size={17} />
          </div>
          <div className="task-activity-list">
            {visibleTools.length === 0 ? (
              <span className="task-panel-empty">暂无工具调用。Agent 读取文件、运行命令或写入结果后会出现在这里。</span>
            ) : (
              visibleTools.map((tool) => (
                <article className={`task-activity-row ${tool.status}`} key={tool.id}>
                  <span className={`tool-call-dot ${tool.status}`} />
                  <div>
                    <strong>{toolNameLabel(tool.name)}</strong>
                    <small>{tool.summary}</small>
                  </div>
                  <b>{toolStatusLabel(tool.status)}</b>
                </article>
              ))
            )}
          </div>
        </section>
      ) : (
        <section className="task-run-card run-overview-card task-run-primary">
          <div className="task-run-heading">
            <div>
              <p className="eyebrow">运行概览</p>
              <h3>{activeAgent?.name ?? "Cowork 助手"}</h3>
            </div>
            <span className={`agent-status ${activeAgent?.status ?? "idle"}`} />
          </div>
          <p>
            {activeRuntimeProvider?.name ?? "未选择模型服务"} · {activeRuntimeModel || "未选择模型"}
          </p>
          <div className="run-metric-strip">
            <span>
              <b>{messageCount}</b>
              消息
            </span>
            <span>
              <b>{runningTools}</b>
              运行中
            </span>
            <span>
              <b>{completedTools}</b>
              已完成
            </span>
          </div>
        </section>
      )}

      <section className="task-run-card">
        <div className="task-run-heading">
          <div>
            <p className="eyebrow">审批</p>
            <h3>{approvals > 0 ? `${approvals} 个待处理` : "无需审批"}</h3>
          </div>
          <ShieldCheck size={17} />
        </div>
        <button className="secondary-button" onClick={onOpenContext} type="button">
          打开审批与上下文
        </button>
      </section>

      <section className="task-run-card">
        <div className="task-run-heading">
          <div>
            <p className="eyebrow">任务队列</p>
            <h3>协作步骤</h3>
          </div>
          <ListChecks size={17} />
        </div>
        <div className="task-mini-board">
          <article>
            <span className="status muted-status">Workspace</span>
            <strong>{workspaceLabel || "当前工作区"}</strong>
          </article>
          <article>
            <span className="status muted-status">Progress</span>
            <strong>
              {pendingTasks} 个进行中 · {completedTasks} 个完成
            </strong>
          </article>
          {taskBoard.slice(0, 3).map((task) => (
            <article key={task.id}>
              <span className="status muted-status">{task.status}</span>
              <strong>{task.title}</strong>
            </article>
          ))}
        </div>
      </section>
    </aside>
  );
}

function TaskSearchView({
  activeSessionId,
  files,
  messages,
  recentFiles,
  sessions,
  onNewTask,
  onOpenSession,
  onSelectSession,
  onOpenWorkspace
}: {
  activeSessionId: string | null;
  files: WorkspaceFile[];
  messages: ChatMessage[];
  recentFiles: WorkspaceTreeEntry[];
  sessions: AppSnapshot["sessions"];
  onNewTask: () => void;
  onOpenSession: (sessionId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onOpenWorkspace: () => void;
}) {
  const selectedSession = sessions.find((session) => session.id === activeSessionId) ?? sessions[0];
  const selectedMessages = selectedSession
    ? messages.filter((message) => message.sessionId === selectedSession.id)
    : [];
  const latestMessage = selectedMessages[selectedMessages.length - 1];
  const contextFiles = [...recentFiles, ...files.slice(0, 4)].slice(0, 6);

  return (
    <section className="workspace module-workspace">
      <ModuleHeader
        eyebrow="Search"
        title="任务记录"
        detail="任务列表和任务详情联动，先查看上下文，再进入运行页继续协作。"
        actionLabel="新建任务"
        onAction={onNewTask}
      />
      <div className="module-search-bar">
        <Search size={18} />
        <input placeholder="搜索任务、文件或上下文" />
      </div>
      <div className="module-toolbar">
        <span className="active">全部任务</span>
        <span>已完成</span>
        <span>有审批</span>
        <span>文件上下文</span>
      </div>
      <div className="task-record-layout">
        <section className="panel-block task-record-list-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">History</p>
              <h3>任务记录</h3>
            </div>
            <CircleDot size={18} />
          </div>
          <div className="task-record-list">
            {sessions.map((session) => (
              <button
                className={selectedSession?.id === session.id ? "task-record-row active" : "task-record-row"}
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                type="button"
              >
                <span className={session.pinned ? "history-status-dot pinned" : "history-status-dot"} />
                <span>
                  <strong>{session.title}</strong>
                  <small>
                    {formatRelativeTime(session.updatedAt)} ·{" "}
                    {messages.filter((message) => message.sessionId === session.id).length} 条消息
                  </small>
                </span>
                <b>{session.pinned ? "置顶" : "详情"}</b>
              </button>
            ))}
          </div>
        </section>

        <section className="panel-block task-detail-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Task Detail</p>
              <h3>{selectedSession?.title ?? "未选择任务"}</h3>
            </div>
            <button
              className="primary-button"
              disabled={!selectedSession}
              onClick={() => selectedSession && onOpenSession(selectedSession.id)}
              type="button"
            >
              进入任务
            </button>
          </div>

          <div className="task-detail-summary">
            <span>
              <b>{selectedMessages.length}</b>
              消息
            </span>
            <span>
              <b>{selectedSession?.agentIds.length ?? 0}</b>
              助手
            </span>
            <span>
              <b>{selectedSession?.pinned ? "是" : "否"}</b>
              置顶
            </span>
          </div>

          <div className="task-detail-body">
            <article className="task-detail-card">
              <p className="eyebrow">Latest</p>
              <strong>
                {latestMessage
                  ? `${latestMessage.author} · ${formatRelativeTime(latestMessage.createdAt)}`
                  : "暂无消息"}
              </strong>
              <span>{latestMessage?.content || "从新建任务发起协作后，最近消息会显示在这里。"}</span>
            </article>

            <article className="task-detail-card">
              <p className="eyebrow">Workspace</p>
              <strong>{selectedSession?.workspace ?? "未设置工作区"}</strong>
              <span>任务详情会保留工作区、助手和消息摘要；后续可继续接真实文件 diff 与运行日志。</span>
            </article>
          </div>

          <div className="task-detail-context">
            <div className="panel-heading compact">
              <div>
                <p className="eyebrow">Context</p>
                <h3>最近上下文</h3>
              </div>
              <FileText size={18} />
            </div>
            <div className="stack-list">
              {contextFiles.map((file) => (
                <button className="module-row" key={file.path} onClick={onOpenWorkspace} type="button">
                  <strong>{file.path}</strong>
                  <span>{file.kind}</span>
                  <b>预览</b>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

function ScheduledTasksView({
  agents,
  automationRuns,
  automations,
  taskBoard,
  onCreateAutomation,
  onRunAutomation,
  onUpdateAutomation
}: {
  agents: AgentProfile[];
  automationRuns: AppSnapshot["automationRuns"];
  automations: AppSnapshot["automations"];
  taskBoard: TaskBoardItem[];
  onCreateAutomation: (payload: {
    name: string;
    prompt: string;
    scheduleKind: AutomationScheduleKind;
    enabled: boolean;
    agentId?: string;
  }) => Promise<void> | void;
  onRunAutomation: (jobId: string) => Promise<void> | void;
  onUpdateAutomation: (
    jobId: string,
    patch: {
      enabled?: boolean;
      scheduleKind?: AutomationScheduleKind;
      name?: string;
      prompt?: string;
      agentId?: string;
    }
  ) => Promise<void> | void;
}) {
  const [selectedAutomationId, setSelectedAutomationId] = useState<string | null>(automations[0]?.id ?? null);
  const [draftName, setDraftName] = useState("每天整理工作区文件");
  const [draftPrompt, setDraftPrompt] = useState("检查默认工作区最近变化，列出风险、待办和建议。");
  const [draftScheduleKind, setDraftScheduleKind] = useState<AutomationScheduleKind>("daily");
  const [draftAgentId, setDraftAgentId] = useState<string>(agents[0]?.id ?? "");
  const [draftEnabled, setDraftEnabled] = useState(true);
  const [automationBusyId, setAutomationBusyId] = useState<string | null>(null);
  const [automationStatus, setAutomationStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedAutomationId || !automations.some((job) => job.id === selectedAutomationId)) {
      setSelectedAutomationId(automations[0]?.id ?? null);
    }
  }, [automations, selectedAutomationId]);

  const selectedAutomation = automations.find((job) => job.id === selectedAutomationId) ?? automations[0];
  const enabledAutomations = automations.filter((job) => job.enabled).length;
  const runningTasks =
    automationRuns.filter((run) => run.status === "running").length ||
    taskBoard.filter((task) => task.status === "Running").length;
  const nextRunLabel = selectedAutomation?.nextRun || "未计划";
  const selectedRuns = selectedAutomation
    ? automationRuns.filter((run) => run.jobId === selectedAutomation.id)
    : automationRuns;

  async function submitAutomation(event: FormEvent) {
    event.preventDefault();
    const name = draftName.trim();
    const prompt = draftPrompt.trim();
    if (!name || !prompt) {
      setAutomationStatus("请填写任务名称和执行提示词。");
      return;
    }
    setAutomationStatus(null);
    await Promise.resolve(
      onCreateAutomation({
        name,
        prompt,
        scheduleKind: draftScheduleKind,
        enabled: draftEnabled,
        agentId: draftAgentId || undefined
      })
    );
    setDraftName("");
    setDraftPrompt("");
  }

  async function toggleAutomation(jobId: string, enabled: boolean) {
    setAutomationBusyId(jobId);
    try {
      await Promise.resolve(onUpdateAutomation(jobId, { enabled }));
    } finally {
      setAutomationBusyId(null);
    }
  }

  async function runAutomationNow(jobId: string) {
    setAutomationBusyId(jobId);
    try {
      await Promise.resolve(onRunAutomation(jobId));
    } finally {
      setAutomationBusyId(null);
    }
  }

  return (
    <section className="workspace module-workspace automation-workspace">
      <ModuleHeader
        eyebrow="Automation"
        title="定时任务"
        detail="计划任务、运行记录和执行助手分开管理，后续可接真实后台调度。"
      />
      <div className="automation-dashboard">
        <section className="automation-summary-card">
          <span>
            <b>{automations.length}</b>
            计划任务
          </span>
          <span>
            <b>{enabledAutomations}</b>
            已启用
          </span>
          <span>
            <b>{runningTasks}</b>
            运行中
          </span>
          <span>
            <b>{agents.filter((agent) => agent.enabled).length}</b>
            可用助手
          </span>
        </section>

        <section className="panel-block automation-plan-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Schedule</p>
              <h3>任务计划</h3>
            </div>
            <CircleDot size={18} />
          </div>
          <div className="automation-plan-list">
            {automations.length === 0 ? (
              <EmptyState title="暂无定时任务" detail="创建计划后会显示在这里。" />
            ) : (
              automations.map((job) => (
                <button
                  className={selectedAutomation?.id === job.id ? "automation-plan-row active" : "automation-plan-row"}
                  key={job.id}
                  onClick={() => setSelectedAutomationId(job.id)}
                  type="button"
                >
                  <span className={job.enabled ? "history-status-dot pinned" : "history-status-dot muted"} />
                  <span>
                    <strong>{job.name}</strong>
                    <small>{job.schedule}</small>
                  </span>
                  <b>{job.lastStatus === "failed" ? "失败" : job.enabled ? "启用" : "停用"}</b>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="panel-block automation-detail-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Task Detail</p>
              <h3>{selectedAutomation?.name ?? "选择一个计划"}</h3>
            </div>
            <ListChecks size={18} />
          </div>
          <div className="automation-detail-grid">
            <article>
              <p className="eyebrow">计划</p>
              <strong>{selectedAutomation?.schedule ?? "未设置"}</strong>
              <span>
                {selectedAutomation ? automationScheduleKindLabel(selectedAutomation.scheduleKind) : "未选择任务"}
              </span>
            </article>
            <article>
              <p className="eyebrow">下次运行</p>
              <strong>{nextRunLabel}</strong>
              <span>{selectedAutomation?.enabled ? "后端调度器会按计划触发。" : "当前任务未启用。"}</span>
            </article>
            <article>
              <p className="eyebrow">执行助手</p>
              <strong>
                {agents.find((agent) => agent.id === selectedAutomation?.agentId)?.name ??
                  agents.find((agent) => agent.id === "cowork")?.name ??
                  agents[0]?.name ??
                  "未配置"}
              </strong>
              <span>
                {selectedAutomation?.lastRunAt ? `上次运行：${formatTime(selectedAutomation.lastRunAt)}` : "尚未运行。"}
              </span>
            </article>
          </div>
          {selectedAutomation ? (
            <div className="automation-action-row">
              <button
                className="secondary-button"
                disabled={automationBusyId === selectedAutomation.id}
                onClick={() => void toggleAutomation(selectedAutomation.id, !selectedAutomation.enabled)}
                type="button"
              >
                {selectedAutomation.enabled ? "停用计划" : "启用计划"}
              </button>
              <button
                className="primary-button"
                disabled={automationBusyId === selectedAutomation.id}
                onClick={() => void runAutomationNow(selectedAutomation.id)}
                type="button"
              >
                {automationBusyId === selectedAutomation.id ? "执行中..." : "立即运行"}
              </button>
              {selectedAutomation.failureReason ? (
                <span className="automation-failure-reason">失败原因：{selectedAutomation.failureReason}</span>
              ) : null}
            </div>
          ) : null}
          <form className="automation-composer-card" onSubmit={(event) => void submitAutomation(event)}>
            <strong>新建计划任务</strong>
            <div className="automation-create-inline">
              <input
                placeholder="例如：每天整理工作区文件"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
              />
              <select value={draftAgentId} onChange={(event) => setDraftAgentId(event.target.value)}>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
              <select
                value={draftScheduleKind}
                onChange={(event) => setDraftScheduleKind(event.target.value as AutomationScheduleKind)}
              >
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
                <option value="hourly">每小时</option>
                <option value="once">仅一次</option>
                <option value="manual">手动</option>
              </select>
              <button className="primary-button" type="submit">
                创建
              </button>
            </div>
            <textarea
              rows={3}
              value={draftPrompt}
              onChange={(event) => setDraftPrompt(event.target.value)}
              placeholder="写清楚这个计划任务要让 Agent 做什么。"
            />
            <label className="connection-toggle inline-check-row">
              <input
                checked={draftEnabled}
                onChange={(event) => setDraftEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>创建后立即启用</span>
            </label>
            {automationStatus ? <p className="automation-failure-reason">{automationStatus}</p> : null}
          </form>
        </section>

        <section className="panel-block automation-runs-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Runs</p>
              <h3>运行记录</h3>
            </div>
            <Terminal size={18} />
          </div>
          <div className="automation-run-list">
            {selectedRuns.length === 0 ? (
              <EmptyState title="暂无运行记录" detail="计划触发或手动运行后会显示执行历史。" />
            ) : null}
            {selectedRuns.map((run) => {
              const owner = agents.find((agent) => agent.id === run.agentId);
              return (
                <article key={run.id}>
                  <span className={`tool-call-dot ${run.status}`} />
                  <div>
                    <strong>{run.jobName}</strong>
                    <small>
                      {owner?.name ?? "Unassigned"} · {formatRelativeTime(run.startedAt)} ·{" "}
                      {run.durationMs ? formatDuration(run.durationMs) : "运行中"}
                    </small>
                    {run.failureReason ? (
                      <small className="automation-run-error">失败原因：{run.failureReason}</small>
                    ) : null}
                    {run.resultSummary ? <small>{run.resultSummary}</small> : null}
                  </div>
                  <b>{automationRunStatusLabel(run.status)}</b>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}

function RuntimeDashboardView({
  activeApprovals,
  activeRuntimeModel,
  activeRuntimeProvider,
  configuredProviders,
  enabledSkills,
  runtimeStats,
  telemetry,
  runningAgents,
  totalAgents,
  onRefreshTelemetry
}: {
  activeApprovals: number;
  activeRuntimeModel: string;
  activeRuntimeProvider?: ProviderSettings;
  configuredProviders: number;
  enabledSkills: number;
  runtimeStats: RuntimeDashboardStats;
  telemetry: RuntimeTelemetryEntry[];
  runningAgents: number;
  totalAgents: number;
  onRefreshTelemetry: () => void;
}) {
  const [selectedTelemetryId, setSelectedTelemetryId] = useState<string | null>(telemetry[0]?.id ?? null);
  useEffect(() => {
    if (!selectedTelemetryId || !telemetry.some((entry) => entry.id === selectedTelemetryId)) {
      setSelectedTelemetryId(telemetry[0]?.id ?? null);
    }
  }, [selectedTelemetryId, telemetry]);
  const selectedTelemetry = telemetry.find((entry) => entry.id === selectedTelemetryId) ?? telemetry[0];

  return (
    <section className="workspace module-workspace runtime-dashboard-workspace">
      <ModuleHeader
        eyebrow="Runtime"
        title="AI Runtime Dashboard"
        detail="模型、Agent、技能、审批和执行趋势集中在独立运行监控台。"
      />
      <div className="runtime-dashboard-shell">
        <section className="runtime-dashboard-main">
          <div className="dashboard-filter-row">
            <select>
              <option>近 24 小时</option>
              <option>近 7 天</option>
              <option>近 30 天</option>
              <option>全部</option>
            </select>
            <select>
              <option>全部引擎</option>
              <option>NexaDesk Built-in</option>
              <option>Codex CLI</option>
              <option>Claude Code</option>
            </select>
            <select>
              <option>全部模型</option>
              <option>{activeRuntimeModel || "未选择"}</option>
            </select>
            <select>
              <option>全部状态</option>
              <option>已完成</option>
              <option>错误</option>
              <option>运行中</option>
            </select>
            <button className="mini-button" onClick={onRefreshTelemetry} type="button">
              刷新
            </button>
          </div>

          <div className="dashboard-kpi-grid">
            <div className="kpi-card">
              <strong>{runtimeStats.totalCalls}</strong>
              <span>总调用</span>
              <small>{runtimeStats.telemetrySourceLabel}</small>
            </div>
            <div className="kpi-card">
              <strong>{runtimeStats.successRateLabel}</strong>
              <span>成功率</span>
              <small>按模型流工具状态</small>
            </div>
            <div className="kpi-card">
              <strong>{runtimeStats.averageCompletionLabel}</strong>
              <span>平均完成</span>
              <small>P95 可能更高</small>
            </div>
            <div className="kpi-card">
              <strong>{runtimeStats.averageFirstTokenLabel}</strong>
              <span>平均首字</span>
              <small>TTFT</small>
            </div>
            <div className="kpi-card">
              <strong>{runtimeStats.outputTpsLabel}</strong>
              <span>输出 TPS</span>
              <small>token/s</small>
            </div>
            <div className="kpi-card">
              <strong>{runtimeStats.modelTpsLabel}</strong>
              <span>Model TPS</span>
              <small>总 token/s</small>
            </div>
            <div className="kpi-card">
              <strong>{formatCompactNumber(runtimeStats.totalTokens)}</strong>
              <span>Token 总量</span>
              <small>input + output</small>
            </div>
            <div className="kpi-card">
              <strong>{formatCompactNumber(runtimeStats.contextTokens)}</strong>
              <span>上下文 Token</span>
              <small>当前会话</small>
            </div>
            <div className="kpi-card">
              <strong>{activeRuntimeProvider?.connected ? "在线" : "离线"}</strong>
              <span>Provider</span>
              <small>{activeRuntimeProvider?.name ?? "未选择"}</small>
            </div>
          </div>

          <div className="dashboard-chart-grid">
            <div className="chart-card">
              <h4>调用趋势</h4>
              <div className="runtime-chart-visual" aria-label="调用趋势图">
                {runtimeStats.trendBars.map((height, index) => (
                  <span key={index} style={{ "--bar-height": `${height}%` } as CSSProperties} />
                ))}
              </div>
            </div>
            <div className="chart-card">
              <h4>Token 分布</h4>
              <div className="runtime-chart-visual" aria-label="Token 分布图">
                {runtimeStats.trendBars.map((height, index) => (
                  <span
                    key={index}
                    style={
                      {
                        "--bar-height": `${Math.min(100, height * 1.2)}%`,
                        background: "var(--theme-primary)"
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
            </div>
            <div className="chart-card">
              <h4>延迟趋势</h4>
              <div className="runtime-chart-visual" aria-label="延迟趋势图">
                {runtimeStats.trendBars.map((height, index) => (
                  <span
                    key={index}
                    style={
                      {
                        "--bar-height": `${Math.max(10, 100 - height)}%`,
                        background: "var(--theme-accent)"
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
            </div>
            <div className="chart-card">
              <h4>引擎分布</h4>
              <div style={{ display: "flex", alignItems: "end", gap: 6, height: 100, padding: "10px 0" }}>
                <div style={{ flex: 1, display: "grid", gap: 4, textAlign: "center" }}>
                  <div
                    style={{
                      height: `${Math.max(20, (runningAgents / Math.max(totalAgents, 1)) * 100)}%`,
                      background: "var(--green)",
                      borderRadius: 4
                    }}
                  />
                  <small style={{ fontSize: 10, color: "var(--muted-text)" }}>内置</small>
                </div>
                <div style={{ flex: 1, display: "grid", gap: 4, textAlign: "center" }}>
                  <div style={{ height: "40%", background: "var(--theme-accent)", borderRadius: 4 }} />
                  <small style={{ fontSize: 10, color: "var(--muted-text)" }}>CLI</small>
                </div>
                <div style={{ flex: 1, display: "grid", gap: 4, textAlign: "center" }}>
                  <div
                    style={{
                      height: "25%",
                      background: "var(--theme-primary-muted)",
                      borderRadius: 4,
                      border: "1px solid var(--green)"
                    }}
                  />
                  <small style={{ fontSize: 10, color: "var(--muted-text)" }}>Runtime</small>
                </div>
              </div>
            </div>
          </div>

          <section className="panel-block runtime-call-detail-panel">
            <div className="panel-heading compact">
              <div>
                <p className="eyebrow">Calls</p>
                <h3>调用详情</h3>
              </div>
              <b className="status ready">{telemetry.length}</b>
            </div>
            <div className="runtime-call-layout">
              <div className="runtime-call-list">
                {telemetry.length === 0 ? (
                  <EmptyState title="暂无调用明细" detail="发送消息或运行自动化后会记录模型调用、Token 和耗时。" />
                ) : (
                  telemetry.map((entry) => (
                    <button
                      className={selectedTelemetry?.id === entry.id ? "runtime-call-row active" : "runtime-call-row"}
                      key={entry.id}
                      onClick={() => setSelectedTelemetryId(entry.id)}
                      type="button"
                    >
                      <span className={`tool-call-dot ${entry.status}`} />
                      <span>
                        <strong>{entry.model}</strong>
                        <small>
                          {entry.providerName} · {formatRelativeTime(entry.startedAt)}
                        </small>
                      </span>
                      <b>{runtimeStatusLabel(entry.status)}</b>
                    </button>
                  ))
                )}
              </div>
              <div className="runtime-call-inspector">
                {selectedTelemetry ? (
                  <>
                    <div className="runtime-call-inspector-head">
                      <div>
                        <p className="eyebrow">Selected Call</p>
                        <h3>{selectedTelemetry.model}</h3>
                        <span>{selectedTelemetry.providerName}</span>
                      </div>
                      <span className={selectedTelemetry.status === "failed" ? "status muted-status" : "status ready"}>
                        {runtimeStatusLabel(selectedTelemetry.status)}
                      </span>
                    </div>
                    <div className="runtime-call-metrics">
                      <Metric label="Input Token" value={formatCompactNumber(selectedTelemetry.inputTokens)} />
                      <Metric label="Output Token" value={formatCompactNumber(selectedTelemetry.outputTokens)} />
                      <Metric label="Total Token" value={formatCompactNumber(selectedTelemetry.totalTokens)} />
                      <Metric label="TTFT" value={formatDuration(selectedTelemetry.firstTokenMs)} />
                      <Metric label="耗时" value={formatDuration(selectedTelemetry.durationMs)} />
                      <Metric label="TPS" value={formatRuntimeEntryTps(selectedTelemetry)} />
                    </div>
                    <div className="runtime-call-meta">
                      <span>
                        Started <b>{formatTime(selectedTelemetry.startedAt)}</b>
                      </span>
                      <span>
                        Completed{" "}
                        <b>{selectedTelemetry.completedAt ? formatTime(selectedTelemetry.completedAt) : "未完成"}</b>
                      </span>
                      <span>
                        Session <b>{selectedTelemetry.sessionId}</b>
                      </span>
                    </div>
                    {selectedTelemetry.messagePreview ? (
                      <p className="runtime-call-preview">{selectedTelemetry.messagePreview}</p>
                    ) : null}
                    {selectedTelemetry.error ? (
                      <p className="runtime-call-error">错误：{selectedTelemetry.error}</p>
                    ) : null}
                  </>
                ) : (
                  <EmptyState title="选择调用" detail="从左侧选择一次模型调用查看详情。" />
                )}
              </div>
            </div>
          </section>
        </section>

        <aside className="runtime-side-stack">
          <section className="panel-block runtime-health-card">
            <div className="panel-heading compact">
              <div>
                <p className="eyebrow">Model</p>
                <h3>当前模型服务</h3>
              </div>
              <Bot size={18} />
            </div>
            <div className="runtime-health-list">
              <span>
                Provider <b>{activeRuntimeProvider?.name ?? "未选择"}</b>
              </span>
              <span>
                Model <b>{activeRuntimeModel || "未选择"}</b>
              </span>
              <span>
                服务数 <b>{configuredProviders}</b>
              </span>
            </div>
          </section>

          <section className="panel-block runtime-health-card">
            <div className="panel-heading compact">
              <div>
                <p className="eyebrow">Agents</p>
                <h3>运行队列</h3>
              </div>
              <Users size={18} />
            </div>
            <div className="runtime-health-list">
              <span>
                运行助手{" "}
                <b>
                  {runningAgents}/{totalAgents}
                </b>
              </span>
              <span>
                启用技能 <b>{enabledSkills}</b>
              </span>
              <span>
                待审批 <b>{activeApprovals}</b>
              </span>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function SkillsHubView({
  skills,
  onImportPluginDirectory,
  onImportSkillPackage,
  onOpenSettings,
  onToggleSkill
}: {
  skills: SkillProfile[];
  onImportPluginDirectory: () => void;
  onImportSkillPackage: (raw: string, fileName: string) => void;
  onOpenSettings: () => void;
  onToggleSkill: (skillId: string, enabled: boolean) => void;
}) {
  const [activeTab, setActiveTab] = useState<"installed" | "market">("installed");
  const [activeCategory, setActiveCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const skillPackageInputRef = useRef<HTMLInputElement | null>(null);
  const categories = ["全部", "推荐", "编程开发", "办公文档", "数据分析", "自动化", "研究写作"];
  const enabledSkills = skills.filter((skill) => skill.enabled);
  const visibleSkills = skills.filter((skill) => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery =
      !normalizedQuery ||
      skill.name.toLowerCase().includes(normalizedQuery) ||
      skill.description.toLowerCase().includes(normalizedQuery);
    const category = skillCategoryLabel(skill);
    const matchesCategory = activeCategory === "全部" || activeCategory === "推荐" || category === activeCategory;
    const matchesTab = activeTab === "market" || skill.enabled;
    return matchesQuery && matchesCategory && matchesTab;
  });

  return (
    <section className="workspace module-workspace">
      <ModuleHeader
        eyebrow="Skills"
        title="技能"
        detail="已安装技能和技能市场分开管理，用户自定义技能从设置入口维护。"
        actionLabel="管理技能"
        onAction={onOpenSettings}
      />
      <div className="skills-hub-shell">
        <section className="skills-hero-panel">
          <div>
            <p className="eyebrow">Skill System</p>
            <h3>给智能体装上可复用能力</h3>
            <span>
              {enabledSkills.length} 个技能已启用 · {skills.length} 个技能可配置
            </span>
          </div>
          <div className="skills-hero-actions">
            <button className="primary-button" onClick={() => skillPackageInputRef.current?.click()} type="button">
              导入技能包
            </button>
            <button className="secondary-button" onClick={onImportPluginDirectory} type="button">
              接入本地目录
            </button>
            <button className="secondary-button" onClick={onOpenSettings} type="button">
              添加自定义技能
            </button>
            <input
              ref={skillPackageInputRef}
              accept="application/json,.json"
              hidden
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                file.text().then((text) => onImportSkillPackage(text, file.name));
                event.currentTarget.value = "";
              }}
            />
          </div>
        </section>

        <div className="skills-tabs" aria-label="技能视图">
          <button
            className={activeTab === "installed" ? "active" : ""}
            onClick={() => setActiveTab("installed")}
            type="button"
          >
            已安装 <b>{enabledSkills.length}</b>
          </button>
          <button
            className={activeTab === "market" ? "active" : ""}
            onClick={() => setActiveTab("market")}
            type="button"
          >
            技能市场 <b>{skills.length}</b>
          </button>
        </div>

        <div className="skills-filter-row">
          <div className="module-search-bar">
            <Search size={18} />
            <input placeholder="搜索技能" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className="chip-tabs">
            {categories.map((category) => (
              <button
                className={activeCategory === category ? "active" : ""}
                key={category}
                onClick={() => setActiveCategory(category)}
                type="button"
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <section className="skills-content-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">{activeTab === "installed" ? "Installed" : "Marketplace"}</p>
              <h3>{activeTab === "installed" ? "已安装技能" : "技能市场"}</h3>
            </div>
            <b className="status ready">{visibleSkills.length}</b>
          </div>

          <div className={activeTab === "installed" ? "installed-skill-grid" : "skill-market-grid"}>
            {visibleSkills.length === 0 ? (
              <EmptyState title="没有匹配的技能" detail="换一个分类或搜索词，或者到设置里添加自定义技能。" />
            ) : (
              visibleSkills.map((skill) => (
                <article
                  className={skill.enabled ? "market-card skill-card enabled" : "market-card skill-card"}
                  key={skill.id}
                >
                  <div>
                    <Workflow size={17} />
                    <strong>{skill.name}</strong>
                    <span>{skillCategoryLabel(skill)}</span>
                  </div>
                  <p>{skill.description}</p>
                  <div className="skill-card-meta">
                    <span>{skillSourceLabel(skill.source)}</span>
                    <span>{skill.enabled ? "已安装" : "可安装"}</span>
                  </div>
                  <div className="market-card-actions">
                    <button
                      className={skill.enabled ? "secondary-button danger-soft-button" : "primary-button"}
                      onClick={() => onToggleSkill(skill.id, !skill.enabled)}
                      type="button"
                    >
                      {skill.enabled ? "停用" : "启用"}
                    </button>
                    <button className="secondary-button" onClick={onOpenSettings} type="button">
                      配置
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function skillCategoryLabel(skill: SkillProfile) {
  const text = `${skill.name} ${skill.description}`.toLowerCase();
  if (text.includes("code") || text.includes("代码") || text.includes("开发")) {
    return "编程开发";
  }
  if (
    text.includes("word") ||
    text.includes("ppt") ||
    text.includes("excel") ||
    text.includes("文档") ||
    text.includes("office")
  ) {
    return "办公文档";
  }
  if (text.includes("data") || text.includes("数据") || text.includes("分析")) {
    return "数据分析";
  }
  if (text.includes("整理") || text.includes("自动") || text.includes("automation")) {
    return "自动化";
  }
  if (text.includes("报告") || text.includes("研究") || text.includes("写作")) {
    return "研究写作";
  }
  return "推荐";
}

function skillSourceLabel(source: SkillProfile["source"]) {
  const labels: Record<SkillProfile["source"], string> = {
    built_in: "内置技能",
    custom: "自定义技能",
    extension: "扩展技能"
  };
  return labels[source];
}

function sanitizeImportedSkills(value: unknown, fileName: string): SkillProfile[] {
  const candidates = Array.isArray(value)
    ? value
    : Array.isArray((value as { skills?: unknown })?.skills)
      ? (value as { skills: unknown[] }).skills
      : (value as { skill?: unknown })?.skill
        ? [(value as { skill: unknown }).skill]
        : [value];
  return candidates
    .map((item, index) => sanitizeImportedSkill(item, fileName, index))
    .filter((skill): skill is SkillProfile => Boolean(skill));
}

function sanitizeImportedSkill(value: unknown, fileName: string, index: number): SkillProfile | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Partial<SkillProfile> & { path?: string; prompt?: string };
  const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : "";
  const instructions =
    typeof record.instructions === "string" && record.instructions.trim()
      ? record.instructions.trim()
      : typeof record.prompt === "string" && record.prompt.trim()
        ? record.prompt.trim()
        : "";
  if (!name || !instructions) {
    return null;
  }
  const baseId =
    typeof record.id === "string" && record.id.trim()
      ? record.id.trim()
      : `${fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-")}-${index + 1}`;
  const source: SkillProfile["source"] = record.source === "extension" ? "extension" : "custom";
  return {
    id: `custom-${baseId}`.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase(),
    name,
    description:
      typeof record.description === "string" && record.description.trim()
        ? record.description.trim()
        : `Imported from ${fileName}`,
    enabled: typeof record.enabled === "boolean" ? record.enabled : true,
    source,
    instructions
  };
}

function createSkillFromPluginDirectory(directory: string): SkillProfile {
  const normalized = directory.replace(/[\\/]+$/, "");
  const name = normalized.split(/[\\/]/).filter(Boolean).pop() ?? "Local plugin skill";
  return {
    id: `local-plugin-${hashShort(normalized)}`,
    name,
    description: `本地插件目录：${normalized}`,
    enabled: true,
    source: "extension",
    instructions: `使用本地插件目录中的技能说明和工具资源。目录路径：${normalized}。执行前先确认目录内容和高风险动作审批。`
  };
}

function mergeImportedSkills(existing: SkillProfile[], imported: SkillProfile[]) {
  const importedById = new Map(imported.map((skill) => [skill.id, skill]));
  const merged = existing.map((skill) => importedById.get(skill.id) ?? skill);
  const existingIds = new Set(existing.map((skill) => skill.id));
  return [...merged, ...imported.filter((skill) => !existingIds.has(skill.id))];
}

function hashShort(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function McpHubView({
  servers,
  testResults,
  toolResults,
  testingServerId,
  refreshingToolsServerId,
  toolPolicies,
  onCreate,
  onDelete,
  onEdit,
  onOpenSettings,
  onRefreshTools,
  onTest,
  onToggle,
  onUpdateToolPolicy
}: {
  servers: McpServerSettings[];
  testResults: Record<string, McpServerTestResult>;
  toolResults: Record<string, McpServerToolsResult>;
  testingServerId: string | null;
  refreshingToolsServerId: string | null;
  toolPolicies: McpToolPolicy[];
  onCreate: () => void;
  onDelete: (serverId: string) => void;
  onEdit: (serverId: string) => void;
  onOpenSettings: () => void;
  onRefreshTools: (server: McpServerSettings) => void;
  onTest: (server: McpServerSettings) => void;
  onToggle: (serverId: string, enabled: boolean) => void;
  onUpdateToolPolicy: (policy: McpToolPolicy) => void;
}) {
  const [selectedServerId, setSelectedServerId] = useState<string | null>(servers[0]?.id ?? null);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [mcpMarketTab, setMcpMarketTab] = useState<"installed" | "marketplace" | "custom">("installed");
  const mcpRegistry = [
    {
      id: "tavily",
      name: "Tavily Search",
      category: "搜索",
      description: "AI 优化的网页搜索 API，返回结构化结果。",
      command: "npx -y @anthropic/tavily-mcp"
    },
    {
      id: "github-mcp",
      name: "GitHub MCP",
      category: "开发",
      description: "GitHub 仓库管理、Issue、PR 和代码搜索。",
      command: "npx -y @anthropic/github-mcp"
    },
    {
      id: "context7",
      name: "Context7",
      category: "开发",
      description: "实时库文档查询，自动获取最新 API 文档。",
      command: "npx -y @anthropic/context7-mcp"
    },
    {
      id: "gdrive",
      name: "Google Drive",
      category: "生产力",
      description: "Google Drive 文件搜索、读取和管理。",
      command: "npx -y @anthropic/gdrive-mcp"
    },
    {
      id: "slack-mcp",
      name: "Slack MCP",
      category: "生产力",
      description: "Slack 频道消息读取和发送。",
      command: "npx -y @anthropic/slack-mcp"
    },
    {
      id: "postgres-mcp",
      name: "PostgreSQL",
      category: "数据",
      description: "PostgreSQL 数据库查询和管理。",
      command: "npx -y @anthropic/postgres-mcp"
    }
  ];
  const mcpCategories = ["全部", "搜索", "开发", "生产力", "数据"];
  const [mcpCategoryFilter, setMcpCategoryFilter] = useState("全部");
  const filteredRegistry =
    mcpCategoryFilter === "全部" ? mcpRegistry : mcpRegistry.filter((r) => r.category === mcpCategoryFilter);
  useEffect(() => {
    if (!selectedServerId || !servers.some((server) => server.id === selectedServerId)) {
      setSelectedServerId(servers[0]?.id ?? null);
    }
  }, [selectedServerId, servers]);

  const enabledCount = servers.filter((server) => server.enabled).length;
  const discoveredTools = Object.values(toolResults).flatMap((result) => result.tools);
  const discoveredToolCount = discoveredTools.length;
  const selectedServer = servers.find((server) => server.id === selectedServerId) ?? servers[0];
  const selectedTools = selectedServer ? (toolResults[selectedServer.id]?.tools ?? []) : [];
  const selectedResult = selectedServer ? testResults[selectedServer.id] : undefined;
  const selectedToolsResult = selectedServer ? toolResults[selectedServer.id] : undefined;
  const selectedTarget = selectedServer
    ? selectedServer.transport === "http"
      ? selectedServer.url || "未配置 URL"
      : [selectedServer.command, ...(selectedServer.args ?? [])].filter(Boolean).join(" ") || "未配置命令"
    : "未选择服务器";

  const selectedTool = selectedToolId ? (discoveredTools.find((t) => t.id === selectedToolId) ?? null) : null;
  const toolPolicy = selectedTool ? toolPolicies.find((p) => p.toolId === selectedTool.id) : undefined;
  const toolPermissionValue: PermissionPolicy = toolPolicy?.permission ?? "ask";

  function renderSchema(schema: unknown, depth = 0): ReactNode {
    if (!schema || typeof schema !== "object") {
      return <code className="mcp-schema-primitive">{String(schema ?? "无")}</code>;
    }
    if (Array.isArray(schema)) {
      return (
        <div className="mcp-schema-block" style={{ marginLeft: depth * 14 }}>
          [
          {schema.map((item, i) => (
            <div key={i}>{renderSchema(item, depth + 1)}</div>
          ))}
          ]
        </div>
      );
    }
    const entries = Object.entries(schema as Record<string, unknown>);
    if (entries.length === 0) {
      return <code className="mcp-schema-primitive">{"{}"}</code>;
    }
    return (
      <div className="mcp-schema-block" style={{ marginLeft: depth * 14 }}>
        {"{"}
        {entries.map(([key, value]) => (
          <div className="mcp-schema-row" key={key}>
            <span className="mcp-schema-key">"{key}"</span>
            <span className="mcp-schema-colon">:</span>
            {typeof value === "object" && value !== null ? (
              renderSchema(value, depth + 1)
            ) : (
              <span className="mcp-schema-value">{JSON.stringify(value)}</span>
            )}
          </div>
        ))}
        {"}"}
      </div>
    );
  }

  function buildExample(schema: unknown): string {
    if (!schema || typeof schema !== "object") return "{}";
    const s = schema as Record<string, unknown>;
    const example: Record<string, unknown> = {};
    const props = s.properties as Record<string, Record<string, unknown>> | undefined;
    if (!props) return JSON.stringify(schema, null, 2);
    const required = new Set((s.required as string[]) ?? []);
    for (const [key, prop] of Object.entries(props)) {
      const type = prop.type as string;
      const desc = (prop.description as string) ?? "";
      if (type === "string") {
        example[key] = desc.includes("path")
          ? "/example/path"
          : desc.includes("url")
            ? "https://example.com"
            : `example_${key}`;
      } else if (type === "number" || type === "integer") {
        example[key] = type === "integer" ? 1 : 1.0;
      } else if (type === "boolean") {
        example[key] = true;
      } else if (type === "array") {
        example[key] = [];
      } else {
        example[key] = {};
      }
    }
    return JSON.stringify(example, null, 2);
  }

  return (
    <section className="workspace module-workspace mcp-workspace">
      <ModuleHeader
        eyebrow="MCP"
        title="MCP 工具服务器"
        detail="服务器详情和工具市场分开展示，刷新后可查看真实工具清单。"
        actionLabel="新增 MCP"
        onAction={onCreate}
      />
      <div className="mcp-console-layout">
        <section className="panel-block mcp-server-list-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Servers</p>
              <h3>服务器</h3>
            </div>
            <ShieldCheck size={18} />
          </div>
          <div className="mcp-gateway-stats">
            <span>
              启用 <b>{enabledCount}</b>
            </span>
            <span>
              总数 <b>{servers.length}</b>
            </span>
            <span>
              工具 <b>{discoveredToolCount}</b>
            </span>
          </div>
          <div className="mcp-server-list">
            {servers.map((server) => (
              <button
                className={selectedServer?.id === server.id ? "mcp-server-row active" : "mcp-server-row"}
                key={server.id}
                onClick={() => {
                  setSelectedServerId(server.id);
                  setSelectedToolId(null);
                }}
                type="button"
              >
                <Terminal size={16} />
                <span>
                  <strong>{server.name}</strong>
                  <small>
                    {server.transport} · {server.enabled ? "启用" : "停用"}
                  </small>
                </span>
                <b>{toolResults[server.id]?.tools.length ?? 0}</b>
              </button>
            ))}
          </div>
        </section>

        <section className="panel-block mcp-server-detail-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Server Detail</p>
              <h3>{selectedServer?.name ?? "未选择服务器"}</h3>
            </div>
            <span className={selectedServer?.enabled ? "status ready" : "status muted-status"}>
              {selectedServer?.enabled ? "启用" : "停用"}
            </span>
          </div>
          {selectedServer ? (
            <div className="mcp-detail-body">
              <p>{selectedServer.description}</p>
              <code className="mcp-server-target">{selectedTarget}</code>
              <div className="mcp-detail-meta">
                <span>
                  Transport <b>{selectedServer.transport}</b>
                </span>
                <span>
                  Tools <b>{selectedTools.length}</b>
                </span>
                <span>
                  Test <b>{selectedResult ? (selectedResult.ok ? "通过" : "失败") : "未测试"}</b>
                </span>
              </div>
              {selectedResult ? (
                <div className={selectedResult.ok ? "mcp-test-result ok" : "mcp-test-result failed"}>
                  <strong>{selectedResult.ok ? "连接可用" : "连接失败"}</strong>
                  <span>
                    {selectedResult.message}
                    {typeof selectedResult.status === "number" ? ` · HTTP ${selectedResult.status}` : ""}
                  </span>
                </div>
              ) : null}
              {selectedToolsResult ? (
                <div className={selectedToolsResult.ok ? "mcp-tools-result ok" : "mcp-tools-result failed"}>
                  <strong>
                    {selectedToolsResult.ok ? `已发现 ${selectedToolsResult.tools.length} 个工具` : "工具发现失败"}
                  </strong>
                  <span>{selectedToolsResult.message}</span>
                </div>
              ) : null}
              <div className="mcp-card-actions">
                <button
                  className="secondary-button"
                  onClick={() => onToggle(selectedServer.id, !selectedServer.enabled)}
                  type="button"
                >
                  {selectedServer.enabled ? "停用" : "启用"}
                </button>
                <button
                  className="secondary-button"
                  disabled={testingServerId === selectedServer.id}
                  onClick={() => onTest(selectedServer)}
                  type="button"
                >
                  {testingServerId === selectedServer.id ? "测试中..." : "测试连接"}
                </button>
                <button
                  className="secondary-button"
                  disabled={refreshingToolsServerId === selectedServer.id}
                  onClick={() => onRefreshTools(selectedServer)}
                  type="button"
                >
                  {refreshingToolsServerId === selectedServer.id ? "刷新中..." : "刷新工具"}
                </button>
                <button className="secondary-button" onClick={() => onEdit(selectedServer.id)} type="button">
                  编辑
                </button>
                <button
                  className="secondary-button danger-soft-button"
                  onClick={() => onDelete(selectedServer.id)}
                  type="button"
                >
                  删除
                </button>
              </div>
              <button className="secondary-button" onClick={onOpenSettings} type="button">
                打开权限策略
              </button>
            </div>
          ) : (
            <EmptyState title="未选择服务器" detail="新增或选择一个 MCP 服务器后查看详情。" />
          )}
        </section>

        <section className="panel-block mcp-tool-market-panel">
          {selectedTool ? (
            <>
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">Tool Detail</p>
                  <h3>{selectedTool.title || selectedTool.name}</h3>
                </div>
                <button className="icon-button" onClick={() => setSelectedToolId(null)} type="button">
                  <X size={15} />
                </button>
              </div>
              <div className="mcp-tool-detail-body">
                <div className="mcp-tool-detail-header">
                  <Workflow size={16} />
                  <div>
                    <strong>{selectedTool.name}</strong>
                    <span>{selectedTool.serverName}</span>
                  </div>
                </div>
                <p className="mcp-tool-detail-desc">{selectedTool.description || "该工具没有描述。"}</p>

                <div className="mcp-tool-detail-section">
                  <h4>输入 Schema</h4>
                  <div className="mcp-schema-viewer">
                    {selectedTool.inputSchema ? (
                      renderSchema(selectedTool.inputSchema)
                    ) : (
                      <span className="mcp-schema-empty">该工具没有定义输入 Schema。</span>
                    )}
                  </div>
                </div>

                <div className="mcp-tool-detail-section">
                  <h4>参数示例</h4>
                  <pre className="mcp-example-code">
                    {selectedTool.inputSchema ? buildExample(selectedTool.inputSchema) : "{}"}
                  </pre>
                </div>

                <div className="mcp-tool-detail-section">
                  <h4>工具权限</h4>
                  <div className="mcp-tool-permission-row">
                    {(["allow", "ask", "deny"] as const).map((perm) => (
                      <label className={`mcp-perm-radio${toolPermissionValue === perm ? " active" : ""}`} key={perm}>
                        <input
                          checked={toolPermissionValue === perm}
                          onChange={() =>
                            onUpdateToolPolicy({
                              toolId: selectedTool.id,
                              serverId: selectedTool.serverId,
                              permission: perm
                            })
                          }
                          name={`mcp-tool-perm-${selectedTool.id}`}
                          type="radio"
                        />
                        <span>{perm === "allow" ? "允许" : perm === "ask" ? "询问" : "拒绝"}</span>
                      </label>
                    ))}
                  </div>
                  <p className="mcp-perm-hint">
                    {toolPermissionValue === "allow" && "该工具将自动执行，不再弹出审批。"}
                    {toolPermissionValue === "ask" && "每次调用前将弹出审批确认。"}
                    {toolPermissionValue === "deny" && "该工具将被禁止调用。"}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="marketplace-tabs">
                <button
                  className={mcpMarketTab === "installed" ? "marketplace-tab active" : "marketplace-tab"}
                  onClick={() => setMcpMarketTab("installed")}
                  type="button"
                >
                  已安装
                </button>
                <button
                  className={mcpMarketTab === "marketplace" ? "marketplace-tab active" : "marketplace-tab"}
                  onClick={() => setMcpMarketTab("marketplace")}
                  type="button"
                >
                  市场
                </button>
                <button
                  className={mcpMarketTab === "custom" ? "marketplace-tab active" : "marketplace-tab"}
                  onClick={() => setMcpMarketTab("custom")}
                  type="button"
                >
                  自定义
                </button>
              </div>

              {mcpMarketTab === "installed" ? (
                <div className="mcp-tool-market-grid">
                  {selectedTools.length === 0 ? (
                    <EmptyState title="暂无工具" detail={'点击"刷新工具"后会显示该服务器真实暴露的工具。'} />
                  ) : (
                    selectedTools.map((tool) => {
                      const tp = toolPolicies.find((p) => p.toolId === tool.id);
                      const permLabel =
                        tp?.permission === "allow" ? "允许" : tp?.permission === "deny" ? "拒绝" : "询问";
                      const permClass =
                        tp?.permission === "allow"
                          ? "status ready"
                          : tp?.permission === "deny"
                            ? "status danger-status"
                            : "status muted-status";
                      return (
                        <article className="mcp-tool-market-card" key={tool.id}>
                          <div>
                            <Workflow size={16} />
                            <strong>{tool.title || tool.name}</strong>
                            <span>{tool.serverName}</span>
                          </div>
                          <p>{tool.description || "该工具没有描述。"}</p>
                          <div className="mcp-card-actions">
                            <button
                              className="secondary-button"
                              onClick={() => setSelectedToolId(tool.id)}
                              type="button"
                            >
                              查看详情
                            </button>
                            {tp ? <span className={permClass}>{permLabel}</span> : null}
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              ) : mcpMarketTab === "marketplace" ? (
                <>
                  <div style={{ display: "flex", gap: 6, padding: "8px 12px", flexWrap: "wrap" }}>
                    {mcpCategories.map((cat) => (
                      <button
                        className={mcpCategoryFilter === cat ? "quick-action-chip" : "quick-action-chip"}
                        key={cat}
                        onClick={() => setMcpCategoryFilter(cat)}
                        style={
                          mcpCategoryFilter === cat
                            ? {
                                borderColor: "var(--green)",
                                color: "var(--green)",
                                background: "var(--theme-primary-muted)"
                              }
                            : {}
                        }
                        type="button"
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div className="marketplace-grid">
                    {filteredRegistry.map((item) => {
                      const installed = servers.some((s) => s.name === item.name);
                      return (
                        <article className="marketplace-card" key={item.id}>
                          <div className="marketplace-card-header">
                            <h4>{item.name}</h4>
                            <span className="marketplace-badge category">{item.category}</span>
                          </div>
                          <p>{item.description}</p>
                          <div className="mcp-card-actions">
                            {installed ? (
                              <span className="marketplace-badge installed">已安装</span>
                            ) : (
                              <button className="secondary-button" type="button">
                                安装
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div style={{ padding: 20, textAlign: "center" }}>
                  <EmptyState title="自定义服务器" detail={'点击"新增 MCP"添加自定义服务器配置。'} />
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
}

function MemoryHubView({
  memoryEntries,
  sessionSummaries,
  memorySettings,
  onOpenSettings,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry
}: {
  memoryEntries: MemoryEntry[];
  sessionSummaries: SessionSummary[];
  memorySettings: AppSettings["memory"];
  onOpenSettings: () => void;
  onAddEntry: (entry: MemoryEntry) => void;
  onUpdateEntry: (entryId: string, patch: Partial<MemoryEntry>) => void;
  onDeleteEntry: (entryId: string) => void;
}) {
  const [activeSection, setActiveSection] = useState<"project" | "session" | "long_term">("project");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftTags, setDraftTags] = useState("");

  const kindLabels: Record<MemoryEntryKind, string> = {
    project: "项目记忆",
    session: "会话摘要",
    long_term: "长期记忆"
  };
  const kindIcons: Record<MemoryEntryKind, typeof Brain> = {
    project: Database,
    session: FileText,
    long_term: Brain
  };

  const filteredEntries = memoryEntries.filter((e) => {
    if (e.kind !== activeSection) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.title.toLowerCase().includes(q) ||
      e.content.toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  const filteredSummaries =
    activeSection === "session"
      ? sessionSummaries.filter(
          (s) =>
            !searchQuery ||
            s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.summary.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : [];

  function handleStartEdit(entry: MemoryEntry) {
    setEditingId(entry.id);
    setDraftTitle(entry.title);
    setDraftContent(entry.content);
    setDraftTags(entry.tags.join(", "));
  }

  function handleSaveEdit() {
    if (!editingId) return;
    onUpdateEntry(editingId, {
      title: draftTitle,
      content: draftContent,
      tags: draftTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    });
    setEditingId(null);
  }

  function handleCreateEntry() {
    const now = new Date().toISOString();
    onAddEntry({
      id: `mem-${Date.now()}`,
      kind: activeSection,
      title: draftTitle || "新记忆条目",
      content: draftContent || "",
      tags: draftTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      createdAt: now,
      updatedAt: now,
      source: "手动创建"
    });
    setDraftTitle("");
    setDraftContent("");
    setDraftTags("");
  }

  function formatDuration(ms?: number) {
    if (!ms) return "—";
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins} 分钟`;
    return `${Math.round(mins / 60)} 小时`;
  }

  const Icon = kindIcons[activeSection];

  return (
    <section className="workspace module-workspace memory-workspace">
      <ModuleHeader
        eyebrow="Memory"
        title="记忆管理"
        detail="浏览和管理项目记忆、会话摘要与长期记忆。"
        actionLabel="记忆设置"
        onAction={onOpenSettings}
      />
      <div className="memory-layout">
        <section className="panel-block memory-sidebar-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Categories</p>
              <h3>记忆分类</h3>
            </div>
            <Brain size={18} />
          </div>
          <div className="memory-category-list">
            {(["project", "session", "long_term"] as const).map((kind) => {
              const KIcon = kindIcons[kind];
              const count =
                kind === "session" ? sessionSummaries.length : memoryEntries.filter((e) => e.kind === kind).length;
              return (
                <button
                  className={activeSection === kind ? "memory-category-row active" : "memory-category-row"}
                  key={kind}
                  onClick={() => {
                    setActiveSection(kind);
                    setEditingId(null);
                  }}
                  type="button"
                >
                  <KIcon size={16} />
                  <span>
                    <strong>{kindLabels[kind]}</strong>
                    <small>
                      {kind === "project"
                        ? "项目偏好、路径、技术栈"
                        : kind === "session"
                          ? "对话摘要与关键结论"
                          : "长期积累的用户画像与模式"}
                    </small>
                  </span>
                  <b>{count}</b>
                </button>
              );
            })}
          </div>

          <div className="memory-stats-card">
            <div className="memory-stat">
              <strong>{memorySettings.projectMemory ? "开" : "关"}</strong>
              <span>项目记忆</span>
            </div>
            <div className="memory-stat">
              <strong>{memorySettings.conversationMemory ? "开" : "关"}</strong>
              <span>会话记忆</span>
            </div>
            <div className="memory-stat">
              <strong>{memorySettings.longTermMemory ? "开" : "关"}</strong>
              <span>长期记忆</span>
            </div>
            <div className="memory-stat">
              <strong>{memorySettings.retentionDays}天</strong>
              <span>保留期限</span>
            </div>
          </div>
        </section>

        <section className="panel-block memory-main-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">{kindLabels[activeSection]}</p>
              <h3>{activeSection === "session" ? "会话摘要" : kindLabels[activeSection]}</h3>
            </div>
            <Icon size={18} />
          </div>

          <div className="memory-toolbar">
            <label className="memory-search-label">
              <Search size={14} />
              <input placeholder="搜索记忆..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </label>
          </div>

          {activeSection !== "session" ? (
            <div className="memory-entry-list">
              <div className="memory-create-row">
                <input placeholder="标题" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
                <textarea
                  placeholder="内容"
                  rows={2}
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                />
                <input
                  placeholder="标签（逗号分隔）"
                  value={draftTags}
                  onChange={(e) => setDraftTags(e.target.value)}
                />
                <button className="secondary-button" onClick={handleCreateEntry} type="button">
                  添加记忆
                </button>
              </div>

              {filteredEntries.length === 0 ? (
                <EmptyState title="暂无记忆" detail={`还没有${kindLabels[activeSection]}条目，在上方创建一个。`} />
              ) : (
                filteredEntries.map((entry) => (
                  <article className={entry.pinned ? "memory-entry-card pinned" : "memory-entry-card"} key={entry.id}>
                    {editingId === entry.id ? (
                      <div className="memory-edit-form">
                        <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
                        <textarea value={draftContent} onChange={(e) => setDraftContent(e.target.value)} rows={3} />
                        <input value={draftTags} onChange={(e) => setDraftTags(e.target.value)} placeholder="标签" />
                        <div className="mcp-card-actions">
                          <button className="secondary-button" onClick={handleSaveEdit} type="button">
                            保存
                          </button>
                          <button className="secondary-button" onClick={() => setEditingId(null)} type="button">
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="memory-entry-header">
                          <strong>{entry.title}</strong>
                          <div className="memory-entry-actions">
                            <button
                              className="icon-button"
                              onClick={() => onUpdateEntry(entry.id, { pinned: !entry.pinned })}
                              title={entry.pinned ? "取消置顶" : "置顶"}
                              type="button"
                            >
                              <Pin size={13} />
                            </button>
                            <button
                              className="icon-button"
                              onClick={() => handleStartEdit(entry)}
                              title="编辑"
                              type="button"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              className="icon-button"
                              onClick={() => onDeleteEntry(entry.id)}
                              title="删除"
                              type="button"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        <p className="memory-entry-content">{entry.content}</p>
                        <div className="memory-entry-footer">
                          <div className="memory-tag-row">
                            {entry.tags.map((tag) => (
                              <span className="memory-tag" key={tag}>
                                <Tag size={10} />
                                {tag}
                              </span>
                            ))}
                          </div>
                          <small>
                            {entry.source ?? "手动"} · {new Date(entry.updatedAt).toLocaleDateString("zh-CN")}
                          </small>
                        </div>
                      </>
                    )}
                  </article>
                ))
              )}
            </div>
          ) : (
            <div className="memory-entry-list">
              {filteredSummaries.length === 0 ? (
                <EmptyState title="暂无摘要" detail="会话结束后会自动生成摘要。" />
              ) : (
                filteredSummaries.map((summary) => (
                  <article className="memory-entry-card" key={summary.id}>
                    <div className="memory-entry-header">
                      <strong>{summary.title}</strong>
                      <small>{new Date(summary.createdAt).toLocaleDateString("zh-CN")}</small>
                    </div>
                    <p className="memory-entry-content">{summary.summary}</p>
                    <div className="memory-entry-footer">
                      <span className="memory-summary-meta">
                        {summary.messageCount} 条消息 · {formatDuration(summary.durationMs)}
                        {summary.agentId ? ` · ${summary.agentId}` : ""}
                      </span>
                    </div>
                  </article>
                ))
              )}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function AgentsHubView({
  activeAgent,
  agents,
  engines,
  teams,
  onActivate,
  onCreate,
  onEdit,
  onOpenSettings
}: {
  activeAgent: AgentProfile | null;
  agents: AgentProfile[];
  engines: AgentEngineSettings[];
  teams: AgentTeam[];
  onActivate: (agentId: string) => void;
  onCreate: () => void;
  onEdit: (agentId: string) => void;
  onOpenSettings: () => void;
}) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(activeAgent?.id ?? agents[0]?.id ?? null);
  const [agentViewTab, setAgentViewTab] = useState<"agents" | "teams">("agents");

  useEffect(() => {
    if (!selectedAgentId || !agents.some((agent) => agent.id === selectedAgentId)) {
      setSelectedAgentId(activeAgent?.id ?? agents[0]?.id ?? null);
    }
  }, [activeAgent, agents, selectedAgentId]);

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? activeAgent ?? agents[0];
  const selectedEngine = selectedAgent ? engines.find((engine) => engine.id === selectedAgent.engineId) : undefined;
  const enabledAgents = agents.filter((agent) => agent.enabled);
  const runningAgents = agents.filter((agent) => agent.status === "running");

  return (
    <section className="workspace module-workspace agent-workspace">
      <ModuleHeader
        eyebrow="Agents"
        title="我的 Agent"
        detail="助手、团队和运行引擎集中到独立页面。"
        actionLabel="新建 Agent"
        onAction={onCreate}
      />
      <div className="agent-team-layout">
        <section className="panel-block agent-team-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Team</p>
              <h3>团队管理</h3>
            </div>
            <Users size={18} />
          </div>
          <div className="agent-team-stats">
            <span>
              <b>{agents.length}</b>总 Agent
            </span>
            <span>
              <b>{enabledAgents.length}</b>已启用
            </span>
            <span>
              <b>{runningAgents.length}</b>运行中
            </span>
          </div>

          <div className="marketplace-tabs">
            <button
              className={agentViewTab === "agents" ? "marketplace-tab active" : "marketplace-tab"}
              onClick={() => setAgentViewTab("agents")}
              type="button"
            >
              Agent
            </button>
            <button
              className={agentViewTab === "teams" ? "marketplace-tab active" : "marketplace-tab"}
              onClick={() => setAgentViewTab("teams")}
              type="button"
            >
              团队
            </button>
          </div>

          {agentViewTab === "agents" ? (
            <div className="agent-team-list">
              {agents.length === 0 ? (
                <EmptyState title="暂无 Agent" detail="新建 Agent 后会显示在团队列表中。" />
              ) : (
                agents.map((agent) => {
                  const engine = engines.find((item) => item.id === agent.engineId);
                  return (
                    <button
                      className={selectedAgent?.id === agent.id ? "agent-team-row active" : "agent-team-row"}
                      key={agent.id}
                      onClick={() => setSelectedAgentId(agent.id)}
                      type="button"
                    >
                      <span className="agent-mini-avatar">{agent.name.slice(0, 1)}</span>
                      <span>
                        <strong>{agent.name}</strong>
                        <small>
                          {engine?.name ?? "NexaDesk Built-in"} · {agent.enabled ? "启用" : "停用"}
                        </small>
                      </span>
                      {activeAgent?.id === agent.id ? <b>当前</b> : null}
                    </button>
                  );
                })
              )}
            </div>
          ) : (
            <div className="team-grid">
              {teams.map((team) => (
                <article className="team-card" key={team.id}>
                  <span className="team-emoji">{team.emoji}</span>
                  <strong>{team.name}</strong>
                  <small>{team.description}</small>
                  <span className="team-member-count">
                    {team.agentIds.length} 个成员 · {team.workflow}
                  </span>
                </article>
              ))}
              <article
                className="team-card"
                style={{
                  borderStyle: "dashed",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  minHeight: 100
                }}
              >
                <span style={{ fontSize: 24 }}>+</span>
                <small>新建团队</small>
              </article>
            </div>
          )}
        </section>

        <section className="panel-block agent-detail-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Agent Detail</p>
              <h3>{selectedAgent?.name ?? "选择一个 Agent"}</h3>
            </div>
            <span className={selectedAgent?.enabled ? "status ready" : "status muted-status"}>
              {selectedAgent?.enabled ? "启用" : "停用"}
            </span>
          </div>

          {selectedAgent ? (
            <div className="agent-detail-body">
              <div className="agent-detail-hero">
                <span className="agent-large-avatar">{selectedAgent.name.slice(0, 1)}</span>
                <div>
                  <p className="eyebrow">{agentCategoryLabel(selectedAgent.category)}</p>
                  <h3>{selectedAgent.name}</h3>
                  <p>{selectedAgent.description}</p>
                </div>
              </div>

              <div className="agent-detail-grid">
                <article>
                  <p className="eyebrow">状态</p>
                  <strong>{selectedAgent.status}</strong>
                  <span>{activeAgent?.id === selectedAgent.id ? "当前工作台 Agent" : "可切换到当前工作台"}</span>
                </article>
                <article>
                  <p className="eyebrow">Provider</p>
                  <strong>{selectedAgent.providerId}</strong>
                  <span>模型中心配置会决定真实调用来源。</span>
                </article>
                <article>
                  <p className="eyebrow">技能</p>
                  <strong>{selectedAgent.skills.length}</strong>
                  <span>{selectedAgent.skills.slice(0, 3).join(" / ") || "未绑定技能"}</span>
                </article>
                <article>
                  <p className="eyebrow">MCP 工具</p>
                  <strong>{selectedAgent.mcpToolIds.length}</strong>
                  <span>{selectedAgent.mcpToolIds.length ? "已绑定工具权限" : "未绑定工具"}</span>
                </article>
              </div>

              <section className="agent-instruction-card">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">System Prompt</p>
                    <h3>系统提示词</h3>
                  </div>
                  <FileText size={17} />
                </div>
                <p>{selectedAgent.instructions}</p>
              </section>

              <section className="agent-engine-card">
                <div>
                  <p className="eyebrow">Runtime Engine</p>
                  <h3>{selectedEngine?.name ?? "NexaDesk Built-in"}</h3>
                  <span>{selectedEngine?.description ?? "使用内置模型中心和审批策略运行。"}</span>
                </div>
                <div className="agent-engine-meta">
                  <span>
                    Kind <b>{selectedEngine?.kind ?? "builtin"}</b>
                  </span>
                  <span>
                    权限 <b>{enginePermissionLabel(selectedEngine?.permissionMode)}</b>
                  </span>
                  <span>
                    配置 <b>{engineSourceLabel(selectedEngine?.configSource)}</b>
                  </span>
                  <span>
                    状态 <b>{engineSetupLabel(selectedEngine?.setupStatus)}</b>
                  </span>
                </div>
              </section>

              <div className="agent-detail-actions">
                <button className="secondary-button" onClick={() => onEdit(selectedAgent.id)} type="button">
                  编辑 Agent
                </button>
                <button className="primary-button" onClick={() => onActivate(selectedAgent.id)} type="button">
                  {activeAgent?.id === selectedAgent.id ? "当前 Agent" : "切换到工作台"}
                </button>
                <button className="secondary-button" onClick={onOpenSettings} type="button">
                  打开完整助手设置
                </button>
              </div>
            </div>
          ) : (
            <EmptyState title="未选择 Agent" detail="从左侧团队列表选择一个 Agent。" />
          )}
        </section>

        <section className="panel-block agent-engine-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Engines</p>
              <h3>运行引擎配置</h3>
            </div>
            <Terminal size={18} />
          </div>
          <div className="agent-engine-list">
            {engines.map((engine) => {
              const linkedAgents = agents.filter((agent) => agent.engineId === engine.id);
              return (
                <article
                  className={selectedEngine?.id === engine.id ? "agent-engine-row active" : "agent-engine-row"}
                  key={engine.id}
                >
                  <div>
                    <strong>{engine.name}</strong>
                    <span>{engine.description}</span>
                  </div>
                  <div className="agent-engine-row-footer">
                    <small>
                      {engine.kind} · {engineSetupLabel(engine.setupStatus)}
                    </small>
                    <b>{linkedAgents.length} Agent</b>
                  </div>
                  <div className="agent-engine-capabilities">
                    {engine.capabilities.slice(0, 5).map((capability) => (
                      <span key={capability}>{capability}</span>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}

function agentCategoryLabel(category: AgentProfile["category"]) {
  const labels: Record<AgentProfile["category"], string> = {
    cowork: "Cowork",
    code: "代码助手",
    office: "Office 助手",
    file: "文件助手",
    report: "报告助手",
    custom: "自定义助手"
  };
  return labels[category];
}

function enginePermissionLabel(mode?: AgentEngineSettings["permissionMode"]) {
  const labels: Record<AgentEngineSettings["permissionMode"], string> = {
    ask: "询问",
    auto: "自动",
    conservative: "保守",
    bypass: "绕过"
  };
  return mode ? labels[mode] : "询问";
}

function engineSourceLabel(source?: AgentEngineSettings["configSource"]) {
  const labels: Record<AgentEngineSettings["configSource"], string> = {
    nexadesk_model: "模型中心",
    local_cli: "本机 CLI"
  };
  return source ? labels[source] : "模型中心";
}

function engineSetupLabel(status?: AgentEngineSettings["setupStatus"]) {
  const labels: Record<AgentEngineSettings["setupStatus"], string> = {
    ready: "可用",
    needs_setup: "待配置",
    not_installed: "未安装"
  };
  return status ? labels[status] : "可用";
}

function ModuleHeader({
  actionLabel,
  detail,
  eyebrow,
  title,
  onAction
}: {
  actionLabel?: string;
  detail: string;
  eyebrow: string;
  title: string;
  onAction?: () => void;
}) {
  return (
    <header className="module-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      {actionLabel && onAction ? (
        <button className="secondary-button" onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : null}
    </header>
  );
}

function SettingsCenter({
  initialTab,
  settings,
  status,
  onSave
}: {
  initialTab: SettingsTab;
  settings: AppSettings;
  status: string | null;
  onSave: (settings: AppSettings, providerSecrets?: ProviderSecretUpdate[]) => Promise<AppSettings>;
}) {
  const [draft, setDraft] = useState(settings);
  const [localStatus, setLocalStatus] = useState<string | null>(status);
  const [desktopStatus, setDesktopStatus] = useState<DesktopStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [detectingEngines, setDetectingEngines] = useState(false);
  const [engineDetections, setEngineDetections] = useState<AgentEngineDetectionRecord[]>([]);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    setLocalStatus(status);
  }, [status]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    let cancelled = false;
    fetchDesktopStatus()
      .then((nextStatus) => {
        if (!cancelled) {
          setDesktopStatus(nextStatus);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDesktopStatus(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function persist(next: AppSettings, providerSecrets: ProviderSecretUpdate[] = []): Promise<AppSettings> {
    setSaving(true);
    try {
      const saved = await onSave(next, providerSecrets);
      setDraft(saved);
      setLocalStatus("Settings saved.");
      return saved;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Failed to save settings.";
      setLocalStatus(message);
      throw reason instanceof Error ? reason : new Error(message);
    } finally {
      setSaving(false);
    }
  }

  function updateDraft(patch: Partial<AppSettings>) {
    setDraft((current) => ({
      ...current,
      ...patch
    }));
  }

  async function refreshDesktopStatus() {
    try {
      setDesktopStatus(await fetchDesktopStatus());
    } catch {
      setDesktopStatus(null);
    }
  }

  async function chooseDirectory({
    title,
    defaultPath,
    onSelect
  }: {
    title: string;
    defaultPath?: string;
    onSelect: (path: string) => void;
  }) {
    if (!window.nexadeskDesktop?.selectDirectory) {
      setLocalStatus("目录选择器只在桌面应用中可用。当前模式可以先手动填写路径。");
      return;
    }

    try {
      const selectedPath = await window.nexadeskDesktop.selectDirectory({ title, defaultPath });
      if (!selectedPath) {
        return;
      }
      onSelect(selectedPath);
      setLocalStatus(`已选择目录：${selectedPath}`);
    } catch (reason) {
      setLocalStatus(reason instanceof Error ? `目录选择失败：${reason.message}` : "目录选择失败。");
    }
  }

  async function copyDesktopDiagnostics() {
    try {
      const nextStatus = desktopStatus ?? (await fetchDesktopStatus());
      setDesktopStatus(nextStatus);
      await navigator.clipboard.writeText(formatDesktopDiagnostics(nextStatus));
      setCopyStatus("诊断信息已复制。");
    } catch (reason) {
      setCopyStatus(reason instanceof Error ? `复制失败：${reason.message}` : "复制失败。");
    }
  }

  const selectedRuntimeProvider =
    draft.providers.find((provider) => provider.id === draft.model.activeProviderId) ?? draft.providers[0];
  const runtimeModels = Array.from(
    new Set([draft.model.activeModel, ...(selectedRuntimeProvider?.models ?? [])])
  ).filter(Boolean);
  const canPickDirectory = Boolean(window.nexadeskDesktop?.selectDirectory);
  const activeSettingsTab = settingsTabs.find((tab) => tab.id === activeTab) ?? settingsTabs[0];

  function updateAgent(agentId: string, patch: Partial<AgentProfile>) {
    updateDraft({
      assistant: {
        ...draft.assistant,
        agents: draft.assistant.agents.map((agent) => (agent.id === agentId ? { ...agent, ...patch } : agent))
      }
    });
  }

  function updateEngine(engineId: string, patch: Partial<AgentEngineSettings>) {
    updateDraft({
      assistant: {
        ...draft.assistant,
        engines: draft.assistant.engines.map((engine) => (engine.id === engineId ? { ...engine, ...patch } : engine))
      }
    });
  }

  async function handleDetectAgentEngines() {
    setDetectingEngines(true);
    setLocalStatus(null);
    try {
      const result = await detectAgentEngines();
      setEngineDetections(result.detections);
      setDraft((current) => ({
        ...current,
        assistant: {
          ...current.assistant,
          engines: result.engines
        }
      }));
      const installed = result.detections.filter((detection) => detection.installed).length;
      setLocalStatus(`Agent 引擎检测完成：${installed}/${result.detections.length} 个可用。`);
    } catch (reason) {
      setLocalStatus(reason instanceof Error ? `Agent 引擎检测失败：${reason.message}` : "Agent 引擎检测失败。");
    } finally {
      setDetectingEngines(false);
    }
  }

  function updateSkill(skillId: string, patch: Partial<SkillProfile>) {
    updateDraft({
      assistant: {
        ...draft.assistant,
        skills: draft.assistant.skills.map((skill) => (skill.id === skillId ? { ...skill, ...patch } : skill))
      }
    });
  }

  function addCustomSkill() {
    const id = `custom-skill-${crypto.randomUUID().slice(0, 8)}`;
    updateDraft({
      assistant: {
        ...draft.assistant,
        skills: [
          ...draft.assistant.skills,
          {
            id,
            name: "自定义技能",
            description: "描述这个技能适合在什么场景使用。",
            enabled: true,
            source: "custom",
            instructions: "Define when to use this skill, what it should output, and any safety rules."
          }
        ]
      }
    });
  }

  return (
    <section className="workspace settings-workspace" id="settings">
      <div className="settings-shell">
        <aside className="settings-rail">
          <div className="settings-rail-head">
            <p className="eyebrow">设置</p>
            <h2>NexaDesk</h2>
            <span>模型、助手、工具和桌面诊断</span>
          </div>
          <nav className="settings-nav" aria-label="Settings sections">
            {settingsTabGroups.map((group) => (
              <div className="settings-nav-group" key={group.title}>
                <span>{group.title}</span>
                {group.tabs.map((tabId) => {
                  const tab = settingsTabs.find((item) => item.id === tabId);
                  if (!tab) {
                    return null;
                  }
                  return (
                    <button
                      className={activeTab === tab.id ? "settings-nav-button active" : "settings-nav-button"}
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      type="button"
                    >
                      <strong>{tab.label}</strong>
                      <small>{tab.detail}</small>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="settings-rail-foot">
            <span>{draft.providers.filter((provider) => provider.connected).length} 个模型服务</span>
            <span>{draft.assistant.agents.filter((agent) => agent.enabled).length} 个启用助手</span>
          </div>
        </aside>

        <section className="settings-main">
          <header className="settings-main-header">
            <div>
              <p className="eyebrow">{activeSettingsTab?.label ?? "设置中心"}</p>
              <h2>{activeSettingsTab?.label ?? "应用设置"}</h2>
              <p>{activeSettingsTab?.detail ?? "管理 NexaDesk 配置。"}</p>
            </div>
            <div className="settings-main-actions">
              {localStatus ? <span className="settings-status-pill">{localStatus}</span> : null}
              <button
                className="primary-button"
                disabled={saving}
                onClick={() => void persist(draft).catch(() => undefined)}
                type="button"
              >
                {saving ? "保存中..." : "保存更改"}
              </button>
            </div>
          </header>

          <div className="settings-detail">
            {activeTab === "providers" ? (
              <ProviderConfigPanel
                settings={draft}
                providers={draft.providers}
                onSaveSettings={(next, providerSecrets = []) => {
                  setDraft(next);
                  return persist(next, providerSecrets);
                }}
                onSaveProvider={(provider, providerSecrets = []) => {
                  const exists = draft.providers.some((item) => item.id === provider.id);
                  const next = {
                    ...draft,
                    providers: exists
                      ? draft.providers.map((item) => (item.id === provider.id ? provider : item))
                      : [...draft.providers, provider],
                    model:
                      draft.model.activeProviderId === provider.id || !draft.model.activeProviderId
                        ? {
                            activeProviderId: provider.id,
                            activeModel: provider.defaultModel || provider.models[0] || ""
                          }
                        : draft.model
                  };
                  setDraft(next);
                  return persist(next, providerSecrets);
                }}
              />
            ) : null}

            {activeTab === "model" ? (
              <section className="panel-block settings-section">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">模型中心</p>
                    <h3>工作台默认模型</h3>
                  </div>
                  <Zap size={18} />
                </div>
                <div className="settings-form">
                  <label className="field-label">
                    <span>默认 Provider</span>
                    <select
                      value={selectedRuntimeProvider?.id ?? ""}
                      onChange={(event) => {
                        const provider = draft.providers.find((item) => item.id === event.target.value);
                        updateDraft({
                          model: {
                            activeProviderId: event.target.value,
                            activeModel: provider?.defaultModel || provider?.models[0] || ""
                          }
                        });
                      }}
                    >
                      {draft.providers.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.connected ? "启用" : "停用"} - {provider.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    <span>默认模型</span>
                    <select
                      value={draft.model.activeModel}
                      onChange={(event) =>
                        updateDraft({
                          model: { ...draft.model, activeModel: event.target.value }
                        })
                      }
                    >
                      {runtimeModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="secret-note">
                    工作台会优先使用这里选择的 Provider 和模型。切换后保存，下一条消息就会真实调用该模型。
                  </p>
                </div>
              </section>
            ) : null}

            {activeTab === "engines" ? (
              <section className="panel-block settings-section engine-settings">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">Agent Engine Center</p>
                    <h3>外部 Agent 引擎</h3>
                  </div>
                  <button
                    className="mini-button"
                    disabled={detectingEngines}
                    onClick={() => void handleDetectAgentEngines()}
                    type="button"
                  >
                    {detectingEngines ? "检测中..." : "检测本机引擎"}
                  </button>
                </div>
                <div className="settings-form">
                  <p className="secret-note">
                    这里把模型 Provider 和 Agent 执行器拆开管理：Provider 负责 API/模型，Agent 引擎负责本机
                    CLI、运行时、权限模式和后续启动检测。
                  </p>
                  <div className="collapse-list">
                    {draft.assistant.engines.map((engine) => {
                      const detection = engineDetections.find((item) => item.engineId === engine.id);
                      return (
                        <details
                          className={engine.enabled ? "config-disclosure enabled" : "config-disclosure"}
                          key={engine.id}
                        >
                          <summary>
                            <span className="summary-main">
                              <strong>{engine.name}</strong>
                              <small>
                                {engine.kind.toUpperCase()} ·{" "}
                                {engine.setupStatus === "ready"
                                  ? "可用"
                                  : engine.setupStatus === "needs_setup"
                                    ? "待配置"
                                    : "未安装"}{" "}
                                · {engine.description}
                              </small>
                            </span>
                            <label className="connection-toggle" onClick={(event) => event.stopPropagation()}>
                              <input
                                checked={engine.enabled}
                                onChange={(event) =>
                                  updateEngine(engine.id, {
                                    enabled: event.target.checked,
                                    setupStatus:
                                      event.target.checked && !engine.installed ? "needs_setup" : engine.setupStatus
                                  })
                                }
                                type="checkbox"
                              />
                              <span>{engine.enabled ? "启用" : "停用"}</span>
                            </label>
                          </summary>
                          <div className="disclosure-body">
                            <div className="engine-status-row">
                              <span className={engine.installed ? "status ready" : "status muted-status"}>
                                {engine.installed ? "已检测" : "未检测"}
                              </span>
                              <span className="runtime-pill">
                                {engine.configSource === "local_cli" ? "读取本机 CLI 配置" : "使用 NexaDesk 模型中心"}
                              </span>
                              {detection?.version ? <span className="runtime-pill">{detection.version}</span> : null}
                            </div>
                            {detection ? (
                              <div className="engine-detection-card">
                                <strong>{detection.message}</strong>
                                {detection.resolvedPath ? <span>命令路径：{detection.resolvedPath}</span> : null}
                                {detection.configPath ? <span>配置路径：{detection.configPath}</span> : null}
                                <small>检测时间：{formatTime(detection.checkedAt)}</small>
                              </div>
                            ) : null}
                            <div className="field-grid">
                              <label className="field-label">
                                <span>配置来源</span>
                                <select
                                  value={engine.configSource}
                                  onChange={(event) =>
                                    updateEngine(engine.id, {
                                      configSource: event.target.value as AgentEngineSettings["configSource"]
                                    })
                                  }
                                >
                                  <option value="nexadesk_model">NexaDesk 模型中心</option>
                                  <option value="local_cli">本机 CLI 配置</option>
                                </select>
                              </label>
                              <label className="field-label">
                                <span>权限模式</span>
                                <select
                                  value={engine.permissionMode}
                                  onChange={(event) =>
                                    updateEngine(engine.id, {
                                      permissionMode: event.target.value as AgentEngineSettings["permissionMode"]
                                    })
                                  }
                                >
                                  <option value="ask">进入审批队列</option>
                                  <option value="conservative">保守模式</option>
                                  <option value="auto">自动模式</option>
                                  <option value="bypass">外部引擎自行处理</option>
                                </select>
                              </label>
                            </div>
                            <div className="field-grid">
                              <label className="field-label">
                                <span>CLI 命令</span>
                                <input
                                  disabled={engine.kind === "builtin"}
                                  value={engine.command ?? ""}
                                  onChange={(event) => updateEngine(engine.id, { command: event.target.value })}
                                  placeholder="例如 codex、claude、qwen"
                                />
                              </label>
                              <label className="field-label">
                                <span>配置文件路径</span>
                                <input
                                  value={engine.configPath ?? ""}
                                  onChange={(event) => updateEngine(engine.id, { configPath: event.target.value })}
                                  placeholder="后续可自动检测本机 CLI 配置"
                                />
                              </label>
                            </div>
                            <div className="field-grid">
                              <label className="field-label">
                                <span>绑定 Provider</span>
                                <select
                                  value={engine.providerId ?? ""}
                                  onChange={(event) =>
                                    updateEngine(engine.id, { providerId: event.target.value || undefined })
                                  }
                                >
                                  <option value="">跟随默认模型</option>
                                  {draft.providers.map((provider) => (
                                    <option key={provider.id} value={provider.id}>
                                      {provider.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="field-label">
                                <span>绑定模型</span>
                                <input
                                  value={engine.model ?? ""}
                                  onChange={(event) => updateEngine(engine.id, { model: event.target.value })}
                                  placeholder="为空则跟随 Provider 默认模型"
                                />
                              </label>
                            </div>
                            <div className="engine-capability-row">
                              {engine.capabilities.map((capability) => (
                                <span key={capability}>{capability}</span>
                              ))}
                            </div>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </div>
              </section>
            ) : null}

            {activeTab === "assistants" ? (
              <section className="panel-block settings-section assistant-settings">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">助手系统</p>
                    <h3>内置助手</h3>
                  </div>
                  <Bot size={18} />
                </div>
                <div className="settings-form">
                  <div className="collapse-list">
                    {draft.assistant.agents.map((agent) => (
                      <details
                        className={agent.enabled ? "config-disclosure enabled" : "config-disclosure"}
                        key={agent.id}
                      >
                        <summary>
                          <span className="summary-main">
                            <strong>{agent.name}</strong>
                            <small>
                              {agent.category} · {agent.description}
                            </small>
                          </span>
                          <label className="connection-toggle" onClick={(event) => event.stopPropagation()}>
                            <input
                              checked={agent.enabled}
                              onChange={(event) => updateAgent(agent.id, { enabled: event.target.checked })}
                              type="checkbox"
                            />
                            <span>{agent.enabled ? "启用" : "停用"}</span>
                          </label>
                        </summary>
                        <div className="disclosure-body">
                          <label className="field-label">
                            <span>绑定 Agent 引擎</span>
                            <select
                              value={agent.engineId ?? "nexadesk_builtin"}
                              onChange={(event) =>
                                updateAgent(agent.id, { engineId: event.target.value as AgentProfile["engineId"] })
                              }
                            >
                              {draft.assistant.engines.map((engine) => (
                                <option key={engine.id} value={engine.id}>
                                  {engine.enabled ? "启用" : "停用"} - {engine.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field-label">
                            <span>绑定 Provider</span>
                            <select
                              value={agent.providerId}
                              onChange={(event) => updateAgent(agent.id, { providerId: event.target.value })}
                            >
                              {draft.providers.map((provider) => (
                                <option key={provider.id} value={provider.id}>
                                  {provider.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field-label">
                            <span>系统提示词</span>
                            <textarea
                              rows={4}
                              value={agent.instructions}
                              onChange={(event) => updateAgent(agent.id, { instructions: event.target.value })}
                            />
                          </label>
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            {activeTab === "skills" ? (
              <section className="panel-block settings-section skill-settings">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">技能系统</p>
                    <h3>启用、禁用与自定义技能</h3>
                  </div>
                  <button className="mini-button" onClick={addCustomSkill} type="button">
                    新建技能
                  </button>
                </div>
                <div className="settings-form">
                  <div className="collapse-list">
                    {draft.assistant.skills.map((skill) => (
                      <details
                        className={skill.enabled ? "config-disclosure enabled" : "config-disclosure"}
                        key={skill.id}
                      >
                        <summary>
                          <span className="summary-main">
                            <strong>{skill.name}</strong>
                            <small>
                              {skill.source === "custom" ? "自定义" : "内置"} · {skill.description}
                            </small>
                          </span>
                          <label className="connection-toggle" onClick={(event) => event.stopPropagation()}>
                            <input
                              checked={skill.enabled}
                              onChange={(event) => updateSkill(skill.id, { enabled: event.target.checked })}
                              type="checkbox"
                            />
                            <span>{skill.enabled ? "启用" : "停用"}</span>
                          </label>
                        </summary>
                        <div className="disclosure-body">
                          <label className="field-label">
                            <span>技能名称</span>
                            <input
                              disabled={skill.source !== "custom"}
                              value={skill.name}
                              onChange={(event) => updateSkill(skill.id, { name: event.target.value })}
                            />
                          </label>
                          <label className="field-label">
                            <span>适用场景</span>
                            <input
                              value={skill.description}
                              onChange={(event) => updateSkill(skill.id, { description: event.target.value })}
                            />
                          </label>
                          <label className="field-label">
                            <span>技能提示词</span>
                            <textarea
                              rows={4}
                              value={skill.instructions}
                              onChange={(event) => updateSkill(skill.id, { instructions: event.target.value })}
                            />
                          </label>
                        </div>
                      </details>
                    ))}
                  </div>
                  <p className="secret-note">
                    助手只会加载自己绑定且已启用的技能。自定义技能会随设置保存，后续可以扩展成本地技能包或插件。
                  </p>
                </div>
              </section>
            ) : null}

            {activeTab === "appearance" ? (
              <section className="panel-block settings-section">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">界面</p>
                    <h3>外观与主题</h3>
                  </div>
                  <Settings size={18} />
                </div>
                <div className="settings-form">
                  <div className="field-grid">
                    <label className="field-label">
                      <span>语言</span>
                      <select value={lang} onChange={(event) => setLang(event.target.value as Lang)}>
                        <option value="zh">简体中文</option>
                        <option value="en">English</option>
                      </select>
                    </label>
                    <label className="field-label">
                      <span>界面密度</span>
                      <select
                        value={draft.appearance.density}
                        onChange={(event) =>
                          updateDraft({
                            appearance: {
                              ...draft.appearance,
                              density: event.target.value as AppSettings["appearance"]["density"]
                            }
                          })
                        }
                      >
                        <option value="comfortable">舒适</option>
                        <option value="compact">紧凑</option>
                      </select>
                    </label>
                  </div>

                  <h4
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--muted-text)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      margin: "12px 0 6px"
                    }}
                  >
                    主题模式
                  </h4>
                  <div className="theme-mode-row">
                    {(["light", "dark", "system"] as const).map((m) => (
                      <button
                        className={themeMode === m ? "theme-mode-btn active" : "theme-mode-btn"}
                        key={m}
                        onClick={() => setThemeMode(m)}
                        type="button"
                      >
                        {m === "light" ? "☀️ 浅色" : m === "dark" ? "🌙 深色" : "💻 跟随系统"}
                      </button>
                    ))}
                  </div>

                  <h4
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--muted-text)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      margin: "12px 0 6px"
                    }}
                  >
                    主题配色
                  </h4>
                  <div className="theme-gallery">
                    {THEMES.filter(
                      (t) => themeMode === "system" || t.appearance === themeMode || themeMode === themeMode
                    ).map((theme) => (
                      <button
                        className={themeId === theme.id ? "theme-swatch active" : "theme-swatch"}
                        key={theme.id}
                        onClick={() => setThemeId(theme.id)}
                        type="button"
                        title={theme.description}
                      >
                        <div className="theme-preview-strip">
                          {theme.preview.map((color, i) => (
                            <span key={i} style={{ background: color }} />
                          ))}
                        </div>
                        <small>{theme.name}</small>
                      </button>
                    ))}
                  </div>

                  <div className="field-grid" style={{ marginTop: 12 }}>
                    <label className="field-label">
                      <span>字体预设</span>
                      <select
                        value={
                          fontOptions.includes(draft.appearance.fontFamily) ? draft.appearance.fontFamily : "Custom"
                        }
                        onChange={(event) => {
                          if (event.target.value !== "Custom") {
                            updateDraft({ appearance: { ...draft.appearance, fontFamily: event.target.value } });
                          }
                        }}
                      >
                        {fontOptions.map((font) => (
                          <option key={font} value={font}>
                            {font === "Custom" ? "Custom" : font}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label">
                      <span>字号</span>
                      <input
                        min={12}
                        max={20}
                        type="number"
                        value={draft.appearance.fontSize}
                        onChange={(event) =>
                          updateDraft({ appearance: { ...draft.appearance, fontSize: Number(event.target.value) } })
                        }
                      />
                    </label>
                  </div>
                </div>
              </section>
            ) : null}

            {activeTab === "workspace" ? (
              <section className="panel-block settings-section">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">工作区</p>
                    <h3>文件与导出</h3>
                  </div>
                  <Folder size={18} />
                </div>
                <div className="settings-form">
                  <label className="field-label">
                    <span>默认工作区</span>
                    <div className="directory-field">
                      <input
                        value={draft.workspace.defaultWorkspace}
                        onChange={(event) =>
                          updateDraft({ workspace: { ...draft.workspace, defaultWorkspace: event.target.value } })
                        }
                      />
                      <button
                        className="mini-button"
                        disabled={!canPickDirectory}
                        onClick={() =>
                          void chooseDirectory({
                            title: "选择默认工作区",
                            defaultPath: draft.workspace.defaultWorkspace,
                            onSelect: (path) =>
                              updateDraft({
                                workspace: {
                                  ...draft.workspace,
                                  defaultWorkspace: path,
                                  allowedRoots: uniquePathList([...draft.workspace.allowedRoots, path])
                                }
                              })
                          })
                        }
                        type="button"
                      >
                        选择目录
                      </button>
                    </div>
                  </label>
                  <label className="field-label">
                    <span>导出目录</span>
                    <div className="directory-field">
                      <input
                        value={draft.workspace.exportDirectory}
                        onChange={(event) =>
                          updateDraft({ workspace: { ...draft.workspace, exportDirectory: event.target.value } })
                        }
                      />
                      <button
                        className="mini-button"
                        disabled={!canPickDirectory}
                        onClick={() =>
                          void chooseDirectory({
                            title: "选择导出目录",
                            defaultPath: draft.workspace.exportDirectory || draft.workspace.defaultWorkspace,
                            onSelect: (path) =>
                              updateDraft({
                                workspace: {
                                  ...draft.workspace,
                                  exportDirectory: path,
                                  allowedRoots: uniquePathList([...draft.workspace.allowedRoots, path])
                                }
                              })
                          })
                        }
                        type="button"
                      >
                        选择目录
                      </button>
                    </div>
                  </label>
                  <label className="field-label">
                    <span>允许访问的根目录</span>
                    <textarea
                      rows={3}
                      value={draft.workspace.allowedRoots.join("\n")}
                      onChange={(event) =>
                        updateDraft({
                          workspace: {
                            ...draft.workspace,
                            allowedRoots: event.target.value
                              .split("\n")
                              .map((item) => item.trim())
                              .filter(Boolean)
                          }
                        })
                      }
                    />
                  </label>
                  <div className="config-actions">
                    <button
                      className="secondary-button"
                      disabled={!canPickDirectory}
                      onClick={() =>
                        void chooseDirectory({
                          title: "添加允许访问的根目录",
                          defaultPath: draft.workspace.defaultWorkspace,
                          onSelect: (path) =>
                            updateDraft({
                              workspace: {
                                ...draft.workspace,
                                allowedRoots: uniquePathList([...draft.workspace.allowedRoots, path])
                              }
                            })
                        })
                      }
                      type="button"
                    >
                      添加允许目录
                    </button>
                    <span className="secret-note">
                      目录选择仅在桌面应用中启用。Agent 的读写工具会被限制在允许访问的根目录内。
                    </span>
                  </div>
                </div>
              </section>
            ) : null}

            {activeTab === "permissions" ? (
              <section className="panel-block settings-section">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">权限</p>
                    <h3>安全策略</h3>
                  </div>
                  <ShieldCheck size={18} />
                </div>
                <div className="settings-form">
                  {(["shell", "fileWrite", "network", "browser", "mcp", "automation"] as const).map((key) => (
                    <label className="field-label policy-row" key={key}>
                      <span>{policyLabel(key)}</span>
                      <select
                        value={draft.permissions[key]}
                        onChange={(event) =>
                          updateDraft({
                            permissions: {
                              ...draft.permissions,
                              [key]: event.target.value as AppSettings["permissions"][typeof key]
                            }
                          })
                        }
                      >
                        <option value="ask">每次询问</option>
                        <option value="allow">允许</option>
                        <option value="deny">拒绝</option>
                      </select>
                    </label>
                  ))}
                  <label className="connection-toggle">
                    <input
                      checked={draft.permissions.autoApproveLowRisk}
                      onChange={(event) =>
                        updateDraft({
                          permissions: { ...draft.permissions, autoApproveLowRisk: event.target.checked }
                        })
                      }
                      type="checkbox"
                    />
                    <span>自动批准低风险操作</span>
                  </label>
                </div>
              </section>
            ) : null}

            {activeTab === "memory" ? (
              <section className="panel-block settings-section">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">Memory</p>
                    <h3>记忆管理</h3>
                  </div>
                  <FileText size={18} />
                </div>
                <div className="settings-form">
                  {(["projectMemory", "conversationMemory", "longTermMemory"] as const).map((key) => (
                    <label className="connection-toggle" key={key}>
                      <input
                        checked={draft.memory[key]}
                        onChange={(event) =>
                          updateDraft({
                            memory: { ...draft.memory, [key]: event.target.checked }
                          })
                        }
                        type="checkbox"
                      />
                      <span>{memorySettingLabel(key)}</span>
                    </label>
                  ))}
                  <label className="field-label">
                    <span>记忆保留天数</span>
                    <input
                      min={1}
                      max={365}
                      type="number"
                      value={draft.memory.retentionDays}
                      onChange={(event) =>
                        updateDraft({
                          memory: { ...draft.memory, retentionDays: Number(event.target.value) }
                        })
                      }
                    />
                  </label>
                  <label className="field-label">
                    <span>记忆规则备注</span>
                    <textarea
                      rows={4}
                      value={draft.memory.notes}
                      onChange={(event) =>
                        updateDraft({
                          memory: { ...draft.memory, notes: event.target.value }
                        })
                      }
                    />
                  </label>
                  <p className="secret-note">
                    这里先保存记忆策略配置；后续可接项目记忆索引、会话摘要和长期记忆审查页。
                  </p>
                </div>
              </section>
            ) : null}

            {activeTab === "im" ? <IMSettingsPanel onClose={() => {}} /> : null}

            {activeTab === "email" ? <EmailConfigPanel onClose={() => {}} /> : null}

            {activeTab === "shortcuts" ? (
              <section className="panel-block settings-section">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">Keyboard</p>
                    <h3>快捷键</h3>
                  </div>
                  <KeyRound size={18} />
                </div>
                <div className="settings-form">
                  {(
                    ["sendMessage", "commandPalette", "newTask", "openSettings", "toggleWorkspaceContext"] as const
                  ).map((key) => (
                    <label className="field-label shortcut-row" key={key}>
                      <span>{shortcutSettingLabel(key)}</span>
                      <input
                        value={draft.shortcuts[key]}
                        onChange={(event) =>
                          updateDraft({
                            shortcuts: { ...draft.shortcuts, [key]: event.target.value }
                          })
                        }
                      />
                    </label>
                  ))}
                  <p className="secret-note">
                    快捷键配置已进入设置体系；真正的全局快捷键注册会在桌面快捷键模块里继续接入。
                  </p>
                </div>
              </section>
            ) : null}

            {activeTab === "about" ? (
              <section className="panel-block settings-section">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">About</p>
                    <h3>关于 NexaDesk</h3>
                  </div>
                  <Workflow size={18} />
                </div>
                <div className="settings-form">
                  <div className="diagnostics-grid">
                    <DiagnosticRow label="版本" value={desktopStatus?.version ?? "0.1.0"} />
                    <DiagnosticRow label="发布通道" value={draft.about.releaseChannel} />
                    <DiagnosticRow label="许可证" value={draft.about.license} />
                    <DiagnosticRow label="仓库" value={draft.about.repositoryUrl} />
                    <DiagnosticRow
                      label="运行模式"
                      value={desktopStatus?.mode === "desktop" ? "桌面应用" : "Web 开发"}
                    />
                    <DiagnosticRow label="数据目录" value={desktopStatus?.dataDir ?? "Not set"} />
                  </div>
                  <div className="field-grid">
                    <label className="field-label">
                      <span>发布通道</span>
                      <select
                        value={draft.about.releaseChannel}
                        onChange={(event) =>
                          updateDraft({
                            about: {
                              ...draft.about,
                              releaseChannel: event.target.value as AppSettings["about"]["releaseChannel"]
                            }
                          })
                        }
                      >
                        <option value="stable">Stable</option>
                        <option value="beta">Beta</option>
                        <option value="dev">Dev</option>
                      </select>
                    </label>
                    <label className="connection-toggle">
                      <input
                        checked={draft.about.checkUpdates}
                        onChange={(event) =>
                          updateDraft({
                            about: { ...draft.about, checkUpdates: event.target.checked }
                          })
                        }
                        type="checkbox"
                      />
                      <span>允许检查更新</span>
                    </label>
                  </div>
                  <label className="field-label">
                    <span>仓库地址</span>
                    <input
                      value={draft.about.repositoryUrl}
                      onChange={(event) =>
                        updateDraft({
                          about: { ...draft.about, repositoryUrl: event.target.value }
                        })
                      }
                    />
                  </label>
                  <label className="field-label">
                    <span>许可证说明</span>
                    <input
                      value={draft.about.license}
                      onChange={(event) =>
                        updateDraft({
                          about: { ...draft.about, license: event.target.value }
                        })
                      }
                    />
                  </label>
                </div>
              </section>
            ) : null}

            {activeTab === "desktop" ? (
              <section className="panel-block settings-section">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">桌面应用</p>
                    <h3>安装包与诊断</h3>
                  </div>
                  <Workflow size={18} />
                </div>
                <div className="settings-form">
                  {(["launchAtStartup", "autoUpdate", "telemetry"] as const).map((key) => (
                    <label className="connection-toggle" key={key}>
                      <input
                        checked={draft.app[key]}
                        onChange={(event) => updateDraft({ app: { ...draft.app, [key]: event.target.checked } })}
                        type="checkbox"
                      />
                      <span>{appSettingLabel(key)}</span>
                    </label>
                  ))}
                  <label className="field-label">
                    <span>日志级别</span>
                    <select
                      value={draft.app.logLevel}
                      onChange={(event) =>
                        updateDraft({
                          app: { ...draft.app, logLevel: event.target.value as AppSettings["app"]["logLevel"] }
                        })
                      }
                    >
                      <option value="debug">Debug</option>
                      <option value="info">Info</option>
                      <option value="warn">Warn</option>
                      <option value="error">Error</option>
                    </select>
                  </label>
                  <details className="diagnostics-box">
                    <summary>
                      <span>桌面诊断</span>
                      <span className="diagnostics-actions">
                        <button
                          className="mini-button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void refreshDesktopStatus();
                          }}
                          type="button"
                        >
                          刷新
                        </button>
                        <button
                          className="mini-button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void copyDesktopDiagnostics();
                          }}
                          type="button"
                        >
                          复制诊断
                        </button>
                      </span>
                    </summary>
                    {desktopStatus ? (
                      <div className="diagnostics-grid">
                        <DiagnosticRow
                          label="运行模式"
                          value={desktopStatus.mode === "desktop" ? "桌面应用" : "Web 开发"}
                        />
                        <DiagnosticRow label="Version" value={desktopStatus.version} />
                        <DiagnosticRow label="API" value={desktopStatus.apiBase} />
                        <DiagnosticRow label="Data directory" value={desktopStatus.dataDir ?? "Not set"} />
                        <DiagnosticRow label="Settings file" value={desktopStatus.settingsPath ?? "Not set"} />
                        <DiagnosticRow label="Secrets file" value={desktopStatus.secretsPath ?? "Not set"} />
                        <DiagnosticRow label="Runtime state" value={desktopStatus.runtimeStatePath ?? "Not set"} />
                        <DiagnosticRow
                          label="Secret protection"
                          value={desktopStatus.secretsEncrypted ? "Encrypted" : "Not encrypted"}
                        />
                        <DiagnosticRow label="System secure storage" value={desktopStatus.safeStorage} />
                        <DiagnosticRow label="Log file" value={desktopStatus.logPath ?? "Not set"} />
                        <DiagnosticRow label="Crash log" value={desktopStatus.crashLogPath ?? "Not set"} />
                        <DiagnosticRow label="Platform" value={`${desktopStatus.platform} / ${desktopStatus.arch}`} />
                        <DiagnosticRow label="Uptime" value={`${desktopStatus.uptimeSeconds}s`} />
                        {copyStatus ? <p className="secret-note">{copyStatus}</p> : null}
                      </div>
                    ) : (
                      <p className="secret-note">桌面诊断暂不可用。请确认本地 API 已启动。</p>
                    )}
                  </details>
                </div>
              </section>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}

function DiagnosticRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="diagnostic-row">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}

function formatDesktopDiagnostics(status: DesktopStatus) {
  return [
    `App: ${status.appName} ${status.version}`,
    `Mode: ${status.mode}`,
    `API: ${status.apiBase}`,
    `Data directory: ${status.dataDir ?? "Not set"}`,
    `Settings file: ${status.settingsPath ?? "Not set"}`,
    `Secrets file: ${status.secretsPath ?? "Not set"}`,
    `Runtime state: ${status.runtimeStatePath ?? "Not set"}`,
    `Secrets encrypted: ${status.secretsEncrypted ? "yes" : "no"}`,
    `System secure storage: ${status.safeStorage}`,
    `Log file: ${status.logPath ?? "Not set"}`,
    `Crash log: ${status.crashLogPath ?? "Not set"}`,
    `Platform: ${status.platform} / ${status.arch}`,
    `Node: ${status.nodeVersion}`,
    `Electron: ${status.electronVersion ?? "Not set"}`,
    `Uptime: ${status.uptimeSeconds}s`
  ].join("\n");
}

function uniquePathList(paths: string[]) {
  return Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)));
}

function createLocalApprovalHistory(
  approval: PermissionRequest,
  decision: ApprovalHistoryEntry["decision"],
  reason?: string
): ApprovalHistoryEntry {
  return {
    ...approval,
    decision,
    resolvedAt: new Date().toISOString(),
    reason: reason?.trim() || undefined
  };
}

function ProviderStatusPanel({
  providers,
  onOpenSettings
}: {
  providers: ProviderSettings[];
  onOpenSettings: () => void;
}) {
  return (
    <section className="panel-block" id="providers">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">模型层</p>
          <h3>当前模型服务</h3>
        </div>
        <button className="icon-button" onClick={onOpenSettings} type="button" aria-label="Open settings">
          <Settings size={16} />
        </button>
      </div>
      <div className="provider-list">
        {providers.map((provider) => (
          <article className="provider-row" key={provider.id}>
            <div>
              <strong>{provider.name}</strong>
              <span>{provider.defaultModel || provider.models.slice(0, 2).join(" / ")}</span>
            </div>
            <span className={provider.connected ? "status ready" : "status muted-status"}>
              {provider.connected ? "启用" : "停用"}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProviderConfigPanel({
  settings,
  providers,
  onSaveSettings,
  onSaveProvider
}: {
  settings: AppSettings;
  providers: ProviderSettings[];
  onSaveSettings?: (
    settings: AppSettings,
    providerSecrets?: ProviderSecretUpdate[]
  ) => Promise<AppSettings> | AppSettings;
  onSaveProvider?: (provider: ProviderSettings, providerSecrets?: ProviderSecretUpdate[]) => Promise<unknown> | unknown;
}) {
  const [selectedProviderId, setSelectedProviderId] = useState(providers[0]?.id ?? "");
  const [drafts, setDrafts] = useState<Record<string, ProviderDraft>>({});
  const [savedProviderId, setSavedProviderId] = useState<string | null>(null);
  const [testProviderId, setTestProviderId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, ProviderTestResult>>({});
  const [refreshProviderId, setRefreshProviderId] = useState<string | null>(null);
  const [modelRefreshResults, setModelRefreshResults] = useState<Record<string, ProviderModelsResult>>({});
  const [savingProviderId, setSavingProviderId] = useState<string | null>(null);
  const [providerNotice, setProviderNotice] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDrafts((current) => {
      const next = { ...current };
      for (const provider of providers) {
        if (!next[provider.id]) {
          next[provider.id] = createProviderDraft(provider);
        }
      }
      return next;
    });
  }, [providers]);

  useEffect(() => {
    if (!providers.some((provider) => provider.id === selectedProviderId)) {
      setSelectedProviderId(providers[0]?.id ?? "");
    }
  }, [providers, selectedProviderId]);

  useEffect(() => {
    setTestResults(settings.providerStatus.tests);
    setModelRefreshResults(settings.providerStatus.modelRefreshes);
  }, [settings.providerStatus]);

  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId);
  const selectedDraft =
    drafts[selectedProviderId] ??
    (selectedProvider
      ? createProviderDraft(selectedProvider)
      : providers[0]
        ? createProviderDraft(providers[0])
        : null);
  const models = selectedDraft ? parseModels(selectedDraft.modelsText) : [];
  const canDeleteSelectedProvider = selectedDraft ? !defaultProviderIds.has(selectedDraft.id) : false;
  const selectedTestResult = selectedDraft ? testResults[selectedDraft.id] : undefined;
  const selectedRefreshResult = selectedDraft ? modelRefreshResults[selectedDraft.id] : undefined;
  const matrixRows = domesticProviderMatrix.map((item) => {
    const provider = providers.find((candidate) => candidate.id === item.id);
    const draft = drafts[item.id] ?? (provider ? createProviderDraft(provider) : null);
    return {
      item,
      provider,
      draft,
      result: testResults[item.id],
      summary: inspectProviderMatrixItem(item, draft)
    };
  });
  const alignedMatrixCount = matrixRows.filter((row) => row.summary.status === "ok").length;
  const testedMatrixCount = matrixRows.filter((row) => Boolean(row.result)).length;
  const enabledProviderCount = providers.filter((provider) => provider.connected).length;
  const savedKeyCount = providers.filter((provider) => provider.apiKeyConfigured).length;
  const totalModelCount = providers.reduce((count, provider) => count + provider.models.length, 0);
  const matrixIssueCount = matrixRows.filter((row) => row.summary.status !== "ok").length;

  function updateSelected(patch: Partial<ProviderDraft>) {
    if (!selectedDraft) {
      return;
    }
    setDrafts((current) => ({
      ...current,
      [selectedDraft.id]: {
        ...selectedDraft,
        ...patch
      }
    }));
    setSavedProviderId(null);
    setTestProviderId(null);
    setProviderNotice(null);
  }

  function updateCapability(capability: ProviderCapability, enabled: boolean) {
    if (!selectedDraft) {
      return;
    }
    updateSelected({
      capabilities: {
        ...selectedDraft.capabilities,
        [capability]: enabled
      }
    });
  }

  async function handleSaveProvider() {
    if (!selectedDraft) {
      return;
    }

    setSavingProviderId(selectedDraft.id);
    try {
      const secretUpdates: ProviderSecretUpdate[] = selectedDraft.apiKey.trim()
        ? [{ providerId: selectedDraft.id, apiKey: selectedDraft.apiKey.trim() }]
        : [];
      const provider = providerDraftToSettings(selectedDraft);
      await onSaveProvider?.(provider, secretUpdates);
      setDrafts((current) => ({
        ...current,
        [selectedDraft.id]: {
          ...selectedDraft,
          apiKey: "",
          apiKeyConfigured: provider.apiKeyConfigured || secretUpdates.length > 0
        }
      }));
      setSavedProviderId(selectedDraft.id);
      setProviderNotice("Provider 已保存。");
    } finally {
      setSavingProviderId(null);
    }
  }

  async function handleAddCustomProvider() {
    const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
    const provider: ProviderSettings = {
      id,
      name: "自定义模型服务",
      kind: "openai_compatible",
      apiMode: "chat_completions",
      connected: false,
      baseUrl: "https://your-api.example.com/v1",
      models: ["model-name"],
      defaultModel: "model-name",
      apiKeyConfigured: false,
      capabilities: ["streaming", "function_calling", "structured_output"]
    };
    setDrafts((current) => ({
      ...current,
      [id]: createProviderDraft(provider)
    }));
    setSelectedProviderId(id);
    await onSaveProvider?.(provider, []);
    setProviderNotice("已新增自定义 Provider。");
  }

  async function handleCopyProvider() {
    if (!selectedDraft) {
      return;
    }
    const id = `custom-copy-${crypto.randomUUID().slice(0, 8)}`;
    const provider: ProviderSettings = {
      ...providerDraftToSettings(selectedDraft),
      id,
      name: `${selectedDraft.name} Copy`,
      connected: false,
      apiKeyConfigured: false
    };
    setDrafts((current) => ({
      ...current,
      [id]: createProviderDraft(provider)
    }));
    setSelectedProviderId(id);
    await onSaveProvider?.(provider, []);
    setProviderNotice("已复制为新的自定义 Provider，API Key 不会被复制。");
  }

  async function handleClearApiKey() {
    if (!selectedDraft) {
      return;
    }
    setSavingProviderId(selectedDraft.id);
    try {
      const provider = {
        ...providerDraftToSettings(selectedDraft),
        apiKeyConfigured: false
      };
      await onSaveProvider?.(provider, [{ providerId: selectedDraft.id, clearApiKey: true }]);
      setDrafts((current) => ({
        ...current,
        [selectedDraft.id]: {
          ...selectedDraft,
          apiKey: "",
          apiKeyConfigured: false
        }
      }));
      setSavedProviderId(selectedDraft.id);
      setProviderNotice("API Key 已清除。");
    } finally {
      setSavingProviderId(null);
    }
  }

  async function handleDeleteProvider() {
    if (!selectedDraft || !onSaveSettings) {
      return;
    }
    if (!canDeleteSelectedProvider) {
      setProviderNotice("内置 Provider 不能删除，可以停用或复制后自定义。");
      return;
    }
    const confirmed = window.confirm(`删除 Provider「${selectedDraft.name}」？这会同时清除它保存的 API Key。`);
    if (!confirmed) {
      return;
    }

    const remainingProviders = settings.providers.filter((provider) => provider.id !== selectedDraft.id);
    const fallbackProvider = remainingProviders.find((provider) => provider.connected) ?? remainingProviders[0];
    const nextSettings: AppSettings = {
      ...settings,
      providers: remainingProviders,
      providerStatus: pruneProviderStatus(
        settings.providerStatus,
        remainingProviders.map((provider) => provider.id)
      ),
      model:
        settings.model.activeProviderId === selectedDraft.id
          ? {
              activeProviderId: fallbackProvider?.id ?? "",
              activeModel: fallbackProvider?.defaultModel || fallbackProvider?.models[0] || ""
            }
          : settings.model,
      assistant: {
        ...settings.assistant,
        agents: settings.assistant.agents.map((agent) =>
          agent.providerId === selectedDraft.id ? { ...agent, providerId: fallbackProvider?.id ?? "" } : agent
        )
      }
    };

    setSavingProviderId(selectedDraft.id);
    try {
      await onSaveSettings(nextSettings, [{ providerId: selectedDraft.id, clearApiKey: true }]);
      setDrafts((current) => {
        const next = { ...current };
        delete next[selectedDraft.id];
        return next;
      });
      setSelectedProviderId(fallbackProvider?.id ?? remainingProviders[0]?.id ?? "");
      setProviderNotice("Provider 已删除，关联 API Key 已清除。");
    } finally {
      setSavingProviderId(null);
    }
  }

  function handleExportSettings() {
    const exported: AppSettings = {
      ...settings,
      providers: settings.providers.map((provider) => ({
        ...provider,
        apiKeyConfigured: false
      })),
      updatedAt: new Date().toISOString()
    };
    const blob = new Blob([`${JSON.stringify(exported, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nexadesk-settings-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setProviderNotice("已导出配置。导出文件不包含 API Key。");
  }

  async function handleImportSettings(file: File | undefined) {
    if (!file || !onSaveSettings) {
      return;
    }
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const imported = sanitizeImportedSettings(parsed, settings);
      const confirmed = window.confirm("导入配置会覆盖当前设置，但不会导入 API Key。继续吗？");
      if (!confirmed) {
        return;
      }
      const saved = await onSaveSettings(imported, []);
      setDrafts(
        saved.providers.reduce<Record<string, ProviderDraft>>((record, provider) => {
          record[provider.id] = createProviderDraft(provider);
          return record;
        }, {})
      );
      setSelectedProviderId(saved.model.activeProviderId || saved.providers[0]?.id || "");
      setProviderNotice("配置已导入。请重新填写需要的 API Key。");
    } catch (reason) {
      setProviderNotice(reason instanceof Error ? `导入失败：${reason.message}` : "导入失败。");
    } finally {
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  }

  async function handleTestProvider() {
    if (!selectedDraft) {
      return;
    }
    setTestProviderId(selectedDraft.id);
    try {
      const result = await testProvider({
        provider: providerDraftToSettings(selectedDraft),
        apiKey: selectedDraft.apiKey.trim() || undefined,
        timeoutMs: 8000
      });
      setTestResults((current) => ({ ...current, [selectedDraft.id]: result }));
      void persistProviderStatus(
        buildProviderStatus(settings.providerStatus, testResults, modelRefreshResults, {
          test: [selectedDraft.id, resultToProviderStatusRecord(result)]
        })
      );
    } catch (reason) {
      const failedResult: ProviderTestResult = {
        ok: false,
        checkedAt: new Date().toISOString(),
        message: reason instanceof Error ? reason.message : "测试失败"
      };
      setTestResults((current) => ({
        ...current,
        [selectedDraft.id]: failedResult
      }));
      void persistProviderStatus(
        buildProviderStatus(settings.providerStatus, testResults, modelRefreshResults, {
          test: [selectedDraft.id, resultToProviderStatusRecord(failedResult)]
        })
      );
    } finally {
      setTestProviderId(null);
    }
  }

  async function handleRefreshModels() {
    if (!selectedDraft) {
      return;
    }
    setRefreshProviderId(selectedDraft.id);
    try {
      const result = await fetchProviderModels({
        provider: providerDraftToSettings(selectedDraft),
        apiKey: selectedDraft.apiKey.trim() || undefined,
        timeoutMs: 10000
      });
      setModelRefreshResults((current) => ({ ...current, [selectedDraft.id]: result }));
      void persistProviderStatus(
        buildProviderStatus(settings.providerStatus, testResults, modelRefreshResults, {
          modelRefresh: [selectedDraft.id, resultToProviderModelsStatusRecord(result)]
        })
      );
      if (!result.ok) {
        setProviderNotice(`刷新模型失败：${result.message}`);
        return;
      }
      if (!result.models.length) {
        setProviderNotice("Provider 已响应，但没有返回可识别的模型名。");
        return;
      }

      setDrafts((current) => {
        const currentDraft = current[selectedDraft.id] ?? selectedDraft;
        const uniqueModels = Array.from(new Set(result.models));
        const currentDefaultModel = currentDraft.defaultModel.trim();
        const defaultModel = uniqueModels.includes(currentDefaultModel)
          ? currentDefaultModel
          : (uniqueModels[0] ?? currentDefaultModel);
        return {
          ...current,
          [selectedDraft.id]: {
            ...currentDraft,
            modelsText: uniqueModels.join("\n"),
            defaultModel
          }
        };
      });
      setSavedProviderId(null);
      setProviderNotice(`已刷新 ${result.models.length} 个模型，请确认后点击"保存"。`);
    } catch (reason) {
      const failedResult: ProviderModelsResult = {
        ok: false,
        checkedAt: new Date().toISOString(),
        models: [],
        message: reason instanceof Error ? reason.message : "刷新模型失败"
      };
      setModelRefreshResults((current) => ({
        ...current,
        [selectedDraft.id]: failedResult
      }));
      void persistProviderStatus(
        buildProviderStatus(settings.providerStatus, testResults, modelRefreshResults, {
          modelRefresh: [selectedDraft.id, resultToProviderModelsStatusRecord(failedResult)]
        })
      );
      setProviderNotice(reason instanceof Error ? `刷新模型失败：${reason.message}` : "刷新模型失败。");
    } finally {
      setRefreshProviderId(null);
    }
  }

  if (!selectedDraft) {
    return null;
  }

  async function persistProviderStatus(providerStatus: ProviderStatusSettings) {
    if (!onSaveSettings) {
      return;
    }
    try {
      await onSaveSettings({ ...settings, providerStatus }, []);
    } catch (reason) {
      setProviderNotice(reason instanceof Error ? `状态保存失败：${reason.message}` : "状态保存失败。");
    }
  }

  return (
    <section className="panel-block provider-config-panel" id="providers">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">模型中心</p>
          <h3>大模型 API 配置</h3>
        </div>
        <KeyRound size={18} />
      </div>

      <div className="provider-config">
        <div className="config-toolbar">
          <span>内置预设 + 自定义第三方接口</span>
          <div className="toolbar-actions">
            <button className="mini-button" onClick={handleAddCustomProvider} type="button">
              新增自定义
            </button>
            <button className="mini-button" onClick={handleExportSettings} type="button">
              导出配置
            </button>
            <button className="mini-button" onClick={() => importInputRef.current?.click()} type="button">
              导入配置
            </button>
            <input
              ref={importInputRef}
              accept="application/json,.json"
              hidden
              onChange={(event) => void handleImportSettings(event.target.files?.[0])}
              type="file"
            />
          </div>
        </div>

        <div className="provider-overview-grid">
          <article>
            <span>启用服务</span>
            <strong>{enabledProviderCount}</strong>
            <small>共 {providers.length} 个 Provider</small>
          </article>
          <article>
            <span>已保存 Key</span>
            <strong>{savedKeyCount}</strong>
            <small>Key 仍在安全存储中</small>
          </article>
          <article>
            <span>模型条目</span>
            <strong>{totalModelCount}</strong>
            <small>可刷新 /models 更新</small>
          </article>
          <article>
            <span>国内矩阵</span>
            <strong>
              {alignedMatrixCount}/{domesticProviderMatrix.length}
            </strong>
            <small>{matrixIssueCount ? `${matrixIssueCount} 项需检查` : "默认配置已对齐"}</small>
          </article>
        </div>

        <div className="provider-workbench">
          <aside className="provider-workbench-side">
            <section className="provider-side-section">
              <div className="provider-side-heading">
                <strong>Provider 列表</strong>
                <small>点击切换当前编辑对象</small>
              </div>
              <div className="provider-picker" aria-label="Provider list">
                {providers.map((provider) => {
                  const draft = drafts[provider.id] ?? createProviderDraft(provider);
                  return (
                    <button
                      className={
                        provider.id === selectedDraft.id ? "provider-picker-card active" : "provider-picker-card"
                      }
                      key={provider.id}
                      onClick={() => setSelectedProviderId(provider.id)}
                      type="button"
                    >
                      <span className={draft.connected ? "agent-status running" : "agent-status"} />
                      <strong>{draft.name}</strong>
                      <small>{draft.apiMode}</small>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="provider-side-section">
              <div className="provider-side-heading">
                <strong>国内 Provider 实测矩阵</strong>
                <small>
                  {alignedMatrixCount}/{domesticProviderMatrix.length} 个已对齐 · {testedMatrixCount} 个有测试记录
                </small>
              </div>
              <div className="provider-matrix-list">
                {matrixRows.map((row) => (
                  <button
                    className={row.item.id === selectedDraft.id ? "provider-matrix-row active" : "provider-matrix-row"}
                    key={row.item.id}
                    onClick={() => {
                      if (row.provider) {
                        setSelectedProviderId(row.item.id);
                        setProviderNotice(null);
                      } else {
                        setProviderNotice(`${row.item.label} 预设不存在，请先恢复默认 Provider。`);
                      }
                    }}
                    title={`官方文档：${row.item.officialUrl}`}
                    type="button"
                  >
                    <span className={`matrix-status-dot ${row.summary.status}`} />
                    <span className="matrix-main">
                      <strong>{row.item.label}</strong>
                      <small>{row.item.baseUrl}</small>
                    </span>
                    <span className="matrix-badges">
                      <span className={`matrix-badge ${row.summary.status}`}>{row.summary.label}</span>
                      <span className={`matrix-badge ${providerTestTone(row.result)}`}>
                        {providerTestLabel(row.result)}
                      </span>
                    </span>
                    <span className="matrix-meta">
                      {row.summary.issues.length
                        ? row.summary.issues.slice(0, 2).join("；")
                        : `Key env: ${row.item.envKey}`}
                    </span>
                  </button>
                ))}
              </div>
              <p className="secret-note compact">矩阵检查默认配置；真实可用性仍以测试连接和刷新模型结果为准。</p>
            </section>
          </aside>

          <div className="provider-editor">
            <div className="provider-editor-header">
              <div>
                <p className="eyebrow">当前 Provider</p>
                <h4>{selectedDraft.name}</h4>
                <small>{selectedDraft.baseUrl || "Base URL 未设置"}</small>
              </div>
              <span className={selectedDraft.connected ? "status ready" : "status muted-status"}>
                {selectedDraft.connected ? "启用" : "停用"}
              </span>
            </div>

            <details className="config-disclosure" open>
              <summary>
                <span className="summary-main">
                  <strong>连接与模型</strong>
                  <small>名称、接口类型、Base URL、默认模型和模型列表</small>
                </span>
              </summary>
              <div className="disclosure-body">
                <div className="field-grid">
                  <label className="field-label">
                    <span>供应商名称</span>
                    <input
                      value={selectedDraft.name}
                      onChange={(event) => updateSelected({ name: event.target.value })}
                      placeholder="OpenAI Official"
                    />
                  </label>

                  <label className="field-label">
                    <span>接口类型</span>
                    <select
                      value={selectedDraft.apiMode}
                      onChange={(event) => updateSelected({ apiMode: event.target.value as ProviderApiMode })}
                    >
                      {apiModeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="field-label">
                  <span>Base URL</span>
                  <input
                    value={selectedDraft.baseUrl}
                    onChange={(event) => updateSelected({ baseUrl: event.target.value })}
                    placeholder="https://api.openai.com/v1"
                  />
                </label>

                <div className="field-grid">
                  <label className="field-label">
                    <span>默认模型</span>
                    <input
                      value={selectedDraft.defaultModel}
                      onChange={(event) => updateSelected({ defaultModel: event.target.value })}
                      placeholder="gpt-5"
                    />
                  </label>
                  <label className="field-label">
                    <span>运行状态</span>
                    <select
                      value={selectedDraft.connected ? "enabled" : "disabled"}
                      onChange={(event) => updateSelected({ connected: event.target.value === "enabled" })}
                    >
                      <option value="enabled">启用</option>
                      <option value="disabled">停用</option>
                    </select>
                  </label>
                </div>

                <label className="field-label">
                  <span>模型列表（每行一个，也支持逗号分隔）</span>
                  <textarea
                    value={selectedDraft.modelsText}
                    onChange={(event) => updateSelected({ modelsText: event.target.value })}
                    placeholder={"gpt-5\nqwen-plus\ndeepseek-chat"}
                    rows={4}
                  />
                </label>
              </div>
            </details>

            <details className="config-disclosure" open>
              <summary>
                <span className="summary-main">
                  <strong>API Key 与操作</strong>
                  <small>测试连接、保存、复制、清除 Key 或删除自定义 Provider</small>
                </span>
              </summary>
              <div className="disclosure-body">
                <label className="field-label">
                  <span>API Key</span>
                  <input
                    autoComplete="off"
                    value={selectedDraft.apiKey}
                    onChange={(event) => updateSelected({ apiKey: event.target.value })}
                    placeholder={
                      selectedDraft.apiKeyConfigured ? "已配置。输入新 Key 可替换。" : "只保存到后端/桌面安全存储"
                    }
                    type="password"
                  />
                </label>

                <div className="config-actions">
                  <button
                    className="secondary-button"
                    disabled={testProviderId === selectedDraft.id}
                    onClick={handleTestProvider}
                    type="button"
                  >
                    {testProviderId === selectedDraft.id ? "测试中..." : "测试连接"}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={refreshProviderId === selectedDraft.id}
                    onClick={handleRefreshModels}
                    type="button"
                  >
                    {refreshProviderId === selectedDraft.id ? "刷新中..." : "刷新模型"}
                  </button>
                  <button className="secondary-button" onClick={handleCopyProvider} type="button">
                    复制
                  </button>
                  <button
                    className="secondary-button"
                    disabled={
                      savingProviderId === selectedDraft.id ||
                      (!selectedDraft.apiKeyConfigured && !selectedDraft.apiKey.trim())
                    }
                    onClick={handleClearApiKey}
                    type="button"
                  >
                    清除 Key
                  </button>
                  <button
                    className="secondary-button danger-button"
                    disabled={savingProviderId === selectedDraft.id || !canDeleteSelectedProvider}
                    onClick={handleDeleteProvider}
                    title={canDeleteSelectedProvider ? "删除这个自定义 Provider" : "内置 Provider 不能删除"}
                    type="button"
                  >
                    删除
                  </button>
                  <button
                    className="primary-button"
                    disabled={savingProviderId === selectedDraft.id}
                    onClick={handleSaveProvider}
                    type="button"
                  >
                    {savingProviderId === selectedDraft.id ? "保存中..." : "保存"}
                  </button>
                </div>
                <p className="secret-note">
                  {providerNotice ??
                    renderProviderNote(selectedDraft, savedProviderId, selectedTestResult, selectedRefreshResult)}
                </p>
              </div>
            </details>

            <details className="config-disclosure">
              <summary>
                <span className="summary-main">
                  <strong>能力开关</strong>
                  <small>Streaming、Tool calling、Vision、Search 和结构化输出</small>
                </span>
              </summary>
              <div className="disclosure-body">
                <div className="capability-grid">
                  {capabilityOptions.map((option) => (
                    <label className="capability-toggle" key={option.value}>
                      <input
                        checked={selectedDraft.capabilities[option.value]}
                        onChange={(event) => updateCapability(option.value, event.target.checked)}
                        type="checkbox"
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.hint}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </details>

            <details className="config-disclosure">
              <summary>
                <span className="summary-main">
                  <strong>预览与状态</strong>
                  <small>
                    {models.length} 个模型 · {selectedDraft.apiKeyConfigured ? "Key 已保存" : "Key 未保存"}
                  </small>
                </span>
              </summary>
              <div className="disclosure-body">
                <div className="provider-check-summary">
                  <ProviderCheckLine label="最近测试" result={selectedTestResult} emptyText="还没有测试连接记录" />
                  <ProviderCheckLine label="最近刷新" result={selectedRefreshResult} emptyText="还没有刷新模型记录" />
                </div>
                <div className="model-chips">
                  {models.map((model) => (
                    <span className="model-chip" key={model}>
                      {model}
                    </span>
                  ))}
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}

function createProviderDraft(provider: ModelProvider | ProviderSettings): ProviderDraft {
  const providerSettings = provider as Partial<ProviderSettings>;
  return {
    id: provider.id,
    name: provider.name,
    kind: provider.kind,
    connected: provider.connected,
    baseUrl: provider.baseUrl ?? "",
    apiMode: provider.apiMode,
    apiKey: "",
    modelsText: provider.models.join("\n"),
    defaultModel: providerSettings.defaultModel ?? provider.models[0] ?? "",
    apiKeyConfigured: providerSettings.apiKeyConfigured ?? false,
    capabilities: createCapabilityRecord(provider.capabilities)
  };
}

function ProviderCheckLine({
  label,
  result,
  emptyText
}: {
  label: string;
  result: ProviderTestResult | ProviderModelsResult | undefined;
  emptyText: string;
}) {
  if (!result) {
    return (
      <div className="provider-check-line">
        <span>{label}</span>
        <strong>未记录</strong>
        <small>{emptyText}</small>
      </div>
    );
  }

  const modelCount = "models" in result ? result.models.length : undefined;
  return (
    <div className={result.ok ? "provider-check-line ok" : "provider-check-line fail"}>
      <span>{label}</span>
      <strong>{result.ok ? "通过" : "失败"}</strong>
      <small>
        {formatProviderCheckTime(result.checkedAt)}
        {typeof result.status === "number" ? ` · HTTP ${result.status}` : ""}
        {typeof modelCount === "number" ? ` · ${modelCount} 个模型` : ""}
        {result.checkedUrl ? ` · ${result.checkedUrl}` : ""}
      </small>
    </div>
  );
}

function providerDraftToSettings(draft: ProviderDraft): ProviderSettings {
  const models = parseModels(draft.modelsText);
  return {
    id: draft.id,
    name: draft.name.trim() || draft.id,
    kind: draft.kind,
    connected: draft.connected,
    baseUrl: draft.baseUrl.trim() || undefined,
    apiMode: draft.apiMode,
    models,
    defaultModel: draft.defaultModel.trim() || (models[0] ?? ""),
    apiKeyConfigured: draft.apiKeyConfigured || Boolean(draft.apiKey.trim()),
    capabilities: capabilityOptions.filter((option) => draft.capabilities[option.value]).map((option) => option.value)
  };
}

function buildProviderStatus(test?: ProviderTestResult, models?: ProviderModelsResult): ProviderStatusRecord {
  return {
    ok: test?.ok ?? false,
    status: test?.status,
    message: test?.message ?? "未检查",
    checkedUrl: test?.checkedAt,
    checkedAt: test?.checkedAt ?? new Date().toISOString()
  };
}

function resultToProviderModelsStatusRecord(result: ProviderModelsResult): ProviderModelsStatusRecord {
  return {
    ok: result.ok,
    status: result.status,
    message: result.message,
    checkedUrl: result.checkedAt,
    checkedAt: result.checkedAt ?? new Date().toISOString(),
    models: result.models
  };
}

function providerTestTone(result?: ProviderStatusRecord): string {
  if (!result) return "未检查";
  return result.ok ? "通过" : "失败";
}

function providerTestLabel(result?: ProviderStatusRecord): string {
  if (!result) return "未检查";
  return result.ok
    ? `通过 ${result.checkedAt ? formatProviderCheckTime(result.checkedAt) : ""}`
    : `失败: ${result.message}`;
}

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}

function formatDuration(ms?: number): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN");
  } catch {
    return iso;
  }
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${Math.floor(diff / 86400000)}天前`;
}

function runtimeStatusLabel(status: string): string {
  return status === "completed" ? "完成" : status === "failed" ? "失败" : status === "running" ? "运行中" : status;
}

function formatRuntimeEntryTps(entry: RuntimeTelemetryEntry): string {
  if (!entry.durationMs || entry.durationMs === 0) return "-";
  return `${(entry.outputTokens / (entry.durationMs / 1000)).toFixed(1)} t/s`;
}

function memorySettingLabel(key: string): string {
  const labels: Record<string, string> = {
    projectMemory: "启用项目记忆",
    conversationMemory: "启用会话记忆",
    longTermMemory: "启用长期记忆"
  };
  return labels[key] ?? key;
}

function shortcutSettingLabel(key: string): string {
  const labels: Record<string, string> = {
    sendMessage: "发送消息",
    commandPalette: "命令面板",
    newTask: "新建任务",
    openSettings: "打开设置",
    toggleWorkspaceContext: "切换工作区"
  };
  return labels[key] ?? key;
}

/* ── Missing helper functions ── */

function appSettingLabel(key: string): string {
  const map: Record<string, string> = {
    launchAtStartup: "开机启动",
    autoUpdate: "自动更新",
    telemetry: "遥测",
    logLevel: "日志级别"
  };
  return map[key] ?? key;
}

function inspectProviderMatrixItem(item: ProviderMatrixItem): string {
  return `${item.label} (${item.baseUrl})`;
}

function resultToProviderStatusRecord(result: ProviderTestResult): ProviderStatusRecord {
  return {
    ok: result.ok,
    status: result.status,
    message: result.message,
    checkedUrl: result.checkedAt,
    checkedAt: result.checkedAt ?? new Date().toISOString()
  };
}

/* ── Missing components ── */

function WindowTitleBar({ title }: { title: string }) {
  return (
    <div className="window-title-bar">
      <div />
      <span className="window-title-bar-center">{title}</span>
      <div className="window-title-bar-actions">
        <button className="window-title-bar-btn" type="button">
          -
        </button>
        <button className="window-title-bar-btn" type="button">
          []
        </button>
        <button className="window-title-bar-btn close" type="button">
          x
        </button>
      </div>
    </div>
  );
}

function PrivacyDialog({ onAccept, onReject }: { onAccept: () => void; onReject: () => void }) {
  return (
    <div className="privacy-dialog-backdrop">
      <div className="privacy-dialog">
        <h2>欢迎使用 NexaDesk</h2>
        <p>
          NexaDesk 是一款本地优先的 AI
          智能体工作台。您的对话数据默认保存在本地设备上。使用前请阅读并同意我们的服务条款和隐私政策。
        </p>
        <div className="privacy-dialog-actions">
          <button className="secondary-button" onClick={onReject} type="button">
            不同意
          </button>
          <button className="primary-button" onClick={onAccept} type="button">
            同意并继续
          </button>
        </div>
      </div>
    </div>
  );
}

function UpdateBadge({ onClick }: { onClick: () => void }) {
  return (
    <button className="update-badge" onClick={onClick} type="button">
      <span className="update-dot" />
      NexaDesk
    </button>
  );
}

function UpdateModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="privacy-dialog-backdrop" onClick={onClose}>
      <div className="privacy-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>应用更新</h2>
        <p>当前已是最新版本。</p>
        <div className="privacy-dialog-actions">
          <button className="primary-button" onClick={onClose} type="button">
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

function ActivitySidebar({ activities, onClose }: { activities: ActivityEvent[]; onClose: () => void }) {
  return (
    <aside className="activity-sidebar">
      <div className="activity-sidebar-header">
        <h4>活动流</h4>
        <button className="icon-button" onClick={onClose} type="button">
          <X size={14} />
        </button>
      </div>
      <div className="activity-list">
        {activities.map((event) => (
          <div className="activity-item" key={event.id}>
            <span className={`activity-dot ${event.level}`} />
            <span className="activity-item-title">{event.title}</span>
            <p className="activity-item-detail">{event.detail}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

function DesktopPet({ onClose }: { onClose: () => void }) {
  return (
    <div className="desktop-pet-window">
      <div className="pet-sprite">{"\u{1F916}"}</div>
    </div>
  );
}

function EngineSelectorBar({
  engines,
  activeEngineId,
  onSelect
}: {
  engines: AgentEngineSettings[];
  activeEngineId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="engine-selector-bar">
      {engines
        .filter((e) => e.enabled || e.installed)
        .map((engine) => (
          <button
            className={activeEngineId === engine.id ? "engine-chip active" : "engine-chip"}
            key={engine.id}
            onClick={() => onSelect(engine.id)}
            type="button"
          >
            <span className={`engine-chip-dot ${engine.setupStatus}`} />
            {engine.name}
          </button>
        ))}
    </div>
  );
}

const IM_PLATFORMS = [
  { id: "feishu", name: "飞书", emoji: "\u{1F426}", category: "中国" },
  { id: "dingtalk", name: "钉钉", emoji: "\u{1F48E}", category: "中国" },
  { id: "qq", name: "QQ", emoji: "\u{1F427}", category: "中国" },
  { id: "telegram", name: "Telegram", emoji: "\u{2708}\uFE0F", category: "国际" },
  { id: "discord", name: "Discord", emoji: "\u{1F3AE}", category: "国际" }
];

function IMSettingsPanel() {
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  return (
    <section className="panel-block settings-section">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">IM Integration</p>
          <h3>即时通讯集成</h3>
        </div>
        <Mail size={18} />
      </div>
      <div className="settings-form">
        <div className="im-platform-grid">
          {IM_PLATFORMS.map((platform) => (
            <article
              className={selectedPlatform === platform.id ? "im-platform-card connected" : "im-platform-card"}
              key={platform.id}
              onClick={() => setSelectedPlatform(platform.id)}
            >
              <span className="im-platform-icon">{platform.emoji}</span>
              <strong>{platform.name}</strong>
              <small>{platform.category} · 点击配置</small>
            </article>
          ))}
        </div>
        {selectedPlatform && (
          <div
            style={{
              padding: 12,
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              background: "var(--surface-soft)"
            }}
          >
            <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: "0 0 8px" }}>
              {IM_PLATFORMS.find((p) => p.id === selectedPlatform)?.name} 配置
            </h4>
            <label className="field-label">
              <span>App ID</span>
              <input placeholder="输入 App ID" />
            </label>
            <label className="field-label">
              <span>App Secret</span>
              <input type="password" placeholder="输入 App Secret" />
            </label>
            <div className="mcp-card-actions" style={{ marginTop: 8 }}>
              <button className="secondary-button" type="button">
                测试连接
              </button>
              <button className="primary-button" type="button">
                保存
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

const EMAIL_PROVIDERS = [
  { id: "gmail", name: "Gmail", imap: "imap.gmail.com:993", smtp: "smtp.gmail.com:587" },
  { id: "outlook", name: "Outlook", imap: "outlook.office365.com:993", smtp: "smtp.office365.com:587" },
  { id: "163", name: "163 邮箱", imap: "imap.163.com:993", smtp: "smtp.163.com:465" },
  { id: "qq", name: "QQ 邮箱", imap: "imap.qq.com:993", smtp: "smtp.qq.com:587" }
];

function EmailConfigPanel() {
  const [selectedProvider, setSelectedProvider] = useState("gmail");
  const provider = EMAIL_PROVIDERS.find((p) => p.id === selectedProvider) ?? EMAIL_PROVIDERS[0];
  return (
    <section className="panel-block settings-section">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Email</p>
          <h3>邮件集成</h3>
        </div>
        <Mail size={18} />
      </div>
      <div className="settings-form">
        <div className="email-provider-grid">
          {EMAIL_PROVIDERS.map((p) => (
            <button
              className={selectedProvider === p.id ? "email-provider-chip active" : "email-provider-chip"}
              key={p.id}
              onClick={() => setSelectedProvider(p.id)}
              type="button"
            >
              <strong>{p.name}</strong>
            </button>
          ))}
        </div>
        <label className="field-label">
          <span>IMAP 服务器</span>
          <input defaultValue={provider.imap} />
        </label>
        <label className="field-label">
          <span>SMTP 服务器</span>
          <input defaultValue={provider.smtp} />
        </label>
        <label className="field-label">
          <span>邮箱地址</span>
          <input placeholder="your@email.com" />
        </label>
        <label className="field-label">
          <span>密码</span>
          <input type="password" placeholder="输入密码" />
        </label>
        <div className="mcp-card-actions">
          <button className="secondary-button" type="button">
            测试连接
          </button>
          <button className="primary-button" type="button">
            保存
          </button>
        </div>
      </div>
    </section>
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <Workflow size={24} />
      <strong>Starting NexaDesk</strong>
      <span>Loading workspace snapshot...</span>
    </main>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function Metric({ hint, label, value }: { hint?: string; label: string; value: string }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function TaskCard({ task, agents }: { task: any; agents: AgentProfile[] }) {
  return (
    <div className="task-card">
      <strong>{task.name ?? task.title ?? "Task"}</strong>
      <span>{task.status ?? "pending"}</span>
    </div>
  );
}

function ApprovalCard({
  approval,
  onResolve
}: {
  approval: PermissionRequest;
  onResolve: (id: string, approved: boolean) => void;
}) {
  return (
    <div className="approval-card">
      <strong>{approval.action}</strong>
      <span>{approval.risk}</span>
      <div>
        <button onClick={() => onResolve(approval.id, true)} type="button">
          批准
        </button>
        <button onClick={() => onResolve(approval.id, false)} type="button">
          拒绝
        </button>
      </div>
    </div>
  );
}

function ApprovalHistoryCard({ entry }: { entry: ApprovalHistoryEntry }) {
  return (
    <div className="approval-history-card">
      <strong>{entry.action}</strong>
      <span>{entry.decision}</span>
    </div>
  );
}

function WorkspaceFilePanel({
  files,
  onSelect
}: {
  files: WorkspaceTreeEntry[];
  onSelect: (file: WorkspaceTreeEntry) => void;
}) {
  return (
    <div className="workspace-file-panel">
      {files.map((f) => (
        <button key={f.path} onClick={() => onSelect(f)} type="button">
          {f.name}
        </button>
      ))}
    </div>
  );
}

function ActivityItem({ event }: { event: ActivityEvent }) {
  return (
    <div className="activity-item">
      <span className="activity-item-title">{event.title}</span>
      <p className="activity-item-detail">{event.detail}</p>
    </div>
  );
}

function WorkspaceFilePreviewDrawer({
  preview,
  sending,
  onAskAgent,
  onClose
}: {
  preview: WorkspaceFilePreviewResult | null;
  sending: boolean;
  onAskAgent: () => void;
  onClose: () => void;
}) {
  if (!preview) return null;
  return (
    <div className="workspace-file-preview-drawer">
      <strong>{preview.name}</strong>
      <pre>{preview.content}</pre>
      <button onClick={onClose} type="button">
        关闭
      </button>
    </div>
  );
}

function MessageBubble({ message, agents }: { message: ChatMessage; agents: AgentProfile[] }) {
  return (
    <div className={`message-bubble ${message.role}`}>
      <strong>{message.author}</strong>
      <p>{message.content}</p>
    </div>
  );
}

function renderProviderNote(
  draft: any,
  savedId?: string,
  test?: ProviderTestResult,
  refresh?: ProviderModelsResult
): string {
  return "";
}

function createCapabilityRecord(caps?: string[]): Record<string, boolean> {
  const record: Record<string, boolean> = {};
  for (const opt of capabilityOptions) record[opt.value] = caps?.includes(opt.value) ?? false;
  return record;
}

function formatProviderCheckTime(iso?: string): string {
  if (!iso) return "未检查";
  try {
    return new Date(iso).toLocaleString("zh-CN");
  } catch {
    return iso;
  }
}

function parseModels(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function sanitizeImportedProvider(item: unknown): ProviderSettings | null {
  if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") return null;
  return {
    id: item.id,
    name: item.name,
    kind: typeof item.kind === "string" ? (item.kind as ProviderSettings["kind"]) : "openai_compatible",
    apiMode: typeof item.apiMode === "string" ? (item.apiMode as ProviderApiMode) : "chat_completions",
    connected: false,
    baseUrl: typeof item.baseUrl === "string" ? item.baseUrl : "",
    models: Array.isArray(item.models) ? item.models.filter((m: unknown) => typeof m === "string") : [],
    defaultModel: typeof item.defaultModel === "string" ? item.defaultModel : "",
    apiKeyConfigured: false,
    capabilities: (Array.isArray(item.capabilities)
      ? item.capabilities.filter((c: unknown) => typeof c === "string")
      : []) as ProviderCapability[]
  };
}

function sanitizeImportedSettings(value: unknown, fallback: AppSettings): AppSettings {
  if (!isRecord(value) || !Array.isArray(value.providers)) {
    throw new Error("文件不是 NexaDesk 设置 JSON。");
  }

  const providers = value.providers
    .map((item) => sanitizeImportedProvider(item))
    .filter((provider): provider is ProviderSettings => Boolean(provider));

  if (providers.length === 0) {
    throw new Error("导入文件里没有可用 Provider。");
  }
  const firstProvider = providers[0];
  if (!firstProvider) {
    throw new Error("导入文件里没有可用 Provider。");
  }

  const model = isRecord(value.model) ? value.model : {};
  const activeProviderId =
    typeof model.activeProviderId === "string" && providers.some((provider) => provider.id === model.activeProviderId)
      ? model.activeProviderId
      : firstProvider.id;
  const activeProvider = providers.find((provider) => provider.id === activeProviderId) ?? firstProvider;

  return {
    ...fallback,
    providers,
    model: {
      activeProviderId,
      activeModel: typeof model.activeModel === "string" ? model.activeModel : activeProvider.defaultModel
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
