import {
  Bot,
  Check,
  CircleDot,
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
  Terminal,
  Trash2,
  Users,
  Workflow,
  X,
  Zap
} from "lucide-react";
import { FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  createDefaultProviders,
  createDefaultSettings,
  createDemoSnapshot,
  type AgentEngineDetectionRecord,
  type AgentEngineSettings,
  type ActivityEvent,
  type ApprovalHistoryEntry,
  type AppSettings,
  type AgentProfile,
  type AppSnapshot,
  type ChatMessage,
  type ChatStreamEvent,
  type DesktopStatus,
  type McpServerSettings,
  type McpServerToolsResult,
  type McpServerTestResult,
  type McpToolDefinition,
  type ModelProvider,
  type PermissionRequest,
  type ProviderModelsResult,
  type ProviderApiMode,
  type ProviderCapability,
  type ProviderSecretUpdate,
  type ProviderSettings,
  type ProviderStatusSettings,
  type ProviderTestResult,
  type SkillProfile,
  type ToolCall,
  type WorkspaceFilePreviewResult,
  type WorkspaceFile,
  type WorkspaceListResult,
  type WorkspaceSearchMatch,
  type WorkspaceSearchMode,
  type WorkspaceSearchResult,
  type WorkspaceTreeEntry
} from "@nexadesk/shared";
import {
  detectAgentEngines,
  deleteSession,
  fetchDesktopStatus,
  fetchMcpServerTools,
  fetchProviderModels,
  fetchSettings as fetchAppSettings,
  fetchSnapshot,
  fetchWorkspaceFile,
  fetchWorkspaceList,
  fetchWorkspaceSearch,
  recoverSettings as recoverAppSettings,
  resolveApproval,
  saveSettings as persistAppSettings,
  streamMessage,
  subscribeActivity,
  testProvider,
  testMcpServer,
  updateSession
} from "./api";

declare global {
  interface Window {
    nexadeskDesktop?: {
      selectDirectory(options?: { title?: string; defaultPath?: string }): Promise<string | null>;
    };
  }
}

type DataMode = "live" | "demo";
type AppView = "new" | "thread" | "search" | "scheduled" | "runtime" | "skills" | "mcp" | "agents" | "settings";
type SettingsTab =
  | "providers"
  | "model"
  | "engines"
  | "assistants"
  | "skills"
  | "appearance"
  | "workspace"
  | "permissions"
  | "desktop";

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

type WorkspaceContextView = "files" | "search";

const workspaceContextCollapsedStorageKey = "nexadesk.workspaceContext.collapsed";
const workspaceContextViewStorageKey = "nexadesk.workspaceContext.view";
const workspaceRecentFilesStorageKey = "nexadesk.workspaceContext.recentFiles";
const maxWorkspaceRecentFiles = 8;

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

const settingsTabs: Array<{ id: SettingsTab; label: string; detail: string }> = [
  { id: "providers", label: "模型服务", detail: "API、Key、Base URL" },
  { id: "model", label: "默认模型", detail: "工作台模型切换" },
  { id: "engines", label: "Agent 引擎", detail: "Codex、Claude、CLI" },
  { id: "assistants", label: "内置助手", detail: "Cowork、Office、报告" },
  { id: "skills", label: "技能系统", detail: "启用、禁用、自定义" },
  { id: "appearance", label: "界面字体", detail: "主题、语言、字号" },
  { id: "workspace", label: "工作区", detail: "目录、导出、访问范围" },
  { id: "permissions", label: "权限审批", detail: "工具风险策略" },
  { id: "desktop", label: "桌面诊断", detail: "安装、日志、安全存储" }
];

const settingsTabGroups: Array<{ title: string; tabs: SettingsTab[] }> = [
  { title: "模型与运行", tabs: ["providers", "model", "engines"] },
  { title: "助手与工具", tabs: ["assistants", "skills", "permissions"] },
  { title: "应用", tabs: ["appearance", "workspace", "desktop"] }
];

const appViews = new Set<AppView>([
  "new",
  "thread",
  "search",
  "scheduled",
  "runtime",
  "skills",
  "mcp",
  "agents",
  "settings"
]);

function readInitialAppView(): AppView {
  const hash = window.location.hash.replace(/^#/, "") as AppView;
  if (hash === "settings") {
    return "new";
  }
  return appViews.has(hash) ? hash : "new";
}

function readStoredBoolean(key: string, fallback: boolean) {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

function writeStoredBoolean(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? "true" : "false");
  } catch {
    // Local storage can be unavailable in hardened browser contexts.
  }
}

function readStoredWorkspaceContextView(): WorkspaceContextView {
  if (typeof window === "undefined") {
    return "files";
  }

  try {
    const value = window.localStorage.getItem(workspaceContextViewStorageKey);
    return value === "search" ? "search" : "files";
  } catch {
    return "files";
  }
}

function writeStoredWorkspaceContextView(view: WorkspaceContextView) {
  try {
    window.localStorage.setItem(workspaceContextViewStorageKey, view);
  } catch {
    // Local storage can be unavailable in hardened browser contexts.
  }
}

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
          typeof item?.name === "string" &&
          typeof item?.path === "string" &&
          item.kind === "file"
      )
      .map((item): WorkspaceTreeEntry => ({
        name: item.name,
        path: item.path,
        kind: "file",
        size: typeof item.size === "number" ? item.size : undefined,
        modifiedAt: typeof item.modifiedAt === "string" ? item.modifiedAt : undefined
      }))
      .slice(0, maxWorkspaceRecentFiles);
  } catch {
    return [];
  }
}

function writeStoredWorkspaceRecentFiles(entries: WorkspaceTreeEntry[]) {
  try {
    window.localStorage.setItem(workspaceRecentFilesStorageKey, JSON.stringify(entries.slice(0, maxWorkspaceRecentFiles)));
  } catch {
    // Local storage can be unavailable in hardened browser contexts.
  }
}

