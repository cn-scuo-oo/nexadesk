import type {
  ActivityEvent,
  AgentSession,
  AgentEngineDetectionResult,
  ApprovalHistoryEntry,
  AppSettings,
  AppSnapshot,
  ChatStreamEvent,
  ChatMessage,
  DesktopStatus,
  McpServerToolsRequest,
  McpServerToolsResult,
  McpServerTestRequest,
  McpServerTestResult,
  ProviderModelsRequest,
  ProviderModelsResult,
  RecoverSettingsResult,
  ProviderTestRequest,
  ProviderTestResult,
  RuntimeTelemetryEntry,
  SaveSettingsRequest,
  SendMessageRequest,
  WorkspaceFilePreviewResult,
  WorkspaceListResult,
  WorkspaceSearchMode,
  WorkspaceSearchResult
} from "@nexadesk/shared";

const apiBase =
  (window as any).__NEXADESK_API_BASE__ ??
  (window as any).__AION_API_BASE__ ??
  new URLSearchParams(window.location.search).get("apiBase") ??
  "http://127.0.0.1:3939";

export async function fetchSnapshot(): Promise<AppSnapshot> {
  const response = await fetch(`${apiBase}/api/snapshot`);
  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }
  return response.json() as Promise<AppSnapshot>;
}

export async function fetchSettings(): Promise<AppSettings> {
  const response = await fetch(`${apiBase}/api/settings`);
  if (!response.ok) {
    throw new Error(`Settings request failed with ${response.status}`);
  }
  return response.json() as Promise<AppSettings>;
}

export async function fetchRuntimeTelemetry(): Promise<RuntimeTelemetryEntry[]> {
  const response = await fetch(`${apiBase}/api/runtime/telemetry`);
  if (!response.ok) {
    throw new Error(`Runtime telemetry request failed with ${response.status}`);
  }
  const result = (await response.json()) as { entries: RuntimeTelemetryEntry[] };
  return result.entries;
}

export async function saveRuntimeTelemetry(entries: RuntimeTelemetryEntry[]): Promise<RuntimeTelemetryEntry[]> {
  const response = await fetch(`${apiBase}/api/runtime/telemetry`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ entries })
  });
  if (!response.ok) {
    throw new Error(`Save runtime telemetry failed with ${response.status}`);
  }
  const result = (await response.json()) as { entries: RuntimeTelemetryEntry[] };
  return result.entries;
}

export async function fetchDesktopStatus(): Promise<DesktopStatus> {
  const response = await fetch(`${apiBase}/api/desktop/status`);
  if (!response.ok) {
    throw new Error(`Desktop status request failed with ${response.status}`);
  }
  return response.json() as Promise<DesktopStatus>;
}

export async function fetchWorkspaceList(path = "."): Promise<WorkspaceListResult> {
  const response = await fetch(`${apiBase}/api/workspace/list?path=${encodeURIComponent(path)}`);
  if (!response.ok) {
    throw new Error(`Workspace list request failed with ${response.status}`);
  }
  return response.json() as Promise<WorkspaceListResult>;
}

export async function fetchWorkspaceFile(path: string): Promise<WorkspaceFilePreviewResult> {
  const response = await fetch(`${apiBase}/api/workspace/file?path=${encodeURIComponent(path)}`);
  if (!response.ok) {
    throw new Error(`Workspace file request failed with ${response.status}`);
  }
  return response.json() as Promise<WorkspaceFilePreviewResult>;
}

export async function fetchWorkspaceSearch({
  query,
  mode,
  path = "."
}: {
  query: string;
  mode: WorkspaceSearchMode;
  path?: string;
}): Promise<WorkspaceSearchResult> {
  const params = new URLSearchParams({ query, mode, path });
  const response = await fetch(`${apiBase}/api/workspace/search?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Workspace search request failed with ${response.status}`);
  }
  return response.json() as Promise<WorkspaceSearchResult>;
}

export async function saveSettings(payload: SaveSettingsRequest): Promise<{
  settings: AppSettings;
  activity: ActivityEvent;
}> {
  const response = await fetch(`${apiBase}/api/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`Save settings failed with ${response.status}`);
  }
  return response.json() as Promise<{ settings: AppSettings; activity: ActivityEvent }>;
}

export async function recoverSettings(resetSecrets = false): Promise<RecoverSettingsResult> {
  const response = await fetch(`${apiBase}/api/settings/recover`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ resetSecrets })
  });
  if (!response.ok) {
    throw new Error(`Recover settings failed with ${response.status}`);
  }
  return response.json() as Promise<RecoverSettingsResult>;
}

export async function testProvider(payload: ProviderTestRequest): Promise<ProviderTestResult> {
  const response = await fetch(`${apiBase}/api/providers/test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`Provider test failed with ${response.status}`);
  }
  return response.json() as Promise<ProviderTestResult>;
}

