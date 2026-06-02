export type AgentStatus = "idle" | "running" | "waiting_approval" | "failed";

export type ProviderKind =
  | "local"
  | "openai_compatible"
  | "anthropic"
  | "google"
  | "custom";

export type ProviderApiMode =
  | "responses"
  | "chat_completions"
  | "anthropic_messages"
  | "ollama_generate";

export type ProviderCapability =
  | "streaming"
  | "function_calling"
  | "vision"
  | "web_search"
  | "file_search"
  | "structured_output";

export type PermissionRisk = "low" | "medium" | "high";
export type ApprovalDecision = "approved" | "rejected" | "failed";

export type AgentToolName =
  | "list_dir"
  | "read_file"
  | "write_file"
  | "run_command"
  | "search"
  | "browser"
  | "image_generate";

export interface ModelProvider {
  id: string;
  name: string;
  kind: ProviderKind;
  apiMode: ProviderApiMode;
  connected: boolean;
  baseUrl?: string;
  models: string[];
  capabilities: ProviderCapability[];
}

export interface ProviderSettings extends ModelProvider {
  defaultModel: string;
  apiKeyConfigured: boolean;
}

export type ThemeMode = "system" | "light" | "dark";
export type InterfaceDensity = "compact" | "comfortable";
export type AppLanguage = "en" | "zh-CN";
export type PermissionPolicy = "ask" | "allow" | "deny";

export type AgentEngineId =
  | "nexadesk_builtin"
  | "codex_cli"
  | "claude_code"
  | "openclaw"
  | "hermes"
  | "opencode"
  | "qwen_code"
  | "deepseek_tui";

export type AgentEngineKind = "builtin" | "cli" | "runtime";
export type AgentEngineConfigSource = "nexadesk_model" | "local_cli";
export type AgentEnginePermissionMode = "ask" | "auto" | "conservative" | "bypass";
export type AgentEngineSetupStatus = "ready" | "needs_setup" | "not_installed";

export type AgentEngineCapability =
  | "chat"
  | "streaming"
  | "tools"
  | "filesystem"
  | "terminal"
  | "mcp"
  | "memory"
  | "external_cli";

export interface AgentEngineSettings {
  id: AgentEngineId;
  name: string;
  description: string;
  kind: AgentEngineKind;
  enabled: boolean;
  installed: boolean;
  command?: string;
  configPath?: string;
  configSource: AgentEngineConfigSource;
  providerId?: string;
  model?: string;
  permissionMode: AgentEnginePermissionMode;
  setupStatus: AgentEngineSetupStatus;
  capabilities: AgentEngineCapability[];
}

export interface AppearanceSettings {
  theme: ThemeMode;
  language: AppLanguage;
  fontFamily: string;
  fontSize: number;
  density: InterfaceDensity;
}

export interface WorkspaceSettings {
  defaultWorkspace: string;
  exportDirectory: string;
  allowedRoots: string[];
}

export interface PermissionSettings {
  shell: PermissionPolicy;
  fileWrite: PermissionPolicy;
  network: PermissionPolicy;
  browser: PermissionPolicy;
  mcp: PermissionPolicy;
  automation: PermissionPolicy;
  autoApproveLowRisk: boolean;
}

export interface DesktopAppSettings {
  launchAtStartup: boolean;
  autoUpdate: boolean;
  telemetry: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
}

export interface ModelRuntimeSettings {
  activeProviderId: string;
  activeModel: string;
}

export interface AssistantRuntimeSettings {
  agents: AgentProfile[];
  skills: SkillProfile[];
  engines: AgentEngineSettings[];
}

export interface AppSettings {
  providers: ProviderSettings[];
  model: ModelRuntimeSettings;
  assistant: AssistantRuntimeSettings;
  providerStatus: ProviderStatusSettings;
  appearance: AppearanceSettings;
  workspace: WorkspaceSettings;
  permissions: PermissionSettings;
  app: DesktopAppSettings;
  updatedAt: string;
}

export interface ProviderSecretUpdate {
  providerId: string;
  apiKey?: string;
  clearApiKey?: boolean;
}

export interface SaveSettingsRequest {
  settings: AppSettings;
  providerSecrets?: ProviderSecretUpdate[];
}

export interface RecoverSettingsRequest {
  resetSecrets?: boolean;
}

