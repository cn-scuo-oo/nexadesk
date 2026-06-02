import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type {
  AgentSession,
  ApprovalHistoryEntry,
  AppSnapshot,
  ChatMessage,
  ActivityEvent,
  AutomationJob,
  PermissionRequest
} from "@nexadesk/shared";
import type { AgentToolRequest } from "./agent-tools.js";

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
  activity: ActivityEvent[];
  automations: AutomationJob[];
};

const repoRoot = resolve(getEnv("NEXADESK_REPO_ROOT", "AION_LITE_REPO_ROOT") ?? process.cwd());
const dataDir = getEnv("NEXADESK_DATA_DIR", "AION_LITE_DATA_DIR") ?? join(repoRoot, "data");
export const runtimeStatePath =
  getEnv("NEXADESK_RUNTIME_STATE_PATH", "AION_LITE_RUNTIME_STATE_PATH") ?? join(dataDir, "runtime-state.json");

export async function loadRuntimeState(snapshot: AppSnapshot): Promise<PendingToolApprovalRecord[]> {
  const saved = await readRuntimeState();
  if (!saved) {
    await saveRuntimeState(snapshot);
    return [];
  }

  if (saved.sessions.length) {
    snapshot.sessions = saved.sessions;
  }
  if (saved.messages.length) {
    snapshot.messages = saved.messages;
  }
  snapshot.approvals = saved.approvals ?? snapshot.approvals;
  snapshot.approvalHistory = saved.approvalHistory ?? snapshot.approvalHistory;
  snapshot.activity = saved.activity.length ? saved.activity.slice(0, 50) : snapshot.activity;
  snapshot.automations = saved.automations.length ? saved.automations : snapshot.automations;
  return saved.pendingToolApprovals ?? [];
}

export async function saveRuntimeState(
  snapshot: AppSnapshot,
  pendingToolApprovals: PendingToolApprovalRecord[] = []
): Promise<void> {
  const state: RuntimeStateFile = {
    version: 1,
    savedAt: new Date().toISOString(),
    sessions: snapshot.sessions,
    messages: snapshot.messages.slice(-500),
    approvals: snapshot.approvals,
    approvalHistory: snapshot.approvalHistory.slice(0, 100),
    pendingToolApprovals,
    activity: snapshot.activity.slice(0, 50),
    automations: snapshot.automations
  };

  await mkdir(dirname(runtimeStatePath), { recursive: true });
  const tempPath = `${runtimeStatePath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(tempPath, runtimeStatePath);
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

function getEnv(name: string, legacyName: string) {
  return process.env[name] ?? process.env[legacyName];
}
