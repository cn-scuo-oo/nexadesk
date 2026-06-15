export type AgentStatus = "idle" | "running" | "waiting_approval" | "failed";

export type AgentToolName =
  | "list_dir"
  | "read_file"
  | "write_file"
  | "run_command"
  | "search"
  | "browser"
  | "image_generate";

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

export interface AgentEngineDetectionRecord {
  engineId: AgentEngineId;
  installed: boolean;
  command?: string;
  resolvedPath?: string;
  version?: string;
  configPath?: string;
  setupStatus: AgentEngineSetupStatus;
  message: string;
  checkedAt: string;
}

export interface AgentEngineDetectionResult {
  engines: AgentEngineSettings[];
  detections: AgentEngineDetectionRecord[];
  checkedAt: string;
}

export interface AgentProfile {
  id: string;
  name: string;
  description: string;
  runtime: string;
  engineId?: AgentEngineId;
  providerId: string;
  status: AgentStatus;
  skills: string[];
  mcpToolIds: string[];
  enabled: boolean;
  category: "cowork" | "code" | "office" | "file" | "report" | "custom";
  instructions: string;
}

export interface AgentSession {
  id: string;
  title: string;
  workspace: string;
  agentIds: string[];
  activeAgentId: string;
  updatedAt: string;
  pinned?: boolean;
}