export interface RecoverSettingsResult {
  settings: AppSettings;
  activity: ActivityEvent;
  backupPaths: string[];
  resetSecrets: boolean;
  warning?: string;
}

export interface ProviderTestRequest {
  provider: ProviderSettings;
  apiKey?: string;
  timeoutMs?: number;
}

export interface ProviderTestResult {
  ok: boolean;
  status?: number;
  message: string;
  checkedUrl?: string;
  checkedAt?: string;
}

export interface ProviderModelsRequest {
  provider: ProviderSettings;
  apiKey?: string;
  timeoutMs?: number;
}

export interface ProviderModelsResult {
  ok: boolean;
  status?: number;
  message: string;
  checkedUrl?: string;
  checkedAt?: string;
  models: string[];
}

export interface ProviderStatusRecord {
  ok: boolean;
  status?: number;
  message: string;
  checkedUrl?: string;
  checkedAt: string;
}

export interface ProviderModelsStatusRecord extends ProviderStatusRecord {
  models: string[];
}

export interface ProviderStatusSettings {
  tests: Record<string, ProviderStatusRecord>;
  modelRefreshes: Record<string, ProviderModelsStatusRecord>;
}

export interface DesktopStatus {
  appName: string;
  version: string;
  mode: "desktop" | "web";
  apiBase: string;
  dataDir?: string;
  settingsPath?: string;
  secretsPath?: string;
  runtimeStatePath?: string;
  logPath?: string;
  crashLogPath?: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  electronVersion?: string;
  uptimeSeconds: number;
  safeStorage: "available" | "fallback" | "unavailable";
  secretsEncrypted: boolean;
}

export interface SendMessageRequest {
  content: string;
  providerId?: string;
  model?: string;
  agentId?: string;
}

export type ChatStreamEvent =
  | { type: "user_message"; message: ChatMessage }
  | {
      type: "assistant_start";
      message: ChatMessage;
      provider: { id: string; name: string; model: string };
    }
  | { type: "assistant_delta"; messageId: string; delta: string }
  | { type: "tool_call"; messageId: string; toolCall: ToolCall }
  | { type: "tool_message"; message: ChatMessage }
  | { type: "approval_queued"; approval: PermissionRequest }
  | { type: "assistant_done"; message: ChatMessage; activity: ActivityEvent }
  | { type: "error"; message: string; messageId?: string };

export interface AgentProfile {
  id: string;
  name: string;
  description: string;
  runtime: string;
  engineId?: AgentEngineId;
  providerId: string;
  status: AgentStatus;
  skills: string[];
  enabled: boolean;
  category: "cowork" | "code" | "office" | "file" | "report" | "custom";
  instructions: string;
}

export interface SkillProfile {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  source: "built_in" | "custom" | "extension";
  instructions: string;
}

export interface ToolCall {
  id: string;
  name: AgentToolName | "model.stream";
  status: "queued" | "running" | "approved" | "rejected" | "completed" | "failed";
  risk: PermissionRisk;
  summary: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system" | "tool";
  author: string;
  content: string;
  createdAt: string;
  toolCalls?: ToolCall[];
}

export interface AgentSession {
  id: string;
  title: string;
  workspace: string;
  agentIds: string[];
  activeAgentId: string;
  updatedAt: string;
}

export interface WorkspaceFile {
  path: string;
  kind: "file" | "folder";
  changed: boolean;
}

export interface WorkspaceTreeEntry {
  name: string;
  path: string;
  kind: "file" | "folder";
  size?: number;
  modifiedAt?: string;
}

export interface WorkspaceListResult {
  root: string;
  path: string;
  entries: WorkspaceTreeEntry[];
  exists: boolean;
  error?: string;
}

export interface WorkspaceFilePreviewResult {
  root: string;
  path: string;
  name: string;
  content: string;
  size?: number;
  modifiedAt?: string;
  exists: boolean;
  truncated?: boolean;
  error?: string;
}

export type WorkspaceSearchMode = "name" | "content";

export interface WorkspaceSearchMatch {
  name: string;
  path: string;
  kind: "file" | "folder";
  size?: number;
  modifiedAt?: string;
  line?: number;
  preview?: string;
}