export async function fetchProviderModels(payload: ProviderModelsRequest): Promise<ProviderModelsResult> {
  const response = await fetch(`${apiBase}/api/providers/models`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`Provider models request failed with ${response.status}`);
  }
  return response.json() as Promise<ProviderModelsResult>;
}

export async function testMcpServer(payload: McpServerTestRequest): Promise<McpServerTestResult> {
  const response = await fetch(`${apiBase}/api/mcp/test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`MCP test failed with ${response.status}`);
  }
  return response.json() as Promise<McpServerTestResult>;
}

export async function fetchMcpServerTools(payload: McpServerToolsRequest): Promise<McpServerToolsResult> {
  const response = await fetch(`${apiBase}/api/mcp/tools`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`MCP tools request failed with ${response.status}`);
  }
  return response.json() as Promise<McpServerToolsResult>;
}

export async function updateSession(
  sessionId: string,
  patch: { title?: string; pinned?: boolean }
): Promise<{ sessions: AgentSession[]; activity: ActivityEvent }> {
  const response = await fetch(`${apiBase}/api/sessions/${sessionId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(patch)
  });
  if (!response.ok) {
    throw new Error(`Session update failed with ${response.status}`);
  }
  return response.json() as Promise<{ sessions: AgentSession[]; activity: ActivityEvent }>;
}

export async function deleteSession(sessionId: string): Promise<{ sessions: AgentSession[]; activity: ActivityEvent }> {
  const response = await fetch(`${apiBase}/api/sessions/${sessionId}`, {
    method: "DELETE"
  });
  if (!response.ok) {
    throw new Error(`Session delete failed with ${response.status}`);
  }
  return response.json() as Promise<{ sessions: AgentSession[]; activity: ActivityEvent }>;
}

export async function detectAgentEngines(): Promise<AgentEngineDetectionResult> {
  const response = await fetch(`${apiBase}/api/agent-engines/detect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`Agent engine detection failed with ${response.status}`);
  }
  return response.json() as Promise<AgentEngineDetectionResult>;
}

export async function sendMessage(sessionId: string, content: string): Promise<{
  messages: ChatMessage[];
  activity: ActivityEvent;
}> {
  const response = await fetch(`${apiBase}/api/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ content })
  });
  if (!response.ok) {
    throw new Error(`Message request failed with ${response.status}`);
  }
  return response.json() as Promise<{ messages: ChatMessage[]; activity: ActivityEvent }>;
}

export async function streamMessage(
  sessionId: string,
  payload: SendMessageRequest,
  onEvent: (event: ChatStreamEvent) => void
): Promise<void> {
  const response = await fetch(`${apiBase}/api/sessions/${sessionId}/messages/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok || !response.body) {
    throw new Error(`Message stream failed with ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = drainSseBuffer(buffer, onEvent);
  }
  buffer += decoder.decode();
  drainSseBuffer(`${buffer}\n\n`, onEvent);
}

export async function resolveApproval(approvalId: string, approved: boolean, reason?: string): Promise<{
  activity: ActivityEvent;
  history: ApprovalHistoryEntry;
  messages?: ChatMessage[];
}> {
  const response = await fetch(`${apiBase}/api/approvals/${approvalId}/resolve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ approved, reason })
  });
  if (!response.ok) {
    throw new Error(`Approval request failed with ${response.status}`);
  }
  return response.json() as Promise<{ activity: ActivityEvent; history: ApprovalHistoryEntry; messages?: ChatMessage[] }>;
}

export function subscribeActivity(onEvent: (event: ActivityEvent) => void) {
  const source = new EventSource(`${apiBase}/api/events`);
  source.addEventListener("activity", (event) => {
    onEvent(JSON.parse(event.data) as ActivityEvent);
  });
  source.onerror = () => {
    source.close();
  };
  return () => source.close();
}

function drainSseBuffer(buffer: string, onEvent: (event: ChatStreamEvent) => void) {
  let remaining = buffer;
  let boundary = remaining.indexOf("\n\n");
  while (boundary !== -1) {
    const block = remaining.slice(0, boundary);
    remaining = remaining.slice(boundary + 2);
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (data) {
      onEvent(JSON.parse(data) as ChatStreamEvent);
    }
    boundary = remaining.indexOf("\n\n");
  }
  return remaining;
}

