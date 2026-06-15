import { randomUUID } from "node:crypto";
import type { AgentToolName, ProviderSettings } from "@nexadesk/shared";
import {
  type RuntimeChatMessage,
  type RuntimeRequest,
  type RuntimeStreamEvent,
  type RuntimeToolRequest,
  streamProviderEvents,
  ProviderRuntimeError
} from "./provider-runtime.js";
import {
  type AgentToolContext,
  type AgentToolExecution,
  prepareToolRequest,
  executeToolRequest,
  getToolRisk,
  summarizeToolRequest
} from "./agent-tools.js";

// ──────────────────────────────────────────────────────────
//  NexaDesk Built-in Agent Engine
//  Connects provider-runtime (LLM streaming + tool detection)
//  with agent-tools (7 built-in tool execution)
// ──────────────────────────────────────────────────────────

const MAX_AGENT_ITERATIONS = 15;
const MAX_TOOL_HISTORY_CHARS = 8000;

/** Every event the frontend receives from the agent loop */
export type AgentEngineEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_start"; toolCallId: string; tool: AgentToolName; summary: string; risk: string }
  | { type: "tool_result"; toolCallId: string; tool: AgentToolName; result: string; status: "completed" | "failed" | "approval_pending" }
  | { type: "approval_needed"; toolCallId: string; tool: AgentToolName; summary: string }
  | { type: "error"; message: string }
  | { type: "done"; iterations: number; totalToolCalls: number };

export type AgentEngineRequest = {
  provider: ProviderSettings;
  model: string;
  apiKey?: string;
  messages: RuntimeChatMessage[];
  workspace: AgentToolContext["workspace"];
  image?: AgentToolContext["image"];
  /** Called when a tool needs approval. Return true to approve, false to reject. */
  onApproval?: (toolCallId: string, tool: AgentToolName, summary: string) => Promise<boolean>;
};

/**
 * The main agent loop.
 * Sends messages to the LLM, executes any tool calls, feeds results back,
 * and repeats until the LLM stops calling tools (or max iterations hit).
 *
 * This is an async generator that yields AgentEngineEvent objects.
 * The frontend consumes these via Server-Sent Events (SSE).
 */