export interface WorkspaceSearchResult {
  root: string;
  path: string;
  query: string;
  mode: WorkspaceSearchMode;
  matches: WorkspaceSearchMatch[];
  searchedEntries: number;
  truncated?: boolean;
  error?: string;
}

export interface PermissionRequest {
  id: string;
  sessionId: string;
  agentId: string;
  action: string;
  risk: PermissionRisk;
  requestedAt: string;
  toolCallId?: string;
  messageId?: string;
  toolName?: AgentToolName;
}

export interface ApprovalHistoryEntry extends PermissionRequest {
  decision: ApprovalDecision;
  resolvedAt: string;
  reason?: string;
  resultSummary?: string;
}

export interface ResolveApprovalRequest {
  approved: boolean;
  reason?: string;
}

export interface AutomationJob {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  nextRun: string;
}

export interface ActivityEvent {
  id: string;
  level: "info" | "warning" | "error";
  title: string;
  detail: string;
  createdAt: string;
}

export interface AppSnapshot {
  providers: ModelProvider[];
  agents: AgentProfile[];
  skills: SkillProfile[];
  sessions: AgentSession[];
  messages: ChatMessage[];
  files: WorkspaceFile[];
  approvals: PermissionRequest[];
  approvalHistory: ApprovalHistoryEntry[];
  automations: AutomationJob[];
  activity: ActivityEvent[];
}

export function createDefaultProviders(): ModelProvider[] {
  return [
      {
        id: "ollama",
        name: "Ollama Local",
        kind: "local",
        apiMode: "ollama_generate",
        connected: true,
        baseUrl: "http://127.0.0.1:11434",
        models: ["qwen2.5-coder", "llama3.1", "deepseek-r1"],
        capabilities: ["streaming", "function_calling"]
      },
      {
        id: "lm-studio",
        name: "LM Studio",
        kind: "local",
        apiMode: "chat_completions",
        connected: false,
        baseUrl: "http://127.0.0.1:1234/v1",
        models: ["local-model"],
        capabilities: ["streaming", "function_calling", "structured_output"]
      },
      {
        id: "openai-compatible",
        name: "OpenAI Compatible / Custom",
        kind: "openai_compatible",
        apiMode: "chat_completions",
        connected: false,
        baseUrl: "https://api.example.com/v1",
        models: ["model-name"],
        capabilities: ["streaming", "function_calling", "structured_output"]
      },
      {
        id: "openai-official",
        name: "OpenAI Official",
        kind: "openai_compatible",
        apiMode: "responses",
        connected: false,
        baseUrl: "https://api.openai.com/v1",
        models: ["gpt-5", "gpt-5-mini", "gpt-4.1"],
        capabilities: [
          "streaming",
          "function_calling",
          "vision",
          "web_search",
          "file_search",
          "structured_output"
        ]
      },
      {
        id: "deepseek",
        name: "DeepSeek",
        kind: "openai_compatible",
        apiMode: "chat_completions",
        connected: false,
        baseUrl: "https://api.deepseek.com",
        models: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner"],
        capabilities: ["streaming", "function_calling", "structured_output"]
      },
      {
        id: "dashscope-qwen",
        name: "阿里云百炼 / 通义千问",
        kind: "openai_compatible",
        apiMode: "chat_completions",
        connected: false,
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        models: ["qwen-plus", "qwen-max", "qwen-turbo", "qwen-vl-plus"],
        capabilities: ["streaming", "function_calling", "vision", "structured_output"]
      },
      {
        id: "siliconflow-cn",
        name: "硅基流动 SiliconFlow",
        kind: "openai_compatible",
        apiMode: "chat_completions",
        connected: false,
        baseUrl: "https://api.siliconflow.cn/v1",
        models: ["deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct"],
        capabilities: ["streaming", "function_calling", "structured_output"]
      },
      {
        id: "moonshot",
        name: "月之暗面 Kimi",
        kind: "openai_compatible",
        apiMode: "chat_completions",
        connected: false,
        baseUrl: "https://api.moonshot.cn/v1",
        models: ["kimi-k2.6", "kimi-k2.5", "moonshot-v1-128k", "moonshot-v1-32k", "moonshot-v1-8k"],
        capabilities: ["streaming", "function_calling", "vision", "structured_output"]
      },
      {
        id: "zhipu",
        name: "智谱 GLM",
        kind: "openai_compatible",
        apiMode: "chat_completions",
        connected: false,
        baseUrl: "https://open.bigmodel.cn/api/paas/v4",
        models: ["glm-5.1", "glm-5-turbo", "glm-5", "glm-4.7", "glm-4.7-flash"],
        capabilities: ["streaming", "function_calling", "web_search", "structured_output"]
      },
      {
        id: "openrouter",
        name: "OpenRouter",
        kind: "openai_compatible",
        apiMode: "chat_completions",
        connected: false,
        baseUrl: "https://openrouter.ai/api/v1",
        models: ["openai/gpt-4.1", "anthropic/claude-sonnet-4.5", "deepseek/deepseek-chat"],
        capabilities: ["streaming", "function_calling", "structured_output"]
      },
      {
        id: "newapi",
        name: "NewAPI / OneAPI 网关",
        kind: "openai_compatible",
        apiMode: "chat_completions",
        connected: false,
        baseUrl: "http://127.0.0.1:3000/v1",
        models: ["gpt-4.1", "deepseek-chat", "qwen-plus"],
        capabilities: ["streaming", "function_calling", "vision", "structured_output"]
      },
      {
        id: "anthropic",
        name: "Anthropic",
        kind: "anthropic",
        apiMode: "anthropic_messages",
        connected: false,
        baseUrl: "https://api.anthropic.com",
        models: ["claude-sonnet-4.5"],
        capabilities: ["streaming", "function_calling", "vision"]
      }
    ];
}

