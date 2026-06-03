export type AppView =
  | "new"
  | "thread"
  | "search"
  | "scheduled"
  | "runtime"
  | "skills"
  | "mcp"
  | "agents"
  | "memory"
  | "settings";

export type SettingsTab =
  | "providers"
  | "model"
  | "engines"
  | "assistants"
  | "skills"
  | "appearance"
  | "workspace"
  | "permissions"
  | "memory"
  | "im"
  | "email"
  | "shortcuts"
  | "about"
  | "desktop";

export type WorkspaceContextView = "files" | "search";

export const settingsTabs: Array<{ id: SettingsTab; label: string; detail: string }> = [
  { id: "providers", label: "模型服务", detail: "API、Key、Base URL" },
  { id: "model", label: "默认模型", detail: "工作台模型切换" },
  { id: "engines", label: "Agent 引擎", detail: "Codex、Claude、CLI" },
  { id: "assistants", label: "内置助手", detail: "Cowork、Office、报告" },
  { id: "skills", label: "技能系统", detail: "启用、禁用、自定义" },
  { id: "appearance", label: "界面字体", detail: "主题、语言、字号" },
  { id: "workspace", label: "工作区", detail: "目录、导出、访问范围" },
  { id: "permissions", label: "权限审批", detail: "工具风险策略" },
  { id: "memory", label: "记忆", detail: "项目、会话、长期记忆" },
  { id: "im", label: "IM 集成", detail: "飞书、钉钉、Telegram" },
  { id: "email", label: "邮件", detail: "IMAP/SMTP 配置" },
  { id: "shortcuts", label: "快捷键", detail: "键盘操作与自定义" },
  { id: "about", label: "关于", detail: "版本、许可证、仓库" },
  { id: "desktop", label: "桌面诊断", detail: "安装、日志、安全存储" }
];

export const settingsTabGroups: Array<{ title: string; tabs: SettingsTab[] }> = [
  { title: "模型与运行", tabs: ["providers", "model", "engines"] },
  { title: "助手与工具", tabs: ["assistants", "skills", "permissions", "memory"] },
  { title: "通讯与集成", tabs: ["im", "email"] },
  { title: "应用", tabs: ["appearance", "workspace", "shortcuts", "about", "desktop"] }
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
  "memory",
  "settings"
]);

export function readInitialAppView(): AppView {
  const hash = window.location.hash.replace(/^#/, "") as AppView;
  if (hash === "settings") {
    return "new";
  }
  return appViews.has(hash) ? hash : "new";
}

export function readStoredBoolean(key: string, fallback: boolean) {
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

export function writeStoredBoolean(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? "true" : "false");
  } catch {
    // Local storage can be unavailable in hardened browser contexts.
  }
}

export function readStoredWorkspaceContextView(key: string): WorkspaceContextView {
  if (typeof window === "undefined") {
    return "files";
  }

  try {
    const value = window.localStorage.getItem(key);
    return value === "search" ? "search" : "files";
  } catch {
    return "files";
  }
}

export function writeStoredWorkspaceContextView(key: string, view: WorkspaceContextView) {
  try {
    window.localStorage.setItem(key, view);
  } catch {
    // Local storage can be unavailable in hardened browser contexts.
  }
}
