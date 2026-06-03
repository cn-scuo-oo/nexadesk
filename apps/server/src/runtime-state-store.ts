import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type {
  ActivityEvent,
  AgentSession,
  AppSnapshot,
  ApprovalHistoryEntry,
  AutomationJob,
  AutomationRun,
  ChatMessage,
  PermissionRequest,
  RuntimeTelemetryEntry
} from "@nexadesk/shared";
import type { AgentToolRequest } from "./agent-tools.js";
import { getEnv } from "./server-utils.js";
import {
  getAllMessages,
  getAllSessions,
  getAllTelemetry,
  initDatabase,
  insertTelemetry,
  replaceMessages,
  replaceSessions,
  upsertMessage,
  upsertSession
} from "./sqlite-store.js";

export type PendingToolApprovalRecord = {
  approvalId: string;
  request: AgentToolRequest;
  sessionId: string;
  agentId: string;
  messageId: string;
  toolCallId: string;
};

type RuntimeStateFile = {
  version: 1;
  savedAt: string;
  sessions: AgentSession[];
  messages: ChatMessage[];
  approvals?: PermissionRequest[];
  approvalHistory?: ApprovalHistoryEntry[];
  pendingToolApprovals?: PendingToolApprovalRecord[];
  runtimeTelemetry?: RuntimeTelemetryEntry[];
  activity: ActivityEvent[];
  automations: AutomationJob[];
  automationRuns?: AutomationRun[];
};

const repoRoot = resolve(getEnv("NEXADESK_REPO_ROOT", "AION_LITE_REPO_ROOT") ?? process.cwd());
const dataDir = getEnv("NEXADESK_DATA_DIR", "AION_LITE_DATA_DIR") ?? join(repoRoot, "data");
export const runtimeStatePath =
  getEnv("NEXADESK_RUNTIME_STATE_PATH", "AION_LITE_RUNTIME_STATE_PATH") ?? join(dataDir, "runtime-state.json");

let sqliteReady = false;

function ensureSqliteReady() {
  if (!sqliteReady) {
    initDatabase(dataDir);
    sqliteReady = true;
  }
}

export async function loadRuntimeState(snapshot: AppSnapshot): Promise<PendingToolApprovalRecord[]> {
  ensureSqliteReady();
  const saved = await readRuntimeState();
  const persistedSessions = getAllSessions();
  const persistedMessages = getAllMessages();

  if (persistedSessions.length) {
    snapshot.sessions = persistedSessions;
  } else if (saved?.sessions.length) {
    snapshot.sessions = saved.sessions;
    replaceSessions(snapshot.sessions);
  } else {
    replaceSessions(snapshot.sessions);
  }

  if (persistedMessages.length) {
    snapshot.messages = persistedMessages;
  } else if (saved?.messages.length) {
    snapshot.messages = saved.messages;
    replaceMessages(snapshot.messages);
  } else {
    replaceMessages(snapshot.messages);
  }

  if (!saved) {
    await saveRuntimeState(snapshot);
    return [];
  }

  snapshot.approvals = saved.approvals ?? snapshot.approvals;
  snapshot.approvalHistory = saved.approvalHistory ?? snapshot.approvalHistory;
  snapshot.activity = saved.activity.length ? saved.activity.slice(0, 50) : snapshot.activity;
  snapshot.automations = saved.automations.length ? saved.automations : snapshot.automations;
  snapshot.automationRuns = saved.automationRuns?.slice(0, 100) ?? snapshot.automationRuns;
  return saved.pendingToolApprovals ?? [];
}

export async function saveRuntimeState(
  snapshot: AppSnapshot,
  pendingToolApprovals: PendingToolApprovalRecord[] = [],
  runtimeTelemetry: RuntimeTelemetryEntry[] = []
): Promise<void> {
  ensureSqliteReady();
  replaceSessions(snapshot.sessions);
  replaceMessages(snapshot.messages);
  for (const entry of runtimeTelemetry.slice(0, 100)) {
    insertTelemetry(entry);
  }

  const state: RuntimeStateFile = {
    version: 1,
    savedAt: new Date().toISOString(),
    sessions: snapshot.sessions,
    messages: snapshot.messages.slice(-500),
    approvals: snapshot.approvals,
    approvalHistory: snapshot.approvalHistory.slice(0, 100),
    pendingToolApprovals,
    runtimeTelemetry: runtimeTelemetry.slice(0, 100),
    activity: snapshot.activity.slice(0, 50),
    automations: snapshot.automations,
    automationRuns: snapshot.automationRuns.slice(0, 100)
  };

  await mkdir(dirname(runtimeStatePath), { recursive: true });
  const tempPath = `${runtimeStatePath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(tempPath, runtimeStatePath);
}

export async function loadRuntimeTelemetry(): Promise<RuntimeTelemetryEntry[]> {
  ensureSqliteReady();
  const persisted = getAllTelemetry(100);
  if (persisted.length) {
    return persisted;
  }
  const saved = await readRuntimeState();
  const entries = saved?.runtimeTelemetry?.slice(0, 100) ?? [];
  for (const entry of entries) {
    insertTelemetry(entry);
  }
  return entries;
}

export function persistSession(session: AgentSession): void {
  ensureSqliteReady();
  upsertSession(session);
}

export function persistMessage(message: ChatMessage): void {
  ensureSqliteReady();
  upsertMessage(message);
}

export function persistTelemetryEntry(entry: RuntimeTelemetryEntry): void {
  ensureSqliteReady();
  insertTelemetry(entry);
}

async function readRuntimeState(): Promise<RuntimeStateFile | null> {
  try {
    const parsed = JSON.parse(await readFile(runtimeStatePath, "utf8")) as Partial<RuntimeStateFile>;
    if (!isRuntimeStateFile(parsed)) {
      return null;
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function isRuntimeStateFile(value: Partial<RuntimeStateFile>): value is RuntimeStateFile {
  return (
    value.version === 1 &&
    Array.isArray(value.sessions) &&
    Array.isArray(value.messages) &&
    Array.isArray(value.activity) &&
    Array.isArray(value.automations)
  );
}