export function createDefaultAgents(): AgentProfile[] {
  return [
    {
      id: "cowork",
      name: "Cowork 助手",
      description: "总控型协作助手，负责拆解任务、选择工具、协调其他助手并汇总结论。",
      runtime: "builtin",
      engineId: "nexadesk_builtin",
      providerId: "ollama",
      status: "running",
      skills: ["planning", "filesystem", "terminal", "web"],
      enabled: true,
      category: "cowork",
      instructions:
        "你是 Cowork 助手。先理解目标，再拆解步骤；需要工具时发起工具调用；高风险动作必须等待审批；最后用清晰中文汇总。"
    },
    {
      id: "code",
      name: "代码助手",
      description: "阅读代码、修改实现、解释架构、运行测试并做代码审查。",
      runtime: "builtin",
      engineId: "codex_cli",
      providerId: "ollama",
      status: "idle",
      skills: ["code-review", "filesystem", "terminal", "search"],
      enabled: true,
      category: "code",
      instructions:
        "你是代码助手。优先阅读现有代码和项目约定，保持改动小而可靠；运行必要检查；指出风险和测试缺口。"
    },
    {
      id: "word",
      name: "Word 助手",
      description: "生成、润色和整理 Word 文档、报告正文、合同和正式材料。",
      runtime: "builtin",
      engineId: "nexadesk_builtin",
      providerId: "openai-compatible",
      status: "idle",
      skills: ["word", "report-writing", "filesystem"],
      enabled: true,
      category: "office",
      instructions:
        "你是 Word 助手。输出结构化文档大纲和正文，注意标题层级、正式语气、可编辑性和交付格式。"
    },
    {
      id: "excel",
      name: "Excel 助手",
      description: "处理表格、公式、数据清洗、统计汇总和图表分析。",
      runtime: "builtin",
      engineId: "nexadesk_builtin",
      providerId: "openai-compatible",
      status: "idle",
      skills: ["excel", "data-analysis", "filesystem"],
      enabled: true,
      category: "office",
      instructions:
        "你是 Excel 助手。关注数据结构、公式正确性、汇总逻辑和图表表达，必要时说明计算口径。"
    },
    {
      id: "ppt",
      name: "PPT 助手",
      description: "制作演示文稿结构、页面文案、讲稿和视觉排版建议。",
      runtime: "builtin",
      engineId: "nexadesk_builtin",
      providerId: "openai-compatible",
      status: "idle",
      skills: ["ppt", "presentation-design", "filesystem"],
      enabled: true,
      category: "office",
      instructions:
        "你是 PPT 助手。先确定受众和目标，再生成页面结构、每页标题、要点、讲稿和视觉建议。"
    },
    {
      id: "file-organizer",
      name: "文件整理助手",
      description: "整理目录、批量重命名、分类归档、查找重复和生成文件清单。",
      runtime: "builtin",
      engineId: "nexadesk_builtin",
      providerId: "ollama",
      status: "idle",
      skills: ["filesystem", "search", "file-organize"],
      enabled: true,
      category: "file",
      instructions:
        "你是文件整理助手。先列出目录结构和整理方案；涉及移动、重命名、删除或写入时必须进入审批。"
    },
    {
      id: "report",
      name: "报告助手",
      description: "生成工程报告、分析报告、周报、评估材料和正式汇报文本。",
      runtime: "builtin",
      engineId: "nexadesk_builtin",
      providerId: "openai-compatible",
      status: "idle",
      skills: ["report-writing", "word", "data-analysis"],
      enabled: true,
      category: "report",
      instructions:
        "你是报告助手。输出应正式、清楚、有依据；先搭结构，再写结论、依据、问题和建议。"
    }
  ];
}

