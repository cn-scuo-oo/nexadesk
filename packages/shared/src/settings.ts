import type { ProviderSettings, ProviderStatusSettings } from "./provider.js";
import type { AgentProfile, AgentEngineSettings } from "./agent.js";
import type { SkillProfile } from "./skill.js";
import type { PermissionPolicy } from "./permission.js";
import type { McpSettings, McpToolPolicy } from "./mcp.js";
import type { MemoryEntry, SessionSummary } from "./memory.js";
import type { ActivityEvent } from "./snapshot.js";

export type ThemeMode = "system" | "light" | "dark";
export type InterfaceDensity = "compact" | "comfortable";
export type AppLanguage = "en" | "zh-CN";

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
  mcpToolPolicies: McpToolPolicy[];
}

export interface DesktopAppSettings {
  launchAtStartup: boolean;
  autoUpdate: boolean;
  telemetry: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
}

export interface MemorySettings {
  projectMemory: boolean;
  conversationMemory: boolean;
  longTermMemory: boolean;
  retentionDays: number;
  notes: string;
}

export interface ShortcutSettings {
  sendMessage: string;
  commandPalette: string;
  newTask: string;
  openSettings: string;
  toggleWorkspaceContext: string;
}

export interface AboutSettings {
  releaseChannel: "stable" | "beta" | "dev";
  checkUpdates: boolean;
  repositoryUrl: string;
  license: string;
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
  mcp: McpSettings;
  memory: MemorySettings;
  memoryEntries: MemoryEntry[];
  sessionSummaries: SessionSummary[];
  shortcuts: ShortcutSettings;
  about: AboutSettings;
  app: DesktopAppSettings;
  updatedAt: string;
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

// Re-export ProviderSecretUpdate for convenience
export type { ProviderSecretUpdate } from "./provider.js";