import {
  Bot,
  Check,
  CircleDot,
  FileText,
  Folder,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Mail,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  Workflow,
  X,
  Zap
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  createDefaultProviders,
  createDefaultSettings,
  createDemoSnapshot,
  type ActivityEvent,
  type ApprovalHistoryEntry,
  type AppSettings,
  type AgentProfile,
  type AppSnapshot,
  type ChatMessage,
  type ChatStreamEvent,
  type DesktopStatus,
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
  fetchDesktopStatus,
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
  testProvider
} from "./api";

declare global {
  interface Window {
    nexadeskDesktop?: {
      selectDirectory(options?: { title?: string; defaultPath?: string }): Promise<string | null>;
    };
  }
}

type DataMode = "live" | "demo";
type AppView = "cowork" | "settings";
type SettingsTab = "providers" | "model" | "assistants" | "skills" | "appearance" | "workspace" | "permissions" | "desktop";

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
  { id: "assistants", label: "内置助手", detail: "Cowork、Office、报告" },
  { id: "skills", label: "技能系统", detail: "启用、禁用、自定义" },
  { id: "appearance", label: "界面字体", detail: "主题、语言、字号" },
  { id: "workspace", label: "工作区", detail: "目录、导出、访问范围" },
  { id: "permissions", label: "权限审批", detail: "工具风险策略" },
  { id: "desktop", label: "桌面诊断", detail: "安装、日志、安全存储" }
];

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
  const [activeView, setActiveView] = useState<AppView>(() =>
    window.location.hash === "#settings" ? "settings" : "cowork"
  );
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

  const activeSession = snapshot?.sessions[0];
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
  const connectedProviders = snapshot?.providers.filter((provider) => provider.connected).length ?? 0;
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
      return;
    }

    setSending(true);
    setError(null);
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
    <main className="app-shell">
      <aside className="rail">
        <div className="brand-mark">
          <Workflow size={22} />
        </div>
        <button
          className={activeView === "cowork" ? "rail-button active" : "rail-button"}
          aria-label="Cowork"
          onClick={() => {
            window.location.hash = "";
            setActiveView("cowork");
          }}
          type="button"
        >
          <Sparkles size={19} />
        </button>
        <button className="rail-button" aria-label="Agents">
          <Bot size={19} />
        </button>
        <button className="rail-button" aria-label="Workspace">
          <Folder size={19} />
        </button>
        <button
          className={activeView === "settings" ? "rail-button active" : "rail-button"}
          aria-label="Settings"
          onClick={() => {
            window.location.hash = "settings";
            setActiveView("settings");
          }}
          type="button"
        >
          <Settings size={19} />
        </button>
      </aside>

      <aside className="sidebar">
        <div className="product-title">
          <p className="eyebrow">智能体工作台</p>
          <h1>NexaDesk</h1>
        </div>

        <section className="sidebar-section">
          <div className="section-heading">
            <span>空间</span>
          </div>
          <nav className="nav-list" aria-label="Workspace sections">
            <a className="nav-item active" href="#team">
              <LayoutDashboard size={17} />
              团队驾驶舱
            </a>
            <a className="nav-item" href="#agents">
              <Users size={17} />
              多智能体
              <b>{snapshot.agents.length}</b>
            </a>
            <a className="nav-item" href="#approvals">
              <ShieldCheck size={17} />
              审批
              <b>{activeApprovals}</b>
            </a>
            <a className="nav-item" href="#providers">
              <KeyRound size={17} />
              模型
              <b>{configuredProviders}</b>
            </a>
            <button
              className="nav-item nav-button"
              onClick={() => {
                window.location.hash = "settings";
                setActiveView("settings");
              }}
              type="button"
            >
              <Settings size={17} />
              设置
            </button>
          </nav>
        </section>

        <section className="sidebar-section">
          <div className="section-heading">
            <span>会话</span>
            <button className="mini-button">新建</button>
          </div>
          {snapshot.sessions.map((session) => (
            <button className="session-card active" key={session.id}>
              <strong>{session.title}</strong>
              <span>{runtimeSettings.workspace.defaultWorkspace || session.workspace}</span>
            </button>
          ))}
        </section>

        <section className="sidebar-section grow">
          <div className="section-heading">
            <span>智能体列表</span>
          </div>
          <div className="agent-list">
            {snapshot.agents.map((agent) => (
              <AgentPill
                key={agent.id}
                agent={agent}
                active={activeAgent?.id === agent.id}
                onActivate={() => handleActivateAgent(agent.id)}
              />
            ))}
          </div>
        </section>

        <div className={`connection-card ${mode}`}>
          <CircleDot size={14} />
          <div>
            <strong>{mode === "live" ? "本地 API 已连接" : "演示模式"}</strong>
            <span>{mode === "live" ? "127.0.0.1:3939" : "服务不可用"}</span>
          </div>
        </div>
      </aside>

      {activeView === "settings" ? (
        <SettingsCenter settings={settings} status={settingsStatus} onSave={handleSaveSettings} />
      ) : (
      <section className="workspace" id="team">
        <header className="topbar">
          <div>
            <p className="eyebrow">Team mode preview</p>
            <h2>{activeSession?.title ?? "No active session"}</h2>
            <p className="muted">
              Leader delegates work, teammates run in parallel, approvals stay visible.
            </p>
          </div>
          <div className="topbar-actions">
            <label className="runtime-select">
              <span>模型服务</span>
              <select
                value={activeRuntimeProvider?.id ?? ""}
                onChange={(event) => void handleWorkbenchRuntimeChange(event.target.value)}
              >
                {settings.providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.connected ? "鈼?" : "鈼?"}
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="runtime-select">
              <span>模型</span>
              <select
                value={activeRuntimeModel}
                onChange={(event) => void handleWorkbenchRuntimeChange(activeRuntimeProvider?.id ?? "", event.target.value)}
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
        </header>

        {error ? (
          <div className="notice notice-with-actions">
            <span>API note: {error}. The workbench is using demo data until the server is available.</span>
            <button
              className="mini-button"
              disabled={recoveringSettings}
              onClick={() => void handleRecoverSettings(false)}
              type="button"
            >
              {recoveringSettings ? "恢复中..." : "恢复本地设置"}
            </button>
          </div>
        ) : null}

        <section className="hero-grid">
          <article className="leader-card">
            <div className="card-title-row">
              <span className="role-pill">Leader</span>
              <span className="runtime-pill">
                <Terminal size={14} />
                {activeAgent?.runtime ?? "runtime"}
              </span>
            </div>
            <h3>{activeAgent?.name ?? "Cowork Agent"}</h3>
            <p>{activeAgent?.description ?? "Coordinates the team and owns final synthesis."}</p>
            <div className="leader-stats">
              <Metric label="Agents" value={String(teamAgents.length)} />
              <Metric label="Skills" value={String(snapshot.skills.filter((skill) => skill.enabled).length)} />
              <Metric label="Approvals" value={String(activeApprovals)} />
            </div>
          </article>

          <article className="team-map" id="agents">
            <div className="panel-heading compact">
              <div>
                <p className="eyebrow">Parallel teammates</p>
                <h3>Agent team</h3>
              </div>
              <Users size={18} />
            </div>
            <div className="team-node-row">
              {teamAgents.map((agent, index) => (
                <TeamNode key={agent.id} agent={agent} index={index} />
              ))}
            </div>
          </article>
        </section>

        <div className="work-grid">
          <section className="cowork-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Cowork thread</p>
                <h3>Shared command stream</h3>
              </div>
              <span className="status ready">
                <Zap size={14} />
                Live sync
              </span>
            </div>

            <div className="message-list">
              {activeMessages.length === 0 ? (
                <EmptyState title="No messages yet" detail="Send a request to start the team session." />
              ) : (
                activeMessages.map((message) => <MessageBubble key={message.id} message={message} />)
              )}
            </div>

            <form className="composer" onSubmit={handleSend}>
              <input
                aria-label="Message"
                placeholder="Ask the leader to plan, delegate, run, review, or summarize..."
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button className="primary-button" disabled={sending || !draft.trim()} type="submit">
                <Send size={15} />
                {sending ? "生成中..." : "发送"}
              </button>
            </form>
          </section>

          <section className="task-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Team board</p>
                <h3>Delegated tasks</h3>
              </div>
              <ListChecks size={18} />
            </div>
            <div className="task-list">
              {taskBoard.map((task) => (
                <TaskCard key={task.id} task={task} agents={snapshot.agents} />
              ))}
            </div>
          </section>
        </div>
      </section>
      )}

      <aside className="right-dock">
        <ProviderStatusPanel
          providers={settings.providers}
          onOpenSettings={() => {
            window.location.hash = "settings";
            setActiveView("settings");
          }}
        />

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

        <section className={`panel-block workspace-context-block${workspaceContextCollapsed ? " collapsed" : ""}`}>
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
              result={workspaceList}
              onOpenFile={setSelectedWorkspaceFile}
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
    </main>
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
  settings,
  status,
  onSave
}: {
  settings: AppSettings;
  status: string | null;
  onSave: (settings: AppSettings, providerSecrets?: ProviderSecretUpdate[]) => Promise<AppSettings>;
}) {
  const [draft, setDraft] = useState(settings);
  const [localStatus, setLocalStatus] = useState<string | null>(status);
  const [desktopStatus, setDesktopStatus] = useState<DesktopStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("providers");
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    setLocalStatus(status);
  }, [status]);

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

  function updateAgent(agentId: string, patch: Partial<AgentProfile>) {
    updateDraft({
      assistant: {
        ...draft.assistant,
        agents: draft.assistant.agents.map((agent) => (agent.id === agentId ? { ...agent, ...patch } : agent))
      }
    });
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
      <header className="topbar">
        <div>
          <p className="eyebrow">设置中心</p>
          <h2>应用设置</h2>
          <p className="muted">
            模型服务、默认模型、助手技能、界面字体、权限审批和桌面诊断都集中在这里配置。
          </p>
        </div>
        <div className="topbar-actions">
          <button className="primary-button" disabled={saving} onClick={() => void persist(draft).catch(() => undefined)} type="button">
            {saving ? "保存中..." : "保存全部"}
          </button>
        </div>
      </header>

      {localStatus ? <div className="notice">{localStatus}</div> : null}

      <div className="settings-layout">
        <aside className="settings-nav" aria-label="Settings sections">
          {settingsTabs.map((tab) => (
            <button
              className={activeTab === tab.id ? "settings-nav-button active" : "settings-nav-button"}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              <strong>{tab.label}</strong>
              <span>{tab.detail}</span>
            </button>
          ))}
        </aside>

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
    updatedAt: new Date().toISOString()
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

function MessageBubble({ message }: { message: ChatMessage }) {
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
      {message.toolCalls?.length ? (
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
  result,
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
  result: WorkspaceListResult | null;
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
      )}
    </div>
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
