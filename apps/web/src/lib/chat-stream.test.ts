import { describe, expect, it } from "vitest";
import { applyChatStreamEvent } from "./chat-stream";
import { createDemoSnapshot } from "@nexadesk/shared";

describe("applyChatStreamEvent", () => {
  it("appends assistant deltas to the matching message", () => {
    const snapshot = createDemoSnapshot("2026-01-01T00:00:00.000Z");
    const message = {
      id: "assistant-1",
      sessionId: snapshot.sessions[0]!.id,
      role: "assistant" as const,
      author: "NexaDesk",
      content: "你好",
      createdAt: "2026-01-01T00:00:00.000Z"
    };

    const withStart = applyChatStreamEvent(snapshot, { type: "assistant_start", message });
    const withDelta = applyChatStreamEvent(withStart, {
      type: "assistant_delta",
      messageId: message.id,
      delta: "，赵Sir"
    });

    expect(withDelta.messages.find((item) => item.id === message.id)?.content).toBe("你好，赵Sir");
  });

  it("deduplicates queued approvals", () => {
    const snapshot = createDemoSnapshot("2026-01-01T00:00:00.000Z");
    const approval = {
      id: "approval-1",
      sessionId: snapshot.sessions[0]!.id,
      agentId: "cowork",
      action: "读取文件",
      risk: "low" as const,
      requestedAt: "2026-01-01T00:00:00.000Z",
      toolCallId: "tool-1",
      messageId: "message-1",
      toolName: "read_file"
    };

    const once = applyChatStreamEvent(snapshot, { type: "approval_queued", approval });
    const twice = applyChatStreamEvent(once, { type: "approval_queued", approval });

    expect(twice.approvals.filter((item) => item.id === approval.id)).toHaveLength(1);
  });
});
