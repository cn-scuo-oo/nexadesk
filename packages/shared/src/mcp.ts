import type { PermissionPolicy } from "./permission.js";

export type McpToolPolicy = {
  toolId: string;
  serverId: string;
  permission: PermissionPolicy;
  note?: string;
};

export type McpServerTransport = "stdio" | "http";

export interface McpServerSettings {
  id: string;
  name: string;
  description: string;
  transport: McpServerTransport;
  enabled: boolean;
  command?: string;
  args?: string[];
  url?: string;
}

export interface McpToolDefinition {
  id: string;
  serverId: string;
  serverName: string;
  name: string;
  title?: string;
  description: string;
  inputSchema?: unknown;
}

export interface McpSettings {
  servers: McpServerSettings[];
}

export interface McpServerTestRequest {
  server: McpServerSettings;
  timeoutMs?: number;
}

export interface McpServerTestResult {
  ok: boolean;
  message: string;
  checkedAt: string;
  transport: McpServerTransport;
  resolvedTarget?: string;
  status?: number;
}

export interface McpServerToolsRequest {
  server: McpServerSettings;
  timeoutMs?: number;
}

export interface McpServerToolsResult {
  ok: boolean;
  message: string;
  checkedAt: string;
  serverId: string;
  transport: McpServerTransport;
  tools: McpToolDefinition[];
  resolvedTarget?: string;
  status?: number;
}