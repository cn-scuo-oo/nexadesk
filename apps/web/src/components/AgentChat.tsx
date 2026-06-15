import React, { useState, useRef, useCallback, useEffect } from "react";
import { MarkdownRenderer } from "./MarkdownRenderer";

// ──────────────────────────────────────────────────────────
//  NexaDesk Agent Chat Component
//  Connects to /api/agent/chat via SSE for streaming responses
// ──────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallInfo[];
  timestamp: number;
}

interface ToolCallInfo {
  id: string;
  tool: string;
  summary: string;
  result?: string;
  status: "running" | "completed" | "failed" | "approval_pending";
  risk: string;
}

interface AgentChatProps {
  /** Base URL of the NexaDesk server (default: http://localhost:3000) */
  serverUrl?: string;
  /** Current workspace settings */
  workspace?: { defaultWorkspace: string; allowedRoots: string[] };
  /** Provider settings */
  provider?: any;
  /** Model name */
  model?: string;
  /** API key */
  apiKey?: string;
}

const TOOL_ICONS: Record<string, string> = {
  list_dir: "folder",
  read_file: "file",
  write_file: "pencil",
  run_command: "terminal",
  search: "search",
  browser: "globe",
  image_generate: "image",
};

const RISK_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export const AgentChat: React.FC<AgentChatProps> = ({
  serverUrl = "http://localhost:3000",
  workspace = { defaultWorkspace: ".", allowedRoots: ["."] },
  provider,
  model = "gpt-4o",
  apiKey,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentToolCalls, setCurrentToolCalls] = useState<ToolCallInfo[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentToolCalls]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);
    setCurrentToolCalls([]);

    // Create assistant message placeholder
    const assistantId = `assistant-${Date.now()}`;
    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      toolCalls: [],
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      // Build messages for the API
      const apiMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: text },
      ];

      abortControllerRef.current = new AbortController();

      const response = await fetch(`${serverUrl}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          apiKey,
          messages: apiMessages,
          workspace,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") break;
            if (data.startsWith(":")) continue; // heartbeat

            try {
              const event = JSON.parse(data);
              handleAgentEvent(event, assistantId, accumulatedText);
              if (event.type === "text_delta") {
                accumulatedText += event.text;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      // Finalize the message
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: accumulatedText, toolCalls: [...(m.toolCalls || [])] }
            : m
        )
      );
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `Error: ${(error as Error).message}` }
              : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      setCurrentToolCalls([]);
      abortControllerRef.current = null;
    }
  }, [input, isStreaming, messages, serverUrl, provider, model, apiKey, workspace]);

  const handleAgentEvent = (
    event: any,
    assistantId: string,
    currentText: string
  ) => {
    switch (event.type) {
      case "text_delta":
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: currentText + event.text }
              : m
          )
        );
        break;

      case "tool_start":
        const toolInfo: ToolCallInfo = {
          id: event.toolCallId,
          tool: event.tool,
          summary: event.summary,
          status: "running",
          risk: event.risk,
        };
        setCurrentToolCalls((prev) => [...prev, toolInfo]);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, toolCalls: [...(m.toolCalls || []), toolInfo] }
              : m
          )
        );
        break;

      case "tool_result":
        setCurrentToolCalls((prev) =>
          prev.map((tc) =>
            tc.id === event.toolCallId
              ? { ...tc, result: event.result, status: event.status }
              : tc
          )
        );
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  toolCalls: (m.toolCalls || []).map((tc) =>
                    tc.id === event.toolCallId
                      ? { ...tc, result: event.result, status: event.status }
                      : tc
                  ),
                }
              : m
          )
        );
        break;

      case "approval_needed":
        setCurrentToolCalls((prev) =>
          prev.map((tc) =>
            tc.id === event.toolCallId
              ? { ...tc, status: "approval_pending" }
              : tc
          )
        );
        break;

      case "error":
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: currentText + `\n\n**Error:** ${event.message}` }
              : m
          )
        );
        break;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const stopStreaming = () => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  };

  return (
    <div className="flex flex-col h-full bg-surface rounded-xl border border-current/10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-current/10 bg-surface-raised/50">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-sm font-semibold text-primary">NexaDesk Agent</span>
        <span className="text-xs text-secondary">Built-in Runtime</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-4xl mb-4">🤖</div>
              <p className="text-secondary text-sm">
                NexaDesk Agent is ready. Ask me anything!
              </p>
              <p className="text-muted text-xs mt-2">
                I can read files, run commands, search code, browse the web, and more.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-primary text-white"
                  : "bg-surface-raised border border-current/10"
              }`}
            >
              {msg.role === "assistant" ? (
                <MarkdownRenderer content={msg.content || (isStreaming && msg.id === messages[messages.length - 1]?.id ? "..." : "")} />
              ) : (
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              )}

              {/* Tool calls */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="mt-3 space-y-2">
                  {msg.toolCalls.map((tc) => (
                    <ToolCallCard key={tc.id} toolCall={tc} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-current/10 p-4">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
            className="flex-1 resize-none rounded-lg border border-current/20 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[44px] max-h-[120px]"
            rows={1}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              onClick={stopStreaming}
              className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm hover:bg-red-600 transition-colors"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/** Tool call card component */
const ToolCallCard: React.FC<{ toolCall: ToolCallInfo }> = ({ toolCall }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-current/10 bg-surface/80 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-raised/50 transition-colors"
      >
        <span className="text-sm">{TOOL_ICONS[toolCall.tool] || "wrench"}</span>
        <span className="text-xs font-medium text-secondary flex-1 truncate">
          {toolCall.summary}
        </span>
        <span className={`text-xs px-1.5 py-0.5 rounded ${RISK_COLORS[toolCall.risk] || ""}`}>
          {toolCall.risk}
        </span>
        <span className="text-xs text-muted">
          {toolCall.status === "running" && "⏳"}
          {toolCall.status === "completed" && "✅"}
          {toolCall.status === "failed" && "❌"}
          {toolCall.status === "approval_pending" && "🔒"}
        </span>
      </button>
      {expanded && toolCall.result && (
        <div className="px-3 py-2 border-t border-current/10 text-xs text-secondary max-h-40 overflow-y-auto">
          <pre className="whitespace-pre-wrap font-mono">{toolCall.result}</pre>
        </div>
      )}
    </div>
  );
};

export default AgentChat;
