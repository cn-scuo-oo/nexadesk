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