export function createDefaultAgentEngines(): AgentEngineSettings[] {
  return [
    {
      id: "nexadesk_builtin",
      name: "NexaDesk Built-in",
      description: "内置模型运行时，直接使用模型中心的 Provider、工具调用和审批队列。",
      kind: "builtin",
      enabled: true,
      installed: true,
      configSource: "nexadesk_model",
      providerId: "ollama",
      permissionMode: "ask",
      setupStatus: "ready",
      capabilities: ["chat", "streaming", "tools", "filesystem", "terminal"]
    },
    {
      id: "codex_cli",
      name: "Codex CLI",
      description: "复用本机 Codex CLI 作为代码型 Agent 引擎，适合项目修改、测试和审查。",
      kind: "cli",
      enabled: false,
      installed: false,
      command: "codex",
      configSource: "local_cli",
      permissionMode: "ask",
      setupStatus: "not_installed",
      capabilities: ["chat", "streaming", "tools", "filesystem", "terminal", "external_cli"]
    },
    {
      id: "claude_code",
      name: "Claude Code",
      description: "复用 Claude Code CLI 作为外部代码 Agent，引擎配置优先从本机 CLI 读取。",
      kind: "cli",
      enabled: false,
      installed: false,
      command: "claude",
      configSource: "local_cli",
      permissionMode: "ask",
      setupStatus: "not_installed",
      capabilities: ["chat", "streaming", "tools", "filesystem", "terminal", "external_cli"]
    },
    {
      id: "qwen_code",
      name: "Qwen Code",
      description: "面向通义千问代码工作流的外部 CLI 引擎，后续支持本机配置同步。",
      kind: "cli",
      enabled: false,
      installed: false,
      command: "qwen",
      configSource: "local_cli",
      permissionMode: "conservative",
      setupStatus: "not_installed",
      capabilities: ["chat", "streaming", "tools", "filesystem", "terminal", "external_cli"]
    },
    {
      id: "deepseek_tui",
      name: "DeepSeek-TUI",
      description: "面向 DeepSeek 本机 TUI/CLI 的 Agent 引擎，适合国内模型链路。",
      kind: "cli",
      enabled: false,
      installed: false,
      command: "deepseek",
      configSource: "local_cli",
      permissionMode: "conservative",
      setupStatus: "not_installed",
      capabilities: ["chat", "streaming", "tools", "filesystem", "terminal", "external_cli"]
    },
    {
      id: "openclaw",
      name: "OpenClaw",
      description: "OpenClaw runtime 引擎，后续用于扩展 MCP、IM 和插件化运行时。",
      kind: "runtime",
      enabled: false,
      installed: false,
      configSource: "nexadesk_model",
      permissionMode: "ask",
      setupStatus: "needs_setup",
      capabilities: ["chat", "streaming", "tools", "filesystem", "terminal", "mcp", "memory"]
    },
    {
      id: "hermes",
      name: "Hermes",
      description: "Hermes 外部 Agent 引擎占位，后续支持独立配置文件和会话接管。",
      kind: "runtime",
      enabled: false,
      installed: false,
      configSource: "local_cli",
      permissionMode: "ask",
      setupStatus: "needs_setup",
      capabilities: ["chat", "streaming", "tools", "filesystem", "terminal", "external_cli"]
    },
    {
      id: "opencode",
      name: "OpenCode",
      description: "OpenCode CLI 引擎占位，后续用于接入本机开源代码 Agent。",
      kind: "cli",
      enabled: false,
      installed: false,
      command: "opencode",
      configSource: "local_cli",
      permissionMode: "conservative",
      setupStatus: "not_installed",
      capabilities: ["chat", "streaming", "tools", "filesystem", "terminal", "external_cli"]
    }
  ];
}

export function createDefaultSkills(): SkillProfile[] {
  return [
    {
      id: "planning",
      name: "任务规划",
      description: "拆解目标、维护步骤、说明执行顺序和验收标准。",
      enabled: true,
      source: "built_in",
      instructions: "把复杂请求拆成明确步骤，持续标注已完成、进行中、待处理和风险。"
    },
    {
      id: "filesystem",
      name: "文件系统",
      description: "读文件、列目录、写文件和整理工作区文件。",
      enabled: true,
      source: "built_in",
      instructions: "读取和列目录可直接执行；写入、移动、删除等高影响动作必须先排队审批。"
    },
    {
      id: "terminal",
      name: "命令执行",
      description: "运行测试、构建、脚本和本地诊断命令。",
      enabled: true,
      source: "built_in",
      instructions: "命令执行属于高风险动作，必须解释目的并进入审批队列。"
    },
    {
      id: "search",
      name: "工作区搜索",
      description: "用关键词搜索代码、文档和配置。",
      enabled: true,
      source: "built_in",
      instructions: "优先使用精确关键词搜索，返回文件路径、行号和必要上下文。"
    },
    {
      id: "web",
      name: "网页读取",
      description: "审批后读取网页标题、描述和正文摘要。",
      enabled: true,
      source: "built_in",
      instructions: "访问外部网页需要审批，读取后总结来源、标题和关键内容。"
    },
    {
      id: "code-review",
      name: "代码审查",
      description: "检查 bug、回归风险、边界条件和测试缺口。",
      enabled: true,
      source: "built_in",
      instructions: "优先给出具体问题、文件位置和影响，再补充建议。"
    },
    {
      id: "word",
      name: "Word 文档",
      description: "生成正式文档、合同、说明书和报告正文。",
      enabled: true,
      source: "built_in",
      instructions: "生成适合 Word 编辑的标题层级、段落和表格建议。"
    },
    {
      id: "excel",
      name: "Excel 表格",
      description: "处理表格数据、公式、统计口径和图表建议。",
      enabled: true,
      source: "built_in",
      instructions: "说明数据列、公式逻辑、汇总方式和异常值处理。"
    },
    {
      id: "ppt",
      name: "PPT 演示",
      description: "生成幻灯片结构、页面要点、讲稿和设计建议。",
      enabled: true,
      source: "built_in",
      instructions: "按页输出标题、核心信息、视觉建议和讲稿备注。"
    },
    {
      id: "report-writing",
      name: "报告写作",
      description: "撰写分析报告、工程报告、总结和评估材料。",
      enabled: true,
      source: "built_in",
      instructions: "使用正式中文，突出结论、依据、问题、风险和建议。"
    },
    {
      id: "data-analysis",
      name: "数据分析",
      description: "整理数据口径、计算逻辑、对比分析和洞察结论。",
      enabled: true,
      source: "built_in",
      instructions: "明确数据来源、计算口径、异常值、结论和下一步分析建议。"
    },
    {
      id: "file-organize",
      name: "文件整理",
      description: "分类归档、命名规范、目录清单和整理方案。",
      enabled: true,
      source: "built_in",
      instructions: "先提出整理方案；实际改名、移动、删除或写入必须审批。"
    },
    {
      id: "presentation-design",
      name: "演示设计",
      description: "优化演示逻辑、版式、节奏和视觉层次。",
      enabled: true,
      source: "built_in",
      instructions: "面向受众设计信息层级，减少堆字，强调故事线和关键证据。"
    }
  ];
}

