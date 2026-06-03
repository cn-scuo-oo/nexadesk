import Database from "better-sqlite3";
import path from "node:path";
import type { AgentSession, ChatMessage, MemoryEntry, SessionSummary, RuntimeTelemetryEntry } from "@nexadesk/shared";

/**
 * SQLite-backed persistence layer for NexaDesk.
 * Replaces JSON file storage with structured queries, indexes, and transactional safety.
 */

let db: Database.Database | null = null;

export function initDatabase(dataDir: string): Database.Database {
  const dbPath = path.join(dataDir, "nexadesk.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memory_entries (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK(kind IN ('project', 'session', 'long_term')),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      source TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_memory_kind ON memory_entries(kind);
    CREATE INDEX IF NOT EXISTS idx_memory_pinned ON memory_entries(pinned DESC);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      workspace TEXT NOT NULL,
      agent_ids TEXT NOT NULL DEFAULT '[]',
      active_agent_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      tool_calls TEXT NOT NULL DEFAULT '[]'
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS session_summaries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      agent_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      duration_ms INTEGER,
      message_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_summary_session ON session_summaries(session_id);

    CREATE TABLE IF NOT EXISTS telemetry (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      provider_name TEXT NOT NULL,
      model TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      first_token_ms INTEGER,
      duration_ms INTEGER,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
      error TEXT,
      message_preview TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_telemetry_session ON telemetry(session_id);
    CREATE INDEX IF NOT EXISTS idx_telemetry_started ON telemetry(started_at DESC);

    CREATE TABLE IF NOT EXISTS mcp_tool_policies (
      tool_id TEXT NOT NULL,
      server_id TEXT NOT NULL,
      permission TEXT NOT NULL CHECK(permission IN ('allow', 'ask', 'deny')),
      note TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(tool_id, server_id)
    );

    CREATE TABLE IF NOT EXISTS agent_teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '👥',
      description TEXT NOT NULL DEFAULT '',
      agent_ids TEXT NOT NULL DEFAULT '[]',
      workflow TEXT NOT NULL DEFAULT 'sequential' CHECK(workflow IN ('sequential', 'parallel', 'round_robin')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
  `);

  return db;
}

export function getDb(): Database.Database {
  if (!db) throw new Error("Database not initialized. Call initDatabase() first.");
  return db;
}

/* ── Settings ── */
export function getSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))")
    .run(key, value);
}

export function deleteSetting(key: string): void {
  getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
}

/* ── Memory Entries ── */
export function getAllMemoryEntries(): MemoryEntry[] {
  const rows = getDb().prepare("SELECT * FROM memory_entries ORDER BY pinned DESC, updated_at DESC").all() as any[];
  return rows.map(rowToMemoryEntry);
}

export function getMemoryEntriesByKind(kind: string): MemoryEntry[] {
  const rows = getDb()
    .prepare("SELECT * FROM memory_entries WHERE kind = ? ORDER BY pinned DESC, updated_at DESC")
    .all(kind) as any[];
  return rows.map(rowToMemoryEntry);
}

export function searchMemoryEntries(query: string): MemoryEntry[] {
  const pattern = `%${query}%`;
  const rows = getDb()
    .prepare(
      "SELECT * FROM memory_entries WHERE title LIKE ? OR content LIKE ? OR tags LIKE ? ORDER BY pinned DESC, updated_at DESC"
    )
    .all(pattern, pattern, pattern) as any[];
  return rows.map(rowToMemoryEntry);
}

export function insertMemoryEntry(entry: MemoryEntry): void {
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO memory_entries (id, kind, title, content, tags, source, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      entry.id,
      entry.kind,
      entry.title,
      entry.content,
      JSON.stringify(entry.tags),
      entry.source ?? null,
      entry.pinned ? 1 : 0,
      entry.createdAt,
      entry.updatedAt
    );
}

export function updateMemoryEntry(id: string, patch: Partial<MemoryEntry>): void {
  const existing = getDb().prepare("SELECT * FROM memory_entries WHERE id = ?").get(id) as any;
  if (!existing) return;
  getDb()
    .prepare(
      "UPDATE memory_entries SET title = ?, content = ?, tags = ?, pinned = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .run(
      patch.title ?? existing.title,
      patch.content ?? existing.content,
      JSON.stringify(patch.tags ?? JSON.parse(existing.tags)),
      patch.pinned !== undefined ? (patch.pinned ? 1 : 0) : existing.pinned,
      id
    );
}

export function deleteMemoryEntryById(id: string): void {
  getDb().prepare("DELETE FROM memory_entries WHERE id = ?").run(id);
}

export function getMemoryStats(): { total: number; byKind: Record<string, number> } {
  const total = (getDb().prepare("SELECT COUNT(*) as c FROM memory_entries").get() as any).c;
  const rows = getDb().prepare("SELECT kind, COUNT(*) as c FROM memory_entries GROUP BY kind").all() as any[];
  const byKind: Record<string, number> = {};
  for (const row of rows) byKind[row.kind] = row.c;
  return { total, byKind };
}

function rowToMemoryEntry(row: any): MemoryEntry {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    content: row.content,
    tags: JSON.parse(row.tags),
    source: row.source ?? undefined,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/* ── Sessions & Messages ── */
export function getAllSessions(): AgentSession[] {
  const rows = getDb().prepare("SELECT * FROM sessions ORDER BY pinned DESC, updated_at DESC").all() as any[];
  return rows.map(rowToSession);
}

export function replaceSessions(sessions: AgentSession[]): void {
  const database = getDb();
  const transaction = database.transaction((items: AgentSession[]) => {
    database.prepare("DELETE FROM sessions").run();
    for (const session of items) {
      insertSessionInternal(session);
    }
  });
  transaction(sessions);
}

export function upsertSession(session: AgentSession): void {
  insertSessionInternal(session);
}

export function deleteSessionById(id: string): void {
  const database = getDb();
  const transaction = database.transaction((sessionId: string) => {
    database.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionId);
    database.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  });
  transaction(id);
}

export function getAllMessages(limit = 500): ChatMessage[] {
  const rows = getDb().prepare("SELECT * FROM messages ORDER BY datetime(created_at) ASC LIMIT ?").all(limit) as any[];
  return rows.map(rowToMessage);
}

export function getMessagesBySession(sessionId: string): ChatMessage[] {
  const rows = getDb()
    .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY datetime(created_at) ASC")
    .all(sessionId) as any[];
  return rows.map(rowToMessage);
}

export function replaceMessages(messages: ChatMessage[]): void {
  const database = getDb();
  const transaction = database.transaction((items: ChatMessage[]) => {
    database.prepare("DELETE FROM messages").run();
    for (const message of items.slice(-500)) {
      insertMessageInternal(message);
    }
  });
  transaction(messages);
}

export function upsertMessage(message: ChatMessage): void {
  insertMessageInternal(message);
}

function insertSessionInternal(session: AgentSession): void {
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO sessions (id, title, workspace, agent_ids, active_agent_id, updated_at, pinned) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      session.id,
      session.title,
      session.workspace,
      JSON.stringify(session.agentIds),
      session.activeAgentId,
      session.updatedAt,
      session.pinned ? 1 : 0
    );
}

function insertMessageInternal(message: ChatMessage): void {
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO messages (id, session_id, role, author, content, created_at, tool_calls) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      message.id,
      message.sessionId,
      message.role,
      message.author,
      message.content,
      message.createdAt,
      JSON.stringify(message.toolCalls ?? [])
    );
}

function rowToSession(row: any): AgentSession {
  return {
    id: row.id,
    title: row.title,
    workspace: row.workspace,
    agentIds: JSON.parse(row.agent_ids),
    activeAgentId: row.active_agent_id,
    updatedAt: row.updated_at,
    pinned: row.pinned === 1
  };
}

function rowToMessage(row: any): ChatMessage {
  const toolCalls = JSON.parse(row.tool_calls ?? "[]");
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    author: row.author,
    content: row.content,
    createdAt: row.created_at,
    ...(toolCalls.length ? { toolCalls } : {})
  };
}

/* ── Session Summaries ── */
export function getAllSessionSummaries(): SessionSummary[] {
  const rows = getDb().prepare("SELECT * FROM session_summaries ORDER BY created_at DESC").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    title: r.title,
    summary: r.summary,
    agentId: r.agent_id ?? undefined,
    createdAt: r.created_at,
    durationMs: r.duration_ms ?? undefined,
    messageCount: r.message_count
  }));
}

export function insertSessionSummary(summary: SessionSummary): void {
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO session_summaries (id, session_id, title, summary, agent_id, created_at, duration_ms, message_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      summary.id,
      summary.sessionId,
      summary.title,
      summary.summary,
      summary.agentId ?? null,
      summary.createdAt,
      summary.durationMs ?? null,
      summary.messageCount
    );
}

/* ── Telemetry ── */
export function getAllTelemetry(limit = 80): RuntimeTelemetryEntry[] {
  const rows = getDb().prepare("SELECT * FROM telemetry ORDER BY started_at DESC LIMIT ?").all(limit) as any[];
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    providerName: r.provider_name,
    model: r.model,
    startedAt: r.started_at,
    completedAt: r.completed_at ?? undefined,
    firstTokenMs: r.first_token_ms ?? undefined,
    durationMs: r.duration_ms ?? undefined,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    totalTokens: r.total_tokens,
    status: r.status,
    error: r.error ?? undefined,
    messagePreview: r.message_preview ?? undefined
  }));
}

export function insertTelemetry(entry: RuntimeTelemetryEntry): void {
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO telemetry (id, session_id, provider_name, model, started_at, completed_at, first_token_ms, duration_ms, input_tokens, output_tokens, total_tokens, status, error, message_preview) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      entry.id,
      entry.sessionId,
      entry.providerName,
      entry.model,
      entry.startedAt,
      entry.completedAt ?? null,
      entry.firstTokenMs ?? null,
      entry.durationMs ?? null,
      entry.inputTokens,
      entry.outputTokens,
      entry.totalTokens,
      entry.status,
      entry.error ?? null,
      entry.messagePreview ?? null
    );
}

/* ── MCP Tool Policies ── */
export function getAllToolPolicies(): Array<{ toolId: string; serverId: string; permission: string; note?: string }> {
  return getDb()
    .prepare("SELECT tool_id as toolId, server_id as serverId, permission, note FROM mcp_tool_policies")
    .all() as any[];
}

export function upsertToolPolicy(toolId: string, serverId: string, permission: string, note?: string): void {
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO mcp_tool_policies (tool_id, server_id, permission, note, updated_at) VALUES (?, ?, ?, ?, datetime('now'))"
    )
    .run(toolId, serverId, permission, note ?? null);
}

/* ── Agent Teams ── */
export function getAllTeams(): Array<{
  id: string;
  name: string;
  emoji: string;
  description: string;
  agentIds: string[];
  workflow: string;
}> {
  const rows = getDb().prepare("SELECT * FROM agent_teams ORDER BY created_at DESC").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    description: r.description,
    agentIds: JSON.parse(r.agent_ids),
    workflow: r.workflow
  }));
}

export function insertTeam(team: {
  id: string;
  name: string;
  emoji: string;
  description: string;
  agentIds: string[];
  workflow: string;
}): void {
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO agent_teams (id, name, emoji, description, agent_ids, workflow, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
    )
    .run(team.id, team.name, team.emoji, team.description, JSON.stringify(team.agentIds), team.workflow);
}

export function deleteTeam(id: string): void {
  getDb().prepare("DELETE FROM agent_teams WHERE id = ?").run(id);
}

/* ── Audit Log ── */
export function logAudit(action: string, entity: string, entityId?: string, detail?: string): void {
  getDb()
    .prepare("INSERT INTO audit_log (action, entity, entity_id, detail) VALUES (?, ?, ?, ?)")
    .run(action, entity, entityId ?? null, detail ?? null);
}

export function getAuditLog(
  limit = 50
): Array<{ id: number; action: string; entity: string; entityId?: string; detail?: string; createdAt: string }> {
  const rows = getDb().prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?").all(limit) as any[];
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id ?? undefined,
    detail: r.detail ?? undefined,
    createdAt: r.created_at
  }));
}
