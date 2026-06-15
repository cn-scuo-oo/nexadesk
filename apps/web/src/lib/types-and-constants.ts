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
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen
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
  type SkillHubListing,
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
import { Sidebar } from "./components/Sidebar";
import { SkillsHubView } from "./components/SkillsHubView";
import { EmptyState } from "./components/EmptyState";

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
const contextPanelStorageKey = "nexadesk.contextPanel.open";
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
