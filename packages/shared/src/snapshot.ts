import type { ModelProvider } from "./provider.js";
import type { AgentProfile } from "./agent.js";
import type { SkillProfile } from "./skill.js";
import type { AgentSession } from "./agent.js";
import type { ChatMessage } from "./chat.js";
import type { WorkspaceFile } from "./workspace.js";
import type { PermissionRequest, ApprovalHistoryEntry } from "./permission.js";
import type { AutomationJob, AutomationRun } from "./automation.js";
import type { SkillHubListing } from "./skill.js";
import type { ImAgentChannel } from "./im.js";
import type { WorkspaceArtifact } from "./workspace.js";

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
  automationRuns: AutomationRun[];
  activity: ActivityEvent[];
  skillHub?: SkillHubListing[];
  imChannels?: ImAgentChannel[];
  artifacts?: WorkspaceArtifact[];
}