import type {
  ActivityEvent,
  ApprovalHistoryEntry,
  AppSettings,
  AppSnapshot,
  ChatStreamEvent,
  ChatMessage,
  DesktopStatus,
  ProviderModelsRequest,
  ProviderModelsResult,
  RecoverSettingsResult,
  ProviderTestRequest,
  ProviderTestResult,
  SaveSettingsRequest,
  SendMessageRequest,
  WorkspaceFilePreviewResult,
  WorkspaceListResult
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

