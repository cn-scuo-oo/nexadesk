// ──────────────────────────────────────────────────────────
//  NexaDesk Agent Client
//  Client-side utility for interacting with /api/agent/chat
// ──────────────────────────────────────────────────────────

export type AgentEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_start"; toolCallId: string; tool: string; summary: string; risk: string }
  | { type: "tool_result"; toolCallId: string; tool: string; result: string; status: string }
  | { type: "approval_needed"; toolCallId: string; tool: string; summary: string }
  | { type: "error"; message: string }
  | { type: "done"; iterations: number; totalToolCalls: number };

export type AgentChatRequest = {
  provider: any;
  model: string;
  apiKey?: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  workspace: { defaultWorkspace: string; allowedRoots: string[] };
};

/**
 * Send a message to the NexaDesk Agent and stream events via callback.
 * Returns an AbortController so the caller can cancel.
 */
export function streamAgentChat(
  serverUrl: string,
  request: AgentChatRequest,
  onEvent: (event: AgentEvent) => void,
  onError?: (error: Error) => void,
  onDone?: () => void
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(`${serverUrl}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          if (data.startsWith(":")) continue; // heartbeat comment

          try {
            const event: AgentEvent = JSON.parse(data);
            onEvent(event);
          } catch {
            // Skip malformed JSON
          }
        }
      }

      onDone?.();
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        onError?.(error as Error);
      }
    }
  })();

  return controller;
}

/**
 * Convenience: Send a message and collect all text into a single string.
 */
export async function agentChat(
  serverUrl: string,
  request: AgentChatRequest
): Promise<{ text: string; iterations: number; totalToolCalls: number }> {
  return new Promise((resolve, reject) => {
    let text = "";
    let iterations = 0;
    let totalToolCalls = 0;

    streamAgentChat(
      serverUrl,
      request,
      (event) => {
        if (event.type === "text_delta") {
          text += event.text;
        } else if (event.type === "done") {
          iterations = event.iterations;
          totalToolCalls = event.totalToolCalls;
        }
      },
      (error) => reject(error),
      () => resolve({ text, iterations, totalToolCalls })
    );
  });
}
