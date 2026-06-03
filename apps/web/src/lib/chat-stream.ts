import type { AppSnapshot, ChatStreamEvent } from "@nexadesk/shared";

export function applyChatStreamEvent(snapshot: AppSnapshot, event: ChatStreamEvent): AppSnapshot {
  if (event.type === "user_message" || event.type === "assistant_start") {
    if (snapshot.messages.some((message) => message.id === event.message.id)) {
      return snapshot;
    }
    return {
      ...snapshot,
      messages: [...snapshot.messages, event.message]
    };
  }

  if (event.type === "assistant_delta") {
    return {
      ...snapshot,
      messages: snapshot.messages.map((message) =>
        message.id === event.messageId ? { ...message, content: `${message.content}${event.delta}` } : message
      )
    };
  }

  if (event.type === "assistant_done") {
    const hasActivity = snapshot.activity.some((item) => item.id === event.activity.id);
    return {
      ...snapshot,
      messages: snapshot.messages.map((message) => (message.id === event.message.id ? event.message : message)),
      activity: hasActivity ? snapshot.activity : [event.activity, ...snapshot.activity].slice(0, 20)
    };
  }

  if (event.type === "tool_call") {
    return {
      ...snapshot,
      messages: snapshot.messages.map((message) =>
        message.id === event.messageId
          ? { ...message, toolCalls: [...(message.toolCalls ?? []), event.toolCall] }
          : message
      )
    };
  }

  if (event.type === "tool_message") {
    if (snapshot.messages.some((message) => message.id === event.message.id)) {
      return snapshot;
    }
    return {
      ...snapshot,
      messages: [...snapshot.messages, event.message]
    };
  }

  if (event.type === "approval_queued") {
    if (snapshot.approvals.some((approval) => approval.id === event.approval.id)) {
      return snapshot;
    }
    return {
      ...snapshot,
      approvals: [event.approval, ...snapshot.approvals]
    };
  }

  if (event.messageId) {
    return {
      ...snapshot,
      messages: snapshot.messages.map((message) =>
        message.id === event.messageId
          ? {
              ...message,
              content: message.content || `模型调用失败：${event.message}`,
              toolCalls: message.toolCalls?.map((tool) => ({ ...tool, status: "failed" }))
            }
          : message
      )
    };
  }

  return snapshot;
}
