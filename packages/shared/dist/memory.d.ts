export type MemoryEntryKind = "project" | "session" | "long_term";
export interface MemoryEntry {
    id: string;
    kind: MemoryEntryKind;
    title: string;
    content: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
    source?: string;
    pinned?: boolean;
}
export interface SessionSummary {
    id: string;
    sessionId: string;
    title: string;
    summary: string;
    agentId?: string;
    createdAt: string;
    durationMs?: number;
    messageCount: number;
}
//# sourceMappingURL=memory.d.ts.map