export async function* runAgentLoop(request: AgentEngineRequest): AsyncGenerator<AgentEngineEvent> {
  const { provider, model, apiKey, workspace, image, onApproval } = request;

  // Deep copy messages so we don't mutate the original
  let messages: RuntimeChatMessage[] = request.messages.map((m) => ({ ...m }));

  let iterations = 0;
  let totalToolCalls = 0;

  // Inject system prompt if not already present
  if (!messages.some((m) => m.role === "system")) {
    messages.unshift({
      role: "system",
      content: buildSystemPrompt()
    });
  }

  while (iterations < MAX_AGENT_ITERATIONS) {
    iterations++;

    // Collect tool requests from this iteration
    const pendingToolRequests: RuntimeToolRequest[] = [];
    let iterationText = "";

    // Stream LLM response
    const providerRequest: RuntimeRequest = {
      provider,
      model,
      apiKey,
      messages
    };

    try {
      for await (const event of streamProviderEvents(providerRequest)) {
        if (event.type === "text") {
          iterationText += event.delta;
          yield { type: "text_delta", text: event.delta };
        } else if (event.type === "tool_request") {
          pendingToolRequests.push(event.request);
        }
      }
    } catch (error) {
      yield {
        type: "error",
        message: error instanceof Error ? error.message : "LLM 调用失败。"
      };
      return;
    }

    // If no tool calls, we're done — the LLM is done responding
    if (pendingToolRequests.length === 0) {
      break;
    }

    // Add the assistant's full response (including tool calls) to message history
    messages.push({
      role: "assistant",
      content: iterationText || "[工具调用]"
    });

    // Execute each tool call
    const toolResults: string[] = [];

    for (const toolRequest of pendingToolRequests) {
      totalToolCalls++;
      const toolCallId = randomUUID();
      const risk = getToolRisk(toolRequest.tool);
      const summary = summarizeToolRequest(toolRequest);

      // Notify frontend about tool start
      yield {
        type: "tool_start",
        toolCallId,
        tool: toolRequest.tool,
        summary,
        risk
      };

      // Low-risk tools: auto-execute
      if (risk === "low") {
        try {
          const result = await executeToolRequest(toolRequest, { workspace, image });
          const truncatedResult = truncateResult(result);
          toolResults.push(`[${summary}]\n${truncatedResult}`);
          yield {
            type: "tool_result",
            toolCallId,
            tool: toolRequest.tool,
            result: truncatedResult,
            status: "completed"
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "工具执行失败";
          toolResults.push(`[${summary}] Error: ${errorMsg}`);
          yield {
            type: "tool_result",
            toolCallId,
            tool: toolRequest.tool,
            result: errorMsg,
            status: "failed"
          };
        }
      }

      // Medium/High-risk tools: need approval
      else if (onApproval) {
        yield {
          type: "approval_needed",
          toolCallId,
          tool: toolRequest.tool,
          summary
        };

        const approved = await onApproval(toolCallId, toolRequest.tool, summary);

        if (approved) {
          try {
            const result = await executeToolRequest(toolRequest, { workspace, image });
            const truncatedResult = truncateResult(result);
            toolResults.push(`[${summary}]\n${truncatedResult}`);
            yield {
              type: "tool_result",
              toolCallId,
              tool: toolRequest.tool,
              result: truncatedResult,
              status: "completed"
            };
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "工具执行失败";
            toolResults.push(`[${summary}] Error: ${errorMsg}`);
            yield {
              type: "tool_result",
              toolCallId,
              tool: toolRequest.tool,
              result: errorMsg,
              status: "failed"
            };
          }
        } else {
          toolResults.push(`[${summary}] 用户拒绝了此操作。`);
          yield {
            type: "tool_result",
            toolCallId,
            tool: toolRequest.tool,
            result: "用户拒绝了此操作。",
            status: "failed"
          };
        }
      }

      // No approval callback: auto-approve medium, reject high
      else {
        if (risk === "medium") {
          try {
            const result = await executeToolRequest(toolRequest, { workspace, image });
            const truncatedResult = truncateResult(result);
            toolResults.push(`[${summary}]\n${truncatedResult}`);
            yield {
              type: "tool_result",
              toolCallId,
              tool: toolRequest.tool,
              result: truncatedResult,
              status: "completed"
            };
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "工具执行失败";
            toolResults.push(`[${summary}] Error: ${errorMsg}`);
            yield {
              type: "tool_result",
              toolCallId,
              tool: toolRequest.tool,
              result: errorMsg,
              status: "failed"
            };
          }
        } else {
          toolResults.push(`[${summary}] 高风险操作需要审批，当前模式下已跳过。`);
          yield {
            type: "tool_result",
            toolCallId,
            tool: toolRequest.tool,
            result: "高风险操作需要审批。",
            status: "failed"
          };
        }
      }
    }

    // Add tool results to message history for the next LLM call
    if (toolResults.length > 0) {
      const toolResultContent = toolResults.join("\n\n");
      messages.push({
        role: "user",
        content: `工具执行结果：\n\n${truncateResult(toolResultContent, MAX_TOOL_HISTORY_CHARS)}\n\n请根据以上工具结果继续回答用户的问题。如果任务已完成，请直接给出最终回答，不要再调用工具。`
      });
    }
  }

  // Done
  yield {
    type: "done",
    iterations,
    totalToolCalls
  };
}

/** Build the system prompt for the built-in agent */
function buildSystemPrompt(): string {
  return [
    "你是 NexaDesk 内置 AI Agent，一个强大的桌面工作台助手。",
    "",
    "## 你的能力",
    "你可以使用以下工具来帮助用户完成任务：",
    "- list_dir: 列出工作区目录内容",
    "- read_file: 读取工作区内的文件",
    "- write_file: 写入文件到工作区（需要审批）",
    "- run_command: 执行 PowerShell 命令（需要审批）",
    "- search: 使用 ripgrep 搜索工作区",
    "- browser: 读取网页内容（需要审批）",
    "- image_generate: 生成图片（需要审批）",
    "",
    "## 工作规则",
    "1. 优先使用工具获取信息，而不是猜测",
    "2. 每次只调用必要的工具，避免不必要的操作",
    "3. 工具结果会以 JSON 格式返回，注意解析",
    "4. 如果工具执行失败，分析错误原因并尝试修复",
    "5. 最终回答要清晰、结构化，使用 Markdown 格式",
    "6. 对于写文件和命令执行，明确说明你将要做什么",
    "7. 保持简洁高效，不要重复调用相同的工具",
    "",
    "## 输出格式",
    "直接用自然语言回答。如果需要调用工具，请直接调用，不要在回答中描述你要调用什么工具。"
  ].join("\n");
}

/** Truncate long results to avoid context overflow */
function truncateResult(text: string, maxLength = 12000): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength) + "\n\n... [结果已截断，共 " + text.length + " 字符]";
}
