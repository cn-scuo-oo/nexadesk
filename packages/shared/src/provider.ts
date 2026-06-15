export type ProviderKind = "local" | "openai_compatible" | "anthropic" | "google" | "custom";

export type ProviderApiMode = "responses" | "chat_completions" | "anthropic_messages" | "ollama_generate";

export type ProviderCapability =
  | "streaming"
  | "function_calling"
  | "vision"
  | "web_search"
  | "file_search"
  | "structured_output";

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

export interface ProviderSecretUpdate {
  providerId: string;
  apiKey?: string;
  clearApiKey?: boolean;
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