function rememberWorkspaceFile(current: WorkspaceTreeEntry[], entry: WorkspaceTreeEntry) {
  if (entry.kind !== "file") {
    return current;
  }

  return [
    entry,
    ...current.filter((item) => item.path !== entry.path)
  ].slice(0, maxWorkspaceRecentFiles);
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
  const [threadContextOpen, setThreadContextOpen] = useState(false);
  const [recentWorkspaceFiles, setRecentWorkspaceFiles] = useState<WorkspaceTreeEntry[]>(() =>
    readStoredWorkspaceRecentFiles()
  );

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
    writeStoredWorkspaceRecentFiles(recentWorkspaceFiles);
  }, [recentWorkspaceFiles]);

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
      await streamMessage(activeSession.id, {
        content: trimmedContent,
        providerId: activeRuntimeProvider?.id,
        model: activeRuntimeModel,
        agentId: activeAgent?.id
      }, (streamEvent) => {
        if (streamEvent.type === "error") {
          setError(streamEvent.message);
        }
        setSnapshot((current) => (current ? applyChatStreamEvent(current, streamEvent) : current));
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  async function handleAskAgentToReadFile(path: string) {
    await sendWorkbenchMessage(`请使用 read_file 工具读取工作区文件 "${path}"，然后总结关键内容、可能的问题和下一步建议。`);
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
          approvalHistory: [result.history, ...current.approvalHistory.filter((item) => item.id !== result.history.id)].slice(
            0,
            100
          ),
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
    setSelectedSessionIds((current) => new Set([...current].filter((id) => sessions.some((session) => session.id === id))));
    if (!sessions.some((session) => session.id === activeSessionId)) {
      setActiveSessionId(sessions[0]?.id ?? null);
    }
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
            : result.settings.assistant.agents.find((agent) => agent.enabled)?.id ?? session.activeAgentId
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
      setSettingsStatus(
        result.warning ?? `设置已恢复，已备份 ${result.backupPaths.length} 个旧文件。`
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to recover settings");
    } finally {
      setRecoveringSettings(false);
    }
  }

  if (loading || !snapshot || !settings) {
    return <LoadingScreen />;
  }

  return (
    <main
      className={`app-shell no-context${settingsOpen ? " overlay-open" : ""}`}
    >
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
        <button className={activeView === "agents" ? "rail-button active" : "rail-button"} aria-label="Agents" onClick={() => handleOpenView("agents")} type="button">
          <Bot size={19} />
        </button>
        <button className={activeView === "search" ? "rail-button active" : "rail-button"} aria-label="Workspace" onClick={() => handleOpenView("search")} type="button">
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
              className={activeView === "new" || activeView === "thread" ? "nav-item nav-button active" : "nav-item nav-button"}
              onClick={() => handleOpenView("new")}
              type="button"
            >
              <Sparkles size={17} />
              <span>
                <strong>新建任务</strong>
                <small>开始一次协作</small>
              </span>
            </button>
            <button className={activeView === "search" ? "nav-item nav-button active" : "nav-item nav-button"} onClick={() => handleOpenView("search")} type="button">
              <Search size={17} />
              <span>
                <strong>搜索任务</strong>
                <small>会话与文件</small>
              </span>
            </button>
            <button className={activeView === "scheduled" ? "nav-item nav-button active" : "nav-item nav-button"} onClick={() => handleOpenView("scheduled")} type="button">
              <CircleDot size={17} />
              <span>
                <strong>定时任务</strong>
                <small>计划与自动化</small>
              </span>
            </button>
            <button className={activeView === "runtime" ? "nav-item nav-button active" : "nav-item nav-button"} onClick={() => handleOpenView("runtime")} type="button">
              <Zap size={17} />
              <span>
                <strong>运行监控</strong>
                <small>调用与成本</small>
              </span>
            </button>
            <button className={activeView === "skills" ? "nav-item nav-button active" : "nav-item nav-button"} onClick={() => handleOpenView("skills")} type="button">
              <Workflow size={17} />
              <span>
                <strong>技能</strong>
                <small>市场与启用</small>
              </span>
              <b>{enabledSkills.length}</b>
            </button>
            <button className={activeView === "mcp" ? "nav-item nav-button active" : "nav-item nav-button"} onClick={() => handleOpenView("mcp")} type="button">
              <Terminal size={17} />
              <span>
                <strong>MCP</strong>
                <small>工具服务器</small>
              </span>
            </button>
            <button className={activeView === "agents" ? "nav-item nav-button active" : "nav-item nav-button"} onClick={() => handleOpenView("agents")} type="button">
              <Users size={17} />
              <span>
                <strong>我的 Agent</strong>
                <small>助手与团队</small>
              </span>
              <b>{snapshot.agents.filter((agent) => agent.enabled).length}</b>
            </button>
          </nav>
        </section>

        <button className="sidebar-branch-card" onClick={() => handleOpenSettings("assistants")} type="button">
          <span className="branch-icon">main</span>
          <span>
            <strong>{activeAgent?.name ?? "Cowork 助手"}</strong>
            <small>{teamAgents.length} 个助手 · {activeRuntimeModel || "未选择模型"}</small>
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
                className={session.id === activeSession?.id && activeView === "thread" ? "session-history-card active" : "session-history-card"}
                key={session.id}
                onClick={() => (sessionBatchMode ? handleToggleSessionSelection(session.id) : handleOpenSession(session.id))}
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
                    <button className="mini-button" onClick={() => void handleConfirmRenameSession(session.id)} type="button">
                      保存
                    </button>
                  </span>
                ) : (
                  <span>
                    <strong>{session.title}</strong>
                    <small>{formatRelativeTime(session.updatedAt)} · {runtimeSettings.workspace.defaultWorkspace || session.workspace}</small>
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
          <button className="sidebar-user-button" onClick={() => handleOpenSettings("desktop")} type="button">
            <span className="sidebar-user-avatar">N</span>
            <span>
              <strong>NexaDesk</strong>
              <small>{mode === "live" ? "本地 API 已连接" : "演示模式"}</small>
            </span>
          </button>
          <button className={settingsOpen ? "sidebar-settings-button active" : "sidebar-settings-button"} onClick={() => handleOpenSettings("providers")} type="button">
            <Settings size={16} />
            设置
          </button>
        </div>
      </aside>

      <section className="main-stage">
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
            files={snapshot.files}
            recentFiles={recentWorkspaceFiles}
            sessions={snapshot.sessions}
            onNewTask={() => handleOpenView("new")}
            onOpenSession={() => handleOpenView("thread")}
            onOpenWorkspace={() => handleOpenView("thread")}
          />
        ) : activeView === "scheduled" ? (
          <ScheduledTasksView taskBoard={taskBoard} agents={snapshot.agents} />
        ) : activeView === "runtime" ? (
          <RuntimeDashboardView
            activeRuntimeModel={activeRuntimeModel}
            activeRuntimeProvider={activeRuntimeProvider}
            activeApprovals={activeApprovals}
            configuredProviders={configuredProviders}
            enabledSkills={enabledSkills.length}
            runningAgents={runningAgents.length}
            totalAgents={snapshot.agents.length}
          />
        ) : activeView === "skills" ? (
          <SkillsHubView
            skills={snapshot.skills}
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
            onCreate={() => setEditingMcpServerId("__new__")}
            onDelete={(serverId) => void handleDeleteMcpServer(serverId)}
            onEdit={(serverId) => setEditingMcpServerId(serverId)}
            onOpenSettings={() => handleOpenSettings("permissions")}
            onRefreshTools={(server) => void handleRefreshMcpTools(server)}
            onTest={(server) => void handleTestMcpServer(server)}
            onToggle={(serverId, enabled) => void handleToggleMcpServer(serverId, enabled)}
          />
        ) : (
          <AgentsHubView
            activeAgent={activeAgent}
            agents={snapshot.agents}
            engines={runtimeSettings.assistant.engines}
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
              snapshot.approvalHistory.slice(0, 6).map((history) => (
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
          agent={editingAgentId === "__new__" ? null : snapshot.agents.find((agent) => agent.id === editingAgentId) ?? null}
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
              : runtimeSettings.mcp.servers.find((server) => server.id === editingMcpServerId) ?? null
          }
          onClose={() => setEditingMcpServerId(null)}
          onSave={(server) => void handleSaveMcpServer(server)}
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
      <form className="agent-editor-modal" role="dialog" aria-modal="true" aria-label="Agent 编辑器" onMouseDown={(event) => event.stopPropagation()} onSubmit={submitAgent}>
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
              <select value={category} onChange={(event) => setCategory(event.target.value as AgentProfile["category"])}>
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
              <select value={engineId} onChange={(event) => setEngineId(event.target.value as AgentEngineSettings["id"])}>
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

function buildMcpToolChoices(
  servers: McpServerSettings[],
  tools: McpToolDefinition[],
  selectedIds: Set<string>
) {
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
              <select value={transport} onChange={(event) => setTransport(event.target.value as McpServerSettings["transport"])}>
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
                  <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="npx / node / uvx" />
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
                <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="http://127.0.0.1:8787/mcp" />
              </label>
            )}
            <div className="mcp-editor-note">
              <strong>测试连接</strong>
              <span>保存后在 MCP 页面点击“测试连接”。stdio 会检查本地命令是否存在，HTTP 会请求端点并返回状态码。</span>
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
        <select
          value={activeRuntimeProvider?.id ?? ""}
          onChange={(event) => void onRuntimeChange(event.target.value)}
        >
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
              {index === 0 ? <FileText size={16} /> : index === 1 ? <Zap size={16} /> : index === 2 ? <Workflow size={16} /> : <Folder size={16} />}
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
                    <button className="send-orb" disabled={sending || !draft.trim()} type="submit" aria-label="发送任务">
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
  const fileChanges = toolActivity.filter((tool) => {
    const name = String(tool.name);
    return name.includes("write") || name.includes("file") || name.includes("command");
  });
  const visibleTools = toolActivity.slice(-5).reverse();
  const visibleChanges = fileChanges.slice(-4).reverse();
  const runningTools = toolActivity.filter((tool) => tool.status === "running" || tool.status === "queued").length;
  const completedTools = toolActivity.filter((tool) => tool.status === "completed" || tool.status === "approved").length;
  const codePreviewLines =
    visibleChanges.length > 0
      ? visibleChanges.slice(0, 3).map((tool) => ({
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
      <section className="task-run-card run-overview-card">
        <div className="task-run-heading">
          <div>
            <p className="eyebrow">运行概览</p>
            <h3>{activeAgent?.name ?? "Cowork 助手"}</h3>
          </div>
          <span className={`agent-status ${activeAgent?.status ?? "idle"}`} />
        </div>
        <p>{activeRuntimeProvider?.name ?? "未选择模型服务"} · {activeRuntimeModel || "未选择模型"}</p>
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

      <section className="task-run-card code-change-card">
        <div className="task-run-heading">
          <div>
            <p className="eyebrow">代码变更</p>
            <h3>文件与命令</h3>
          </div>
          <FileText size={17} />
        </div>
        <div className="task-change-list">
          {visibleChanges.length === 0 ? (
            <span className="task-panel-empty">暂无代码或文件变更。</span>
          ) : (
            visibleChanges.map((tool) => (
              <article key={`${tool.id}-change`}>
                <div>
                  <strong>{toolNameLabel(tool.name)}</strong>
                  <span>{tool.summary}</span>
                </div>
                <b>{toolStatusLabel(tool.status)}</b>
              </article>
            ))
          )}
        </div>
        <div className="code-preview-window" aria-label="实时写入预览">
          <div className="code-preview-title">
            <span />
            实时写入
          </div>
          <pre>
            {codePreviewLines.map((line) => (
              <code className={line.sign === "-" ? "removed" : "added"} key={line.id}>
                {line.sign} {line.text}
              </code>
            ))}
          </pre>
        </div>
      </section>

      <section className="task-run-card">
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
            <strong>{pendingTasks} 个进行中 · {completedTasks} 个完成</strong>
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
  files,
  recentFiles,
  sessions,
  onNewTask,
  onOpenSession,
  onOpenWorkspace
}: {
  files: WorkspaceFile[];
  recentFiles: WorkspaceTreeEntry[];
  sessions: AppSnapshot["sessions"];
  onNewTask: () => void;
  onOpenSession: () => void;
  onOpenWorkspace: () => void;
}) {
  return (
    <section className="workspace module-workspace">
      <ModuleHeader eyebrow="Search" title="搜索任务" detail="任务记录、工作区文件和上下文检索独立成页。" actionLabel="新建任务" onAction={onNewTask} />
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
      <div className="search-workspace-grid">
        <section className="panel-block search-result-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">History</p>
              <h3>任务记录</h3>
            </div>
            <CircleDot size={18} />
          </div>
          <div className="stack-list">
            {sessions.map((session) => (
              <button className="module-row" key={session.id} onClick={onOpenSession} type="button">
                <strong>{session.title}</strong>
                <span>{session.workspace}</span>
                <b>打开</b>
              </button>
            ))}
          </div>
        </section>
        <section className="panel-block search-result-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Context</p>
              <h3>最近上下文</h3>
            </div>
            <FileText size={18} />
          </div>
          <div className="stack-list">
            {[...recentFiles, ...files.slice(0, 4)].slice(0, 8).map((file) => (
              <button className="module-row" key={file.path} onClick={onOpenWorkspace} type="button">
                <strong>{file.path}</strong>
                <span>{file.kind}</span>
                <b>预览</b>
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function ScheduledTasksView({ taskBoard, agents }: { taskBoard: TaskBoardItem[]; agents: AgentProfile[] }) {
  return (
    <section className="workspace module-workspace">
      <ModuleHeader eyebrow="Automation" title="定时任务" detail="周期任务、后台计划和自动化执行放在独立控制台。" />
      <div className="automation-layout">
        <section className="panel-block automation-create-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Create</p>
              <h3>新建定时任务</h3>
            </div>
            <CircleDot size={18} />
          </div>
          <div className="settings-form">
            <label>
              <span>任务名称</span>
              <input placeholder="例如：每天整理工作区文件" />
            </label>
            <label>
              <span>执行助手</span>
              <select>
                {agents.map((agent) => (
                  <option key={agent.id}>{agent.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>计划</span>
              <select>
                <option>每天</option>
                <option>每周</option>
                <option>仅一次</option>
              </select>
            </label>
            <button className="primary-button" type="button">创建任务</button>
          </div>
        </section>
        <section className="panel-block automation-queue-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Queue</p>
              <h3>自动化队列</h3>
            </div>
            <ListChecks size={18} />
          </div>
          <div className="task-list">
            {taskBoard.map((task) => (
              <TaskCard key={task.id} task={task} agents={agents} />
            ))}
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
  runningAgents,
  totalAgents
}: {
  activeApprovals: number;
  activeRuntimeModel: string;
  activeRuntimeProvider?: ProviderSettings;
  configuredProviders: number;
  enabledSkills: number;
  runningAgents: number;
  totalAgents: number;
}) {
  return (
    <section className="workspace module-workspace">
      <ModuleHeader eyebrow="Runtime" title="AI Runtime Dashboard" detail="模型、Agent、工具审批和执行趋势集中在这里。" />
      <div className="dashboard-filter-row">
        <span>近 24 小时</span>
        <span>{activeRuntimeProvider?.name ?? "未选择 Provider"}</span>
        <span>{activeRuntimeModel || "未选择模型"}</span>
        <button className="mini-button" type="button">刷新</button>
      </div>
      <div className="runtime-metric-grid">
        <Metric label="总调用" value={String(Math.max(1, runningAgents))} />
        <Metric label="运行助手" value={`${runningAgents}/${totalAgents}`} />
        <Metric label="启用技能" value={String(enabledSkills)} />
        <Metric label="模型服务" value={String(configuredProviders)} />
        <Metric label="待审批" value={String(activeApprovals)} />
      </div>
      <section className="runtime-chart panel-block">
        <h3>调用趋势</h3>
        <div />
      </section>
    </section>
  );
}

function SkillsHubView({
  skills,
  onOpenSettings,
  onToggleSkill
}: {
  skills: SkillProfile[];
  onOpenSettings: () => void;
  onToggleSkill: (skillId: string, enabled: boolean) => void;
}) {
  const categories = ["全部", "推荐", "编程开发", "办公文档", "数据分析", "自动化", "研究写作"];
  return (
    <section className="workspace module-workspace">
      <ModuleHeader eyebrow="Skills" title="技能" detail="技能市场和已安装技能独立管理，不挤在工作台首页。" actionLabel="管理技能" onAction={onOpenSettings} />
      <div className="module-search-bar">
        <Search size={18} />
        <input placeholder="搜索技能" />
      </div>
      <div className="chip-tabs">
        {categories.map((category, index) => (
          <span className={index === 1 ? "active" : ""} key={category}>{category}</span>
        ))}
      </div>
      <div className="skill-market-layout">
        <section className="panel-block skill-installed-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Installed</p>
              <h3>已启用技能</h3>
            </div>
            <b className="status ready">{skills.filter((skill) => skill.enabled).length}</b>
          </div>
          <div className="stack-list">
            {skills.filter((skill) => skill.enabled).slice(0, 5).map((skill) => (
              <article className="module-row" key={skill.id}>
                <strong>{skill.name}</strong>
                <span>{skill.source}</span>
                <b>运行中</b>
              </article>
            ))}
          </div>
        </section>
        <section className="module-grid two-column skill-market-grid">
        {skills.map((skill) => (
          <article className="market-card" key={skill.id}>
            <div>
              <Workflow size={17} />
              <strong>{skill.name}</strong>
            </div>
            <p>{skill.description}</p>
            <div className="market-card-actions">
              <span>{skill.enabled ? "已启用" : "未启用"} · {skill.source}</span>
              <button
                className={skill.enabled ? "secondary-button danger-soft-button" : "primary-button"}
                onClick={() => onToggleSkill(skill.id, !skill.enabled)}
                type="button"
              >
                {skill.enabled ? "停用" : "启用"}
              </button>
            </div>
          </article>
        ))}
        </section>
      </div>
    </section>
  );
}

function McpHubView({
  servers,
  testResults,
  toolResults,
  testingServerId,
  refreshingToolsServerId,
  onCreate,
  onDelete,
  onEdit,
  onOpenSettings,
  onRefreshTools,
  onTest,
  onToggle
}: {
  servers: McpServerSettings[];
  testResults: Record<string, McpServerTestResult>;
  toolResults: Record<string, McpServerToolsResult>;
  testingServerId: string | null;
  refreshingToolsServerId: string | null;
  onCreate: () => void;
  onDelete: (serverId: string) => void;
  onEdit: (serverId: string) => void;
  onOpenSettings: () => void;
  onRefreshTools: (server: McpServerSettings) => void;
  onTest: (server: McpServerSettings) => void;
  onToggle: (serverId: string, enabled: boolean) => void;
}) {
  const enabledCount = servers.filter((server) => server.enabled).length;
  const discoveredToolCount = Object.values(toolResults).reduce((count, result) => count + result.tools.length, 0);
  return (
    <section className="workspace module-workspace">
      <ModuleHeader eyebrow="MCP" title="MCP 工具服务器" detail="管理本地 stdio 和远程 HTTP MCP，所有高风险动作继续进入审批。" actionLabel="新增 MCP" onAction={onCreate} />
      <div className="mcp-layout">
        <section className="panel-block mcp-gateway-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Gateway</p>
              <h3>工具网关</h3>
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
          <p>所有写文件、执行命令、浏览器和外部访问动作都会先进入审批队列。这里负责 MCP 连接和可用性测试。</p>
          <button className="secondary-button" onClick={onOpenSettings} type="button">打开权限策略</button>
        </section>
        <section className="mcp-server-grid">
        {servers.map((server) => {
          const result = testResults[server.id];
          const toolsResult = toolResults[server.id];
          const target =
            server.transport === "http"
              ? server.url || "未配置 URL"
              : [server.command, ...(server.args ?? [])].filter(Boolean).join(" ") || "未配置命令";
          return (
            <article className={server.enabled ? "mcp-server-card enabled" : "mcp-server-card"} key={server.id}>
              <div className="mcp-server-topline">
                <Terminal size={17} />
                <strong>{server.name}</strong>
                <span className="transport-badge">{server.transport}</span>
                <span className={server.enabled ? "status ready" : "status muted-status"}>{server.enabled ? "启用" : "停用"}</span>
              </div>
              <p>{server.description}</p>
              <code className="mcp-server-target">{target}</code>
              {result ? (
                <div className={result.ok ? "mcp-test-result ok" : "mcp-test-result failed"}>
                  <strong>{result.ok ? "连接可用" : "连接失败"}</strong>
                  <span>
                    {result.message}
                    {typeof result.status === "number" ? ` · HTTP ${result.status}` : ""}
                  </span>
                </div>
              ) : null}
              {toolsResult ? (
                <div className={toolsResult.ok ? "mcp-tools-result ok" : "mcp-tools-result failed"}>
                  <strong>{toolsResult.ok ? `已发现 ${toolsResult.tools.length} 个工具` : "工具发现失败"}</strong>
                  <span>{toolsResult.message}</span>
                  {toolsResult.tools.length ? (
                    <div className="mcp-tool-chip-row">
                      {toolsResult.tools.slice(0, 6).map((tool) => (
                        <span key={tool.id}>{tool.title || tool.name}</span>
                      ))}
                      {toolsResult.tools.length > 6 ? <span>+{toolsResult.tools.length - 6}</span> : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="mcp-card-actions">
                <button className="secondary-button" onClick={() => onToggle(server.id, !server.enabled)} type="button">
                  {server.enabled ? "停用" : "启用"}
                </button>
                <button className="secondary-button" disabled={testingServerId === server.id} onClick={() => onTest(server)} type="button">
                  {testingServerId === server.id ? "测试中..." : "测试连接"}
                </button>
                <button className="secondary-button" disabled={refreshingToolsServerId === server.id} onClick={() => onRefreshTools(server)} type="button">
                  {refreshingToolsServerId === server.id ? "刷新中..." : "刷新工具"}
                </button>
                <button className="secondary-button" onClick={() => onEdit(server.id)} type="button">
                  编辑
                </button>
                <button className="secondary-button danger-soft-button" onClick={() => onDelete(server.id)} type="button">
                  删除
                </button>
              </div>
            </article>
          );
        })}
        </section>
      </div>
    </section>
  );
}

function AgentsHubView({
  activeAgent,
  agents,
  engines,
  onActivate,
  onCreate,
  onEdit,
  onOpenSettings
}: {
  activeAgent: AgentProfile | null;
  agents: AgentProfile[];
  engines: AgentEngineSettings[];
  onActivate: (agentId: string) => void;
  onCreate: () => void;
  onEdit: (agentId: string) => void;
  onOpenSettings: () => void;
}) {
  return (
    <section className="workspace module-workspace">
      <ModuleHeader eyebrow="Agents" title="我的 Agent" detail="助手、团队和运行引擎集中到独立页面。" actionLabel="新建 Agent" onAction={onCreate} />
      <div className="agent-hub-grid">
        {agents.map((agent) => {
          const engine = engines.find((item) => item.id === agent.engineId);
          return (
            <article
              className={activeAgent?.id === agent.id ? "agent-hub-card active" : "agent-hub-card"}
              key={agent.id}
            >
              <div className="avatar">{agent.name.slice(0, 1)}</div>
              <div>
                <strong>{agent.name}</strong>
                <span>{agent.description}</span>
                <small>{engine?.name ?? "NexaDesk Built-in"} · {agent.enabled ? "启用" : "停用"}</small>
              </div>
              <div className="agent-card-actions">
                <button className="secondary-button" onClick={() => onEdit(agent.id)} type="button">
                  编辑
                </button>
                <button className="primary-button" onClick={() => onActivate(agent.id)} type="button">
                  {activeAgent?.id === agent.id ? "当前" : "切换"}
                </button>
              </div>
              {activeAgent?.id === agent.id ? <Check className="agent-active-check" size={18} /> : null}
            </article>
          );
        })}
      </div>
      <button className="secondary-button wide-module-action" onClick={onOpenSettings} type="button">
        打开完整助手设置
      </button>
    </section>
  );
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

function applyChatStreamEvent(snapshot: AppSnapshot, event: ChatStreamEvent): AppSnapshot {
  if (event.type === "user_message" || event.type === "assistant_start") {
    if (snapshot.messages.some((message) => message.id === event.message.id)) {
      return snapshot;
    }
    return {
      ...snapshot,
      messages: [...snapshot.messages, event.message]
    };
  }

  if (event.type === "assistant_delta") {
    return {
      ...snapshot,
      messages: snapshot.messages.map((message) =>
        message.id === event.messageId ? { ...message, content: `${message.content}${event.delta}` } : message
      )
    };
  }

  if (event.type === "assistant_done") {
    const hasActivity = snapshot.activity.some((item) => item.id === event.activity.id);
    return {
      ...snapshot,
      messages: snapshot.messages.map((message) => (message.id === event.message.id ? event.message : message)),
      activity: hasActivity ? snapshot.activity : [event.activity, ...snapshot.activity].slice(0, 20)
    };
  }

  if (event.type === "tool_call") {
    return {
      ...snapshot,
      messages: snapshot.messages.map((message) =>
        message.id === event.messageId
          ? { ...message, toolCalls: [...(message.toolCalls ?? []), event.toolCall] }
          : message
      )
    };
  }

  if (event.type === "tool_message") {
    if (snapshot.messages.some((message) => message.id === event.message.id)) {
      return snapshot;
    }
    return {
      ...snapshot,
      messages: [...snapshot.messages, event.message]
    };
  }

  if (event.type === "approval_queued") {
    if (snapshot.approvals.some((approval) => approval.id === event.approval.id)) {
      return snapshot;
    }
    return {
      ...snapshot,
      approvals: [event.approval, ...snapshot.approvals]
    };
  }

  if (event.messageId) {
    return {
      ...snapshot,
      messages: snapshot.messages.map((message) =>
        message.id === event.messageId
          ? {
              ...message,
              content: message.content || `模型调用失败：${event.message}`,
              toolCalls: message.toolCalls?.map((tool) => ({ ...tool, status: "failed" }))
            }
          : message
      )
    };
  }

  return snapshot;
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
  const runtimeModels = Array.from(new Set([draft.model.activeModel, ...(selectedRuntimeProvider?.models ?? [])])).filter(
    Boolean
  );
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
              <button className="primary-button" disabled={saving} onClick={() => void persist(draft).catch(() => undefined)} type="button">
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
            <button className="mini-button" disabled={detectingEngines} onClick={() => void handleDetectAgentEngines()} type="button">
              {detectingEngines ? "检测中..." : "检测本机引擎"}
            </button>
          </div>
          <div className="settings-form">
            <p className="secret-note">
              这里把模型 Provider 和 Agent 执行器拆开管理：Provider 负责 API/模型，Agent 引擎负责本机 CLI、运行时、权限模式和后续启动检测。
            </p>
            <div className="collapse-list">
              {draft.assistant.engines.map((engine) => {
                const detection = engineDetections.find((item) => item.engineId === engine.id);
                return (
                <details className={engine.enabled ? "config-disclosure enabled" : "config-disclosure"} key={engine.id}>
                  <summary>
                    <span className="summary-main">
                      <strong>{engine.name}</strong>
                      <small>
                        {engine.kind.toUpperCase()} · {engine.setupStatus === "ready" ? "可用" : engine.setupStatus === "needs_setup" ? "待配置" : "未安装"} · {engine.description}
                      </small>
                    </span>
                    <label className="connection-toggle" onClick={(event) => event.stopPropagation()}>
                      <input
                        checked={engine.enabled}
                        onChange={(event) =>
                          updateEngine(engine.id, {
                            enabled: event.target.checked,
                            setupStatus: event.target.checked && !engine.installed ? "needs_setup" : engine.setupStatus
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
                      <span className="runtime-pill">{engine.configSource === "local_cli" ? "读取本机 CLI 配置" : "使用 NexaDesk 模型中心"}</span>
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
                          onChange={(event) => updateEngine(engine.id, { providerId: event.target.value || undefined })}
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
                <details className={agent.enabled ? "config-disclosure enabled" : "config-disclosure"} key={agent.id}>
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
                        onChange={(event) => updateAgent(agent.id, { engineId: event.target.value as AgentProfile["engineId"] })}
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
                <details className={skill.enabled ? "config-disclosure enabled" : "config-disclosure"} key={skill.id}>
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
              <h3>外观与字体</h3>
            </div>
            <Settings size={18} />
          </div>
          <div className="settings-form">
            <div className="field-grid">
              <label className="field-label">
                <span>主题</span>
                <select
                  value={draft.appearance.theme}
                  onChange={(event) =>
                    updateDraft({
                      appearance: { ...draft.appearance, theme: event.target.value as AppSettings["appearance"]["theme"] }
                    })
                  }
                >
                  <option value="system">跟随系统</option>
                  <option value="light">浅色</option>
                  <option value="dark">深色</option>
                </select>
              </label>
              <label className="field-label">
                <span>语言</span>
                <select
                  value={draft.appearance.language}
                  onChange={(event) =>
                    updateDraft({
                      appearance: {
                        ...draft.appearance,
                        language: event.target.value as AppSettings["appearance"]["language"]
                      }
                    })
                  }
                >
                  <option value="en">English</option>
                  <option value="zh-CN">简体中文</option>
                </select>
              </label>
            </div>
            <div className="field-grid">
              <label className="field-label">
                <span>字体预设</span>
                <select
                  value={fontOptions.includes(draft.appearance.fontFamily) ? draft.appearance.fontFamily : "Custom"}
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
            <label className="field-label">
              <span>自定义字体栈</span>
              <input
                value={draft.appearance.fontFamily}
                onChange={(event) =>
                  updateDraft({ appearance: { ...draft.appearance, fontFamily: event.target.value } })
                }
                placeholder="Inter, Microsoft YaHei, sans-serif"
              />
            </label>
            <label className="field-label">
              <span>界面密度</span>
              <select
                value={draft.appearance.density}
                onChange={(event) =>
                  updateDraft({
                    appearance: { ...draft.appearance, density: event.target.value as AppSettings["appearance"]["density"] }
                  })
                }
              >
                <option value="comfortable">舒适</option>
                <option value="compact">紧凑</option>
              </select>
            </label>
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
                  updateDraft({ app: { ...draft.app, logLevel: event.target.value as AppSettings["app"]["logLevel"] } })
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
                  <DiagnosticRow label="运行模式" value={desktopStatus.mode === "desktop" ? "桌面应用" : "Web 开发"} />
                  <DiagnosticRow label="Version" value={desktopStatus.version} />
                  <DiagnosticRow label="API" value={desktopStatus.apiBase} />
                  <DiagnosticRow label="Data directory" value={desktopStatus.dataDir ?? "Not set"} />
                  <DiagnosticRow label="Settings file" value={desktopStatus.settingsPath ?? "Not set"} />
                  <DiagnosticRow label="Secrets file" value={desktopStatus.secretsPath ?? "Not set"} />
                  <DiagnosticRow label="Runtime state" value={desktopStatus.runtimeStatePath ?? "Not set"} />
                  <DiagnosticRow label="Secret protection" value={desktopStatus.secretsEncrypted ? "Encrypted" : "Not encrypted"} />
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
  onSaveSettings?: (settings: AppSettings, providerSecrets?: ProviderSecretUpdate[]) => Promise<AppSettings> | AppSettings;
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
    (selectedProvider ? createProviderDraft(selectedProvider) : providers[0] ? createProviderDraft(providers[0]) : null);
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
      providerStatus: pruneProviderStatus(settings.providerStatus, remainingProviders.map((provider) => provider.id)),
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
          : uniqueModels[0] ?? currentDefaultModel;
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
      setProviderNotice(`已刷新 ${result.models.length} 个模型，请确认后点击“保存”。`);
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
            <strong>{alignedMatrixCount}/{domesticProviderMatrix.length}</strong>
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
                      className={provider.id === selectedDraft.id ? "provider-picker-card active" : "provider-picker-card"}
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
                      <span className={`matrix-badge ${providerTestTone(row.result)}`}>{providerTestLabel(row.result)}</span>
                    </span>
                    <span className="matrix-meta">
                      {row.summary.issues.length ? row.summary.issues.slice(0, 2).join("；") : `Key env: ${row.item.envKey}`}
                    </span>
                  </button>
                ))}
              </div>
              <p className="secret-note compact">
                矩阵检查默认配置；真实可用性仍以测试连接和刷新模型结果为准。
              </p>
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
                placeholder={selectedDraft.apiKeyConfigured ? "已配置。输入新 Key 可替换。" : "只保存到后端/桌面安全存储"}
                type="password"
              />
            </label>

            <div className="config-actions">
              <button className="secondary-button" disabled={testProviderId === selectedDraft.id} onClick={handleTestProvider} type="button">
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
                disabled={savingProviderId === selectedDraft.id || (!selectedDraft.apiKeyConfigured && !selectedDraft.apiKey.trim())}
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
                renderProviderNote(
                  selectedDraft,
                  savedProviderId,
                  selectedTestResult,
                  selectedRefreshResult
                )}
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
              <small>{models.length} 个模型 · {selectedDraft.apiKeyConfigured ? "Key 已保存" : "Key 未保存"}</small>
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
  const importedMcpServers =
    isRecord(value.mcp) && Array.isArray(value.mcp.servers)
      ? value.mcp.servers.map((item) => sanitizeImportedMcpServer(item)).filter((item): item is McpServerSettings => Boolean(item))
      : fallback.mcp.servers;

  return {
    ...fallback,
    ...(value as Partial<AppSettings>),
    providers,
    model: {
      activeProviderId,
      activeModel:
        typeof model.activeModel === "string" && model.activeModel
          ? model.activeModel
          : activeProvider.defaultModel || activeProvider.models[0] || ""
    },
    mcp: {
      servers: importedMcpServers.length ? importedMcpServers : fallback.mcp.servers
    },
    updatedAt: new Date().toISOString()
  };
}

function sanitizeImportedMcpServer(value: unknown): McpServerSettings | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }
  const transport = value.transport === "http" ? "http" : "stdio";
  const args = Array.isArray(value.args)
    ? value.args.filter((arg): arg is string => typeof arg === "string" && Boolean(arg.trim()))
    : [];

  return {
    id: value.id,
    name: value.name.trim() || "Custom MCP",
    description: typeof value.description === "string" && value.description.trim() ? value.description : "Custom MCP server.",
    transport,
    enabled: Boolean(value.enabled),
    command: transport === "stdio" && typeof value.command === "string" ? value.command : undefined,
    args: transport === "stdio" ? args : undefined,
    url: transport === "http" && typeof value.url === "string" ? value.url : undefined
  };
}

function sanitizeImportedProvider(value: unknown): ProviderSettings | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }

  const models = Array.isArray(value.models)
    ? value.models.filter((model): model is string => typeof model === "string" && Boolean(model.trim()))
    : [];
  const apiMode = apiModeOptions.some((option) => option.value === value.apiMode)
    ? (value.apiMode as ProviderApiMode)
    : "chat_completions";
  const capabilities = Array.isArray(value.capabilities)
    ? value.capabilities.filter((capability): capability is ProviderCapability =>
        capabilityOptions.some((option) => option.value === capability)
      )
    : [];

  return {
    id: value.id,
    name: value.name,
    kind:
      value.kind === "local" || value.kind === "openai_compatible" || value.kind === "anthropic" || value.kind === "google"
        ? value.kind
        : "custom",
    apiMode,
    connected: Boolean(value.connected),
    baseUrl: typeof value.baseUrl === "string" ? value.baseUrl : undefined,
    models: models.length ? models : ["model-name"],
    defaultModel:
      typeof value.defaultModel === "string" && value.defaultModel
        ? value.defaultModel
        : models[0] ?? "model-name",
    apiKeyConfigured: false,
    capabilities: capabilities.length ? capabilities : ["streaming"]
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function renderProviderNote(
  draft: ProviderDraft,
  savedProviderId: string | null,
  testResult: ProviderTestResult | undefined,
  refreshResult: ProviderModelsResult | undefined
) {
  if (testResult) {
    return `${testResult.ok ? "Test passed" : "Test failed"}${formatProviderCheckSuffix(testResult)}: ${testResult.message}${
      testResult.checkedUrl ? ` (${testResult.checkedUrl})` : ""
    }`;
  }
  if (refreshResult) {
    return `${refreshResult.ok ? "Models refreshed" : "Refresh failed"}${formatProviderCheckSuffix(refreshResult)}: ${refreshResult.message}${
      refreshResult.checkedUrl ? ` (${refreshResult.checkedUrl})` : ""
    }`;
  }
  if (savedProviderId === draft.id) {
    return "已保存到本地设置。API Key 只记录已配置状态，不会回传给前端。";
  }
  return "建议先点击“测试连接”确认服务可用，也可以用“刷新模型”从 /models 自动拉取模型名。";
}

function inspectProviderMatrixItem(item: ProviderMatrixItem, draft: ProviderDraft | null) {
  if (!draft) {
    return {
      status: "missing" as const,
      label: "缺少预设",
      issues: ["默认 Provider 不存在"]
    };
  }

  const issues: string[] = [];
  const models = parseModels(draft.modelsText);
  const missingModels = item.requiredModels.filter((model) => !models.includes(model));
  const missingCapabilities = item.requiredCapabilities.filter((capability) => !draft.capabilities[capability]);

  if (normalizeProviderUrl(draft.baseUrl) !== normalizeProviderUrl(item.baseUrl)) {
    issues.push("Base URL 不一致");
  }
  if (draft.apiMode !== item.apiMode) {
    issues.push("接口类型不一致");
  }
  if (missingModels.length) {
    issues.push(`缺少模型 ${missingModels.slice(0, 2).join(", ")}${missingModels.length > 2 ? "..." : ""}`);
  }
  if (missingCapabilities.length) {
    issues.push(`缺少能力 ${missingCapabilities.join(", ")}`);
  }

  if (issues.length) {
    return {
      status: "warning" as const,
      label: "有偏差",
      issues
    };
  }

  return {
    status: "ok" as const,
    label: "已对齐",
    issues: []
  };
}

function providerTestLabel(result: ProviderTestResult | undefined) {
  if (!result) {
    return "未测试";
  }
  return result.ok ? "测试通过" : "测试失败";
}

function providerTestTone(result: ProviderTestResult | undefined) {
  if (!result) {
    return "pending";
  }
  return result.ok ? "ok" : "fail";
}

function normalizeProviderUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function resultToProviderStatusRecord(result: ProviderTestResult) {
  return {
    ok: result.ok,
    status: result.status,
    message: result.message,
    checkedUrl: result.checkedUrl,
    checkedAt: result.checkedAt ?? new Date().toISOString()
  };
}

function resultToProviderModelsStatusRecord(result: ProviderModelsResult) {
  return {
    ...resultToProviderStatusRecord(result),
    models: result.models
  };
}

function buildProviderStatus(
  base: ProviderStatusSettings,
  testResults: Record<string, ProviderTestResult>,
  refreshResults: Record<string, ProviderModelsResult>,
  patch: {
    test?: [string, ReturnType<typeof resultToProviderStatusRecord>];
    modelRefresh?: [string, ReturnType<typeof resultToProviderModelsStatusRecord>];
  } = {}
): ProviderStatusSettings {
  return {
    tests: {
      ...base.tests,
      ...Object.fromEntries(
        Object.entries(testResults).map(([providerId, result]) => [providerId, resultToProviderStatusRecord(result)])
      ),
      ...(patch.test ? { [patch.test[0]]: patch.test[1] } : {})
    },
    modelRefreshes: {
      ...base.modelRefreshes,
      ...Object.fromEntries(
        Object.entries(refreshResults).map(([providerId, result]) => [
          providerId,
          resultToProviderModelsStatusRecord(result)
        ])
      ),
      ...(patch.modelRefresh ? { [patch.modelRefresh[0]]: patch.modelRefresh[1] } : {})
    }
  };
}

function pruneProviderStatus(providerStatus: ProviderStatusSettings, providerIds: string[]) {
  const allowed = new Set(providerIds);
  return {
    tests: Object.fromEntries(Object.entries(providerStatus.tests).filter(([providerId]) => allowed.has(providerId))),
    modelRefreshes: Object.fromEntries(
      Object.entries(providerStatus.modelRefreshes).filter(([providerId]) => allowed.has(providerId))
    )
  };
}

function formatProviderCheckSuffix(result: { checkedAt?: string }) {
  return result.checkedAt ? ` (${formatProviderCheckTime(result.checkedAt)})` : "";
}

function formatProviderCheckTime(value: string | undefined) {
  if (!value) {
    return "时间未知";
  }
  return new Date(value).toLocaleString();
}

function createCapabilityRecord(capabilities: ProviderCapability[]): Record<ProviderCapability, boolean> {
  return capabilityOptions.reduce(
    (record, option) => ({
      ...record,
      [option.value]: capabilities.includes(option.value)
    }),
    {} as Record<ProviderCapability, boolean>
  );
}

function parseModels(modelsText: string) {
  return modelsText
    .split(/[\n,]+/)
    .map((model) => model.trim())
    .filter(Boolean);
}

function policyLabel(key: keyof AppSettings["permissions"]) {
  const labels: Record<keyof AppSettings["permissions"], string> = {
    shell: "命令行执行",
    fileWrite: "文件写入",
    network: "网络访问",
    browser: "浏览器控制",
    mcp: "MCP 工具",
    automation: "自动化任务",
    autoApproveLowRisk: "自动批准低风险操作"
  };
  return labels[key];
}

function appSettingLabel(key: keyof Omit<AppSettings["app"], "logLevel">) {
  const labels: Record<keyof Omit<AppSettings["app"], "logLevel">, string> = {
    launchAtStartup: "开机启动",
    autoUpdate: "启用自动更新",
    telemetry: "允许匿名遥测"
  };
  return labels[key];
}

function AgentPill({ agent, active, onActivate }: { agent: AgentProfile; active: boolean; onActivate: () => void }) {
  return (
    <button className={active ? "agent-pill active" : "agent-pill"} onClick={onActivate} type="button">
      <span className={`agent-status ${agent.status}`} />
      <span>
        <strong>{agent.name}</strong>
        <small>{agent.enabled ? (active ? "当前助手" : agent.category) : "已停用"}</small>
      </span>
    </button>
  );
}

function TeamNode({ agent, index }: { agent: AgentProfile; index: number }) {
  const role = index === 0 ? "Leader" : "Teammate";
  return (
    <article className={`team-node ${index === 0 ? "leader" : ""}`}>
      <div className="avatar">{agent.name.slice(0, 1)}</div>
      <div>
        <span>{role}</span>
        <strong>{agent.name}</strong>
        <small>{agent.runtime}</small>
      </div>
      <b className={`agent-status ${agent.status}`} />
    </article>
  );
}

function MessageBubble({ message, compactTools = false }: { message: ChatMessage; compactTools?: boolean }) {
  const isToolMessage = message.role === "tool";
  const [toolDetailOpen, setToolDetailOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function copyToolResult() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 2200);
    }
  }

  return (
    <article className={`message ${message.role}`}>
      <div className="message-meta">
        <span className="avatar small">{message.author.slice(0, 1)}</span>
        <strong>{isToolMessage ? toolNameLabel(message.author) : message.author}</strong>
        <time>{new Date(message.createdAt).toLocaleTimeString()}</time>
      </div>
      {isToolMessage ? (
        <>
          <div className="tool-result-actions">
            <button className="mini-button" onClick={() => void copyToolResult()} type="button">
              {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制结果"}
            </button>
            <button className="mini-button" onClick={() => setToolDetailOpen(true)} type="button">
              查看详情
            </button>
          </div>
          <pre className="tool-result-body">{message.content || "工具没有返回内容。"}</pre>
          {toolDetailOpen ? (
            <ToolResultDrawer
              copyLabel={copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制结果"}
              message={message}
              onClose={() => setToolDetailOpen(false)}
              onCopy={() => void copyToolResult()}
            />
          ) : null}
        </>
      ) : (
        <p>{message.content}</p>
      )}
      {message.toolCalls?.length && compactTools ? (
        <div className="message-tool-summary">
          <Terminal size={13} />
          <span>{message.toolCalls.length} 个工具活动已同步到右侧执行面板</span>
        </div>
      ) : null}
      {message.toolCalls?.length && !compactTools ? (
        <ToolCallTimeline tools={message.toolCalls} />
      ) : null}
    </article>
  );
}

function ToolCallTimeline({ tools }: { tools: ToolCall[] }) {
  return (
    <div className="tool-call-list" aria-label="Tool calls">
      {tools.map((tool) => (
        <article className={`tool-call-card ${tool.status}`} key={tool.id}>
          <div className="tool-call-topline">
            <span className={`tool-call-dot ${tool.status}`} />
            <strong>{toolNameLabel(tool.name)}</strong>
            <span className={`tool-call-status ${tool.status}`}>{toolStatusLabel(tool.status)}</span>
          </div>
          <p>{tool.summary}</p>
          <div className="tool-call-meta">
            <span className={`risk ${tool.risk}`}>{tool.risk}</span>
            <span>{tool.name}</span>
          </div>
          <details className="tool-call-details">
            <summary>调用详情</summary>
            <dl>
              <div>
                <dt>工具</dt>
                <dd>{tool.name}</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>{toolStatusLabel(tool.status)}</dd>
              </div>
              <div>
                <dt>风险</dt>
                <dd>{tool.risk}</dd>
              </div>
              <div>
                <dt>说明</dt>
                <dd>{tool.summary}</dd>
              </div>
            </dl>
          </details>
        </article>
      ))}
    </div>
  );
}

function ToolResultDrawer({
  message,
  copyLabel,
  onCopy,
  onClose
}: {
  message: ChatMessage;
  copyLabel: string;
  onCopy: () => void;
  onClose: () => void;
}) {
  const titleId = `tool-result-${message.id}`;
  return (
    <div className="tool-result-drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        aria-labelledby={titleId}
        aria-modal="true"
        className="tool-result-drawer"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="tool-result-drawer-heading">
          <div>
            <p className="eyebrow">Tool result</p>
            <h3 id={titleId}>{toolNameLabel(message.author)}</h3>
          </div>
          <button aria-label="关闭工具详情" className="icon-button" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <dl className="tool-result-meta">
          <div>
            <dt>工具标识</dt>
            <dd>{message.author}</dd>
          </div>
          <div>
            <dt>消息时间</dt>
            <dd>{new Date(message.createdAt).toLocaleString()}</dd>
          </div>
        </dl>
        <pre className="tool-result-drawer-body">{message.content || "工具没有返回内容。"}</pre>
        <div className="tool-result-drawer-actions">
          <button className="secondary-button" onClick={onCopy} type="button">
            {copyLabel}
          </button>
          <button className="primary-button" onClick={onClose} type="button">
            关闭
          </button>
        </div>
      </aside>
    </div>
  );
}

function toolNameLabel(name: ToolCall["name"] | string) {
  const labels: Record<string, string> = {
    "model.stream": "模型流式输出",
    list_dir: "列目录",
    read_file: "读文件",
    write_file: "写文件",
    run_command: "执行命令",
    search: "工作区搜索",
    browser: "浏览器",
    image_generate: "图片生成"
  };
  return labels[name] ?? name;
}

function toolStatusLabel(status: ToolCall["status"]) {
  const labels: Record<ToolCall["status"], string> = {
    queued: "待审批",
    running: "执行中",
    approved: "已批准",
    rejected: "已拒绝",
    completed: "已完成",
    failed: "失败"
  };
  return labels[status];
}

function WorkspaceFilePanel({
  configuredWorkspace,
  currentPath,
  error,
  fallbackFiles,
  loading,
  recentFiles,
  result,
  onClearRecentFiles,
  onOpenFile,
  onOpenPath,
  onRefresh,
  onAskAgent,
  sending
}: {
  configuredWorkspace: string;
  currentPath: string;
  error: string | null;
  fallbackFiles: WorkspaceFile[];
  loading: boolean;
  recentFiles: WorkspaceTreeEntry[];
  result: WorkspaceListResult | null;
  onClearRecentFiles: () => void;
  onOpenFile: (entry: WorkspaceTreeEntry) => void;
  onOpenPath: (path: string) => void;
  onRefresh: () => void;
  onAskAgent: (path: string) => Promise<void>;
  sending: boolean;
}) {
  const visiblePath = result?.path ?? currentPath;
  const canGoUp = visiblePath !== ".";
  const [activeView, setActiveView] = useState<WorkspaceContextView>(() => readStoredWorkspaceContextView());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<WorkspaceSearchMode>("name");
  const [searchResult, setSearchResult] = useState<WorkspaceSearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    writeStoredWorkspaceContextView(activeView);
  }, [activeView]);

  async function runWorkspaceSearch(event?: FormEvent) {
    event?.preventDefault();
    setActiveView("search");
    const query = searchQuery.trim();
    if (!query) {
      setSearchResult(null);
      setSearchError(null);
      return;
    }

    setSearchLoading(true);
    setSearchError(null);
    try {
      const nextResult = await fetchWorkspaceSearch({ query, mode: searchMode, path: visiblePath });
      setSearchResult(nextResult);
      setSearchError(nextResult.error ?? null);
    } catch (reason) {
      setSearchResult(null);
      setSearchError(reason instanceof Error ? reason.message : "工作区搜索失败。");
    } finally {
      setSearchLoading(false);
    }
  }

  return (
    <div className="workspace-file-panel">
      <div className="workspace-status-card">
        <span>当前根目录</span>
        <strong title={result?.root ?? configuredWorkspace}>{result?.root ?? (configuredWorkspace || "未设置工作区")}</strong>
        <small>{result?.exists ? `当前：${visiblePath}` : error || "等待工作区状态..."}</small>
      </div>
      <div className="workspace-file-actions">
        <button className="mini-button" onClick={onRefresh} type="button">
          刷新
        </button>
        <button className="mini-button" disabled={!canGoUp} onClick={() => onOpenPath(parentWorkspacePath(visiblePath))} type="button">
          上级
        </button>
      </div>
      <div className="workspace-context-tabs" role="tablist" aria-label="工作区上下文">
        <button
          aria-pressed={activeView === "files"}
          className={`workspace-context-tab${activeView === "files" ? " active" : ""}`}
          onClick={() => setActiveView("files")}
          type="button"
        >
          文件树
        </button>
        <button
          aria-pressed={activeView === "search"}
          className={`workspace-context-tab${activeView === "search" ? " active" : ""}`}
          onClick={() => setActiveView("search")}
          type="button"
        >
          搜索
        </button>
      </div>
      {activeView === "search" ? (
        <div className="workspace-context-section">
          <form className="workspace-search-form" onSubmit={(event) => void runWorkspaceSearch(event)}>
            <label>
              <span>搜索工作区</span>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="文件名或内容关键词"
              />
            </label>
            <div className="workspace-search-actions">
              <select value={searchMode} onChange={(event) => setSearchMode(event.target.value as WorkspaceSearchMode)}>
                <option value="name">文件名</option>
                <option value="content">内容</option>
              </select>
              <button className="mini-button" disabled={searchLoading || !searchQuery.trim()} type="submit">
                <Search size={13} />
                {searchLoading ? "搜索中" : "搜索"}
              </button>
            </div>
            <p>搜索结果可预览，也可让 Agent 分析文件。</p>
          </form>
          {searchResult || searchError || searchLoading ? (
            <WorkspaceSearchResults
              error={searchError}
              loading={searchLoading}
              result={searchResult}
              onOpenFile={onOpenFile}
              onOpenPath={onOpenPath}
              onAskAgent={onAskAgent}
              sending={sending}
            />
          ) : (
            <EmptyState title="输入关键词搜索" detail="可按文件名或文件内容查找，再预览或交给 Agent 分析。" />
          )}
        </div>
      ) : (
        <div className="workspace-context-section">
          <WorkspaceRecentFiles files={recentFiles} onClear={onClearRecentFiles} onOpenFile={onOpenFile} />
          <div className="file-list workspace-tree-list">
            {loading ? <EmptyState title="正在读取工作区" detail="正在从本地 API 获取目录列表。" /> : null}
            {!loading && result?.exists && result.entries.length === 0 ? (
              <EmptyState title="目录为空" detail="当前工作区目录没有可显示的文件。" />
            ) : null}
            {!loading && result?.exists
              ? result.entries.map((entry) => (
                  <WorkspaceEntryRow entry={entry} key={entry.path} onOpenFile={onOpenFile} onOpenPath={onOpenPath} />
                ))
              : null}
            {!loading && !result?.exists && error ? (
              <EmptyState title="工作区不可用" detail={error} />
            ) : null}
            {!loading && !result && !error
              ? fallbackFiles.map((file) => (
                  <div className="file-row" key={file.path}>
                    <span>{file.path}</span>
                    {file.changed ? <b>changed</b> : null}
                  </div>
                ))
              : null}
          </div>
        </div>
      )}
    </div>
  );
}

function WorkspaceRecentFiles({
  files,
  onClear,
  onOpenFile
}: {
  files: WorkspaceTreeEntry[];
  onClear: () => void;
  onOpenFile: (entry: WorkspaceTreeEntry) => void;
}) {
  return (
    <section className="workspace-recent-files" aria-label="最近文件">
      <div className="workspace-context-subheading">
        <strong>最近文件</strong>
        {files.length > 0 ? (
          <button className="mini-button" onClick={onClear} type="button">
            清空
          </button>
        ) : null}
      </div>
      {files.length === 0 ? (
        <p>最近预览过的文件会显示在这里。</p>
      ) : (
        <div className="workspace-recent-list">
          {files.slice(0, 4).map((file) => (
            <button
              className="workspace-recent-file"
              key={file.path}
              onClick={() => onOpenFile(file)}
              title={file.path}
              type="button"
            >
              <span>
                <FileText size={13} />
                <strong>{file.name}</strong>
              </span>
              <small>{file.path}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function WorkspaceSearchResults({
  error,
  loading,
  result,
  onOpenFile,
  onOpenPath,
  onAskAgent,
  sending
}: {
  error: string | null;
  loading: boolean;
  result: WorkspaceSearchResult | null;
  onOpenFile: (entry: WorkspaceTreeEntry) => void;
  onOpenPath: (path: string) => void;
  onAskAgent: (path: string) => Promise<void>;
  sending: boolean;
}) {
  return (
    <div className="workspace-search-results">
      <div className="workspace-search-summary">
        <strong>搜索结果</strong>
        <span>
          {loading
            ? "正在搜索..."
            : result
              ? `${result.matches.length} 项 · ${result.mode === "name" ? "文件名" : "内容"}`
              : "无结果"}
        </span>
      </div>
      {error ? <p className="workspace-search-error">{error}</p> : null}
      {result && result.matches.length === 0 && !loading ? (
        <EmptyState title="没有匹配结果" detail="换一个关键词，或切换文件名/内容搜索。" />
      ) : null}
      {result?.matches.map((match) => (
        <WorkspaceSearchRow
          key={`${match.path}-${match.line ?? "path"}`}
          match={match}
          onAskAgent={onAskAgent}
          onOpenFile={onOpenFile}
          onOpenPath={onOpenPath}
          sending={sending}
        />
      ))}
    </div>
  );
}

function WorkspaceSearchRow({
  match,
  onAskAgent,
  onOpenFile,
  onOpenPath,
  sending
}: {
  match: WorkspaceSearchMatch;
  onAskAgent: (path: string) => Promise<void>;
  onOpenFile: (entry: WorkspaceTreeEntry) => void;
  onOpenPath: (path: string) => void;
  sending: boolean;
}) {
  const entry: WorkspaceTreeEntry = {
    name: match.name,
    path: match.path,
    kind: match.kind,
    size: match.size,
    modifiedAt: match.modifiedAt
  };
  const open = () => {
    if (match.kind === "folder") {
      onOpenPath(match.path);
      return;
    }
    onOpenFile(entry);
  };

  return (
    <article className="workspace-search-row">
      <div>
        <span>
          {match.kind === "folder" ? <Folder size={14} /> : <FileText size={14} />}
          <strong>{match.name}</strong>
        </span>
        <small>{match.line ? `${match.path}:${match.line}` : match.path}</small>
        {match.preview ? <em>{match.preview}</em> : null}
      </div>
      <div className="workspace-search-row-actions">
        <button className="mini-button" onClick={open} type="button">
          {match.kind === "folder" ? "进入" : "预览"}
        </button>
        {match.kind === "file" ? (
          <button className="mini-button" disabled={sending} onClick={() => void onAskAgent(match.path)} type="button">
            {sending ? "发送中" : "让 Agent 分析"}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function WorkspaceEntryRow({
  entry,
  onOpenFile,
  onOpenPath
}: {
  entry: WorkspaceTreeEntry;
  onOpenFile: (entry: WorkspaceTreeEntry) => void;
  onOpenPath: (path: string) => void;
}) {
  const content = (
    <>
      <span className="workspace-entry-name">
        {entry.kind === "folder" ? <Folder size={14} /> : <FileText size={14} />}
        <span>{entry.name}</span>
      </span>
      <small>{entry.kind === "folder" ? "folder" : formatFileSize(entry.size)}</small>
    </>
  );

  if (entry.kind === "folder") {
    return (
      <button className="file-row workspace-entry-button" onClick={() => onOpenPath(entry.path)} type="button">
        {content}
      </button>
    );
  }

  return (
    <button
      className="file-row workspace-entry-button workspace-entry-file"
      onClick={() => onOpenFile(entry)}
      title={entry.modifiedAt ? new Date(entry.modifiedAt).toLocaleString() : entry.path}
      type="button"
    >
      {content}
    </button>
  );
}

function WorkspaceFilePreviewDrawer({
  entry,
  error,
  loading,
  preview,
  sending,
  onAskAgent,
  onClose
}: {
  entry: WorkspaceTreeEntry;
  error: string | null;
  loading: boolean;
  preview: WorkspaceFilePreviewResult | null;
  sending: boolean;
  onAskAgent: (path: string) => Promise<void>;
  onClose: () => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const titleId = `workspace-file-${entry.path.replace(/[^a-z0-9_-]/gi, "-")}`;
  const canAskAgent = Boolean(preview?.exists && !preview.truncated && !loading);

  async function copyPreviewContent() {
    if (!preview?.content) {
      return;
    }
    try {
      await navigator.clipboard.writeText(preview.content);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 2200);
    }
  }

  return (
    <div className="tool-result-drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        aria-labelledby={titleId}
        aria-modal="true"
        className="tool-result-drawer file-preview-drawer"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="tool-result-drawer-heading">
          <div>
            <p className="eyebrow">Workspace file</p>
            <h3 id={titleId}>{preview?.name ?? entry.name}</h3>
          </div>
          <button aria-label="关闭文件预览" className="icon-button" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <dl className="tool-result-meta">
          <div>
            <dt>路径</dt>
            <dd>{preview?.path ?? entry.path}</dd>
          </div>
          <div>
            <dt>大小</dt>
            <dd>{formatFileSize(preview?.size ?? entry.size)}</dd>
          </div>
          <div>
            <dt>修改时间</dt>
            <dd>{preview?.modifiedAt ? new Date(preview.modifiedAt).toLocaleString() : "未知"}</dd>
          </div>
        </dl>
        {loading ? <EmptyState title="正在读取文件" detail="正在从本地 API 读取文件预览。" /> : null}
        {!loading && error ? <p className="file-preview-error">{error}</p> : null}
        {!loading && preview?.content ? (
          <pre className="tool-result-drawer-body file-preview-body">{preview.content}</pre>
        ) : null}
        {!loading && preview?.exists && !preview.content && !error ? (
          <EmptyState title="文件为空" detail="这个文件没有可预览的文本内容。" />
        ) : null}
        <div className="tool-result-drawer-actions">
          <button className="secondary-button" disabled={!preview?.content} onClick={() => void copyPreviewContent()} type="button">
            {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制内容"}
          </button>
          <button className="secondary-button" disabled={sending || !canAskAgent} onClick={() => void onAskAgent(entry.path)} type="button">
            {sending ? "发送中..." : "让 Agent 读取"}
          </button>
          <button className="primary-button" onClick={onClose} type="button">
            关闭
          </button>
        </div>
      </aside>
    </div>
  );
}

function parentWorkspacePath(path: string) {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  parts.pop();
  return parts.length ? parts.join("/") : ".";
}

function formatFileSize(size: number | undefined) {
  if (size === undefined) {
    return "file";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function TaskCard({
  task,
  agents
}: {
  task: (typeof taskBoard)[number];
  agents: AgentProfile[];
}) {
  const owner = agents.find((agent) => agent.id === task.ownerId);
  return (
    <article className="task-card">
      <div className="task-topline">
        <span className="status muted-status">{task.status}</span>
        <span>{owner?.name ?? "Unassigned"}</span>
      </div>
      <h4>{task.title}</h4>
      <p>{task.detail}</p>
    </article>
  );
}

function ApprovalCard({
  approval,
  agent,
  onResolve
}: {
  approval: PermissionRequest;
  agent?: AgentProfile;
  onResolve: (approval: PermissionRequest, approved: boolean, reason?: string) => void;
}) {
  const [reason, setReason] = useState("");
  const risk = approvalRiskInfo(approval.risk);

  return (
    <article className="approval-card">
      <span className={`risk ${approval.risk}`}>{risk.label}</span>
      <h4>{approval.action}</h4>
      <p>
        {agent?.name ?? "Unknown agent"} · {approval.toolName ?? "tool"}
      </p>
      <div className={`approval-risk-note ${approval.risk}`}>
        <strong>{risk.title}</strong>
        <span>{risk.description}</span>
        <small>{risk.recommendation}</small>
      </div>
      <dl className="approval-meta-grid">
        <div>
          <dt>工具</dt>
          <dd>{approval.toolName ?? "未知工具"}</dd>
        </div>
        <div>
          <dt>请求时间</dt>
          <dd>{new Date(approval.requestedAt).toLocaleString()}</dd>
        </div>
      </dl>
      <label className="approval-reason">
        <span>拒绝原因</span>
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="可选，拒绝时会写入历史"
        />
      </label>
      <div className="approval-actions">
        <button className="icon-button approve" onClick={() => onResolve(approval, true)} aria-label="Approve action">
          <Check size={15} />
        </button>
        <button
          className="icon-button reject"
          onClick={() => onResolve(approval, false, reason)}
          aria-label="Reject action"
        >
          <X size={15} />
        </button>
      </div>
    </article>
  );
}

function approvalRiskInfo(risk: PermissionRequest["risk"]) {
  const labels: Record<PermissionRequest["risk"], { label: string; title: string; description: string; recommendation: string }> = {
    low: {
      label: "低风险",
      title: "只读或可回滚动作",
      description: "通常只读取目录、文件或搜索结果，不会改动本地文件和系统状态。",
      recommendation: "确认目标路径正确后可以放行，也可以等待 Agent 说明用途。"
    },
    medium: {
      label: "中风险",
      title: "可能影响任务上下文",
      description: "可能访问较大范围数据、调用网络，或产生后续操作依赖。",
      recommendation: "建议检查工具名、目标和请求来源，再决定是否批准。"
    },
    high: {
      label: "高风险",
      title: "会写入、执行或外部访问",
      description: "可能写文件、执行命令、打开浏览器、生成图片或影响工作区状态。",
      recommendation: "必须逐条确认，不支持批量批准；不确定时先拒绝并要求 Agent 解释。"
    }
  };
  return labels[risk];
}

function ApprovalHistoryCard({ history, agent }: { history: ApprovalHistoryEntry; agent?: AgentProfile }) {
  return (
    <article className={`approval-card history ${history.decision}`}>
      <span className={`risk ${history.risk}`}>{history.decision}</span>
      <h4>{history.action}</h4>
      <p>
        {agent?.name ?? "Unknown agent"} · {history.toolName ?? "tool"} ·{" "}
        {new Date(history.resolvedAt).toLocaleString()}
      </p>
      {history.reason ? <p className="history-reason">原因：{history.reason}</p> : null}
      {history.decision === "rejected" && !history.reason ? <p className="history-reason">原因：未填写</p> : null}
      {history.resultSummary ? <p className="history-result">结果：{history.resultSummary}</p> : null}
    </article>
  );
}

function ActivityItem({ event }: { event: ActivityEvent }) {
  return (
    <article className={`activity-item ${event.level}`}>
      <span />
      <div>
        <strong>{event.title}</strong>
        <p>{event.detail}</p>
        <time>{new Date(event.createdAt).toLocaleTimeString()}</time>
      </div>
    </article>
  );
}

function formatTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return "未知时间";
  }
  const diffMs = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) {
    return "刚刚";
  }
  if (diffMs < hour) {
    return `${Math.floor(diffMs / minute)}分钟前`;
  }
  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)}小时前`;
  }
  return `${Math.floor(diffMs / day)}天前`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
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

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <Workflow size={24} />
      <strong>Starting NexaDesk</strong>
      <span>Loading workspace snapshot...</span>
    </main>
  );
}