export function createDefaultSettings(
  providers: ModelProvider[] = createDefaultProviders(),
  now = new Date().toISOString()
): AppSettings {
  const firstProvider = providers[0];

  return {
    providers: providers.map((provider) => ({
      ...provider,
      defaultModel: provider.models[0] ?? "",
      apiKeyConfigured: false
    })),
    model: {
      activeProviderId: firstProvider?.id ?? "",
      activeModel: firstProvider?.models[0] ?? ""
    },
    assistant: {
      agents: createDefaultAgents(),
      skills: createDefaultSkills(),
      engines: createDefaultAgentEngines()
    },
    providerStatus: {
      tests: {},
      modelRefreshes: {}
    },
    appearance: {
      theme: "system",
      language: "zh-CN",
      fontFamily: "Inter, Microsoft YaHei",
      fontSize: 14,
      density: "comfortable"
    },
    workspace: {
      defaultWorkspace: "C:/Projects/demo-workspace",
      exportDirectory: "C:/Projects/demo-workspace/exports",
      allowedRoots: ["C:/Projects/demo-workspace"]
    },
    permissions: {
      shell: "ask",
      fileWrite: "ask",
      network: "ask",
      browser: "ask",
      mcp: "ask",
      automation: "deny",
      autoApproveLowRisk: false
    },
    app: {
      launchAtStartup: false,
      autoUpdate: false,
      telemetry: false,
      logLevel: "info"
    },
    updatedAt: now
  };
}

export function createDemoSnapshot(now = new Date().toISOString()): AppSnapshot {
  const agents = createDefaultAgents();
  const skills = createDefaultSkills();

  return {
    providers: createDefaultProviders(),
    agents,
    skills,
    sessions: [
      {
        id: "session-1",
        title: "Design a multi-agent workbench",
        workspace: "C:/Projects/demo-workspace",
        agentIds: agents.filter((agent) => agent.enabled).map((agent) => agent.id),
        activeAgentId: "cowork",
        updatedAt: now
      }
    ],
    messages: [
      {
        id: "msg-1",
        sessionId: "session-1",
        role: "user",
        author: "You",
        content: "Turn this into a multi-agent cowork workbench with real model and tool support.",
        createdAt: now
      },
      {
        id: "msg-2",
        sessionId: "session-1",
        role: "assistant",
        author: "Cowork 助手",
        content:
          "I split the request into a UI pass, runtime boundary pass, and approval-gate pass. Reviewer is waiting on terminal permission; Document Agent is preparing the assistant preset model.",
        createdAt: now,
        toolCalls: [
          {
            id: "tool-1",
            name: "run_command",
            status: "queued",
            risk: "high",
            summary: "Run typecheck and production build for the updated workbench."
          },
          {
            id: "tool-2",
            name: "read_file",
            status: "completed",
            risk: "low",
            summary: "读取文件：docs/roadmap.md"
          }
        ]
      },
      {
        id: "msg-tool-1",
        sessionId: "session-1",
        role: "tool",
        author: "read_file",
        content:
          "Phase 1 - Model Center\nPhase 2 - Cowork Agent\nPhase 3 - Assistants and Skills\nPhase 4 - Desktop Packaging",
        createdAt: now
      },
      {
        id: "msg-3",
        sessionId: "session-1",
        role: "assistant",
        author: "Word 助手",
        content:
          "Office workflows should be represented as first-class assistants, not hidden tools: PPT, Word, Excel, and report generation can each become reusable presets.",
        createdAt: now
      }
    ],
    files: [
      { path: "README.md", kind: "file", changed: true },
      { path: "apps/web/src/App.tsx", kind: "file", changed: true },
      { path: "apps/web/src/styles.css", kind: "file", changed: true },
      { path: "apps/server/src/index.ts", kind: "file", changed: true },
      { path: "packages/shared/src/index.ts", kind: "file", changed: true },
      { path: "docs", kind: "folder", changed: false }
    ],
    approvals: [
      {
        id: "approval-1",
        sessionId: "session-1",
        agentId: "reviewer",
        action: "Run typecheck and build in workspace",
        risk: "medium",
        requestedAt: now
      },
      {
        id: "approval-2",
        sessionId: "session-1",
        agentId: "cowork",
        action: "Allow shell command for runtime adapter probe",
        risk: "high",
        requestedAt: now
      }
    ],
    approvalHistory: [],
    automations: [
      {
        id: "daily-check",
        name: "Daily workspace check",
        schedule: "Every day at 09:00",
        enabled: false,
        nextRun: "Not scheduled"
      }
    ],
    activity: [
      {
        id: "activity-1",
        level: "info",
        title: "Workbench started",
        detail: "Demo data loaded and local API is ready.",
        createdAt: now
      }
    ]
  };
}
