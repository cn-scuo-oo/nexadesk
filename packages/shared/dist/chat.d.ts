import type { AgentToolName } from "./agent.js";
import type { PermissionRisk, PermissionRequest } from "./permission.js";
import type { ActivityEvent } from "./snapshot.js";
export interface SendMessageRequest {
    content: string;
    providerId?: string;
    model?: string;
    agentId?: string;
}
export type ChatStreamEvent = {
    type: "user_message";
    message: ChatMessage;
} | {
    type: "assistant_start";
    message: ChatMessage;
    provider: {
        id: string;
        name: string;
        model: string;
    };
} | {
    type: "assistant_delta";
    messageId: string;
    delta: string;
} | {
    type: "tool_call";
    messageId: string;
    toolCall: ToolCall;
} | {
    type: "tool_message";
    message: ChatMessage;
} | {
    type: "approval_queued";
    approval: PermissionRequest;
} | {
    type: "assistant_done";
    message: ChatMessage;
    activity: ActivityEvent;
} | {
    type: "error";
    message: string;
    messageId?: string;
};
export interface ToolCall {
    id: string;
    name: AgentToolName | "model.stream";
    status: "queued" | "running" | "approved" | "rejected" | "completed" | "failed";
    risk: PermissionRisk;
    summary: string;
}
export interface ChatMessage {
    id: string;
    sessionId: string;
    role: "user" | "assistant" | "system" | "tool";
    author: string;
    content: string;
    createdAt: string;
    toolCalls?: ToolCall[];
}
export interface RuntimeTelemetryEntry {
    id: string;
    sessionId: string;
    providerName: string;
    model: string;
    startedAt: string;
    completedAt?: string;
    firstTokenMs?: number;
    durationMs?: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    status: "running" | "completed" | "failed";
    error?: string;
    messagePreview?: string;
}
//# sourceMappingURL=chat.d.ts.map