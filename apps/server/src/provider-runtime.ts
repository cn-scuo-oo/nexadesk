import type { AgentToolName, ProviderSettings } from "@nexadesk/shared";

export type RuntimeChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type RuntimeRequest = {
  provider: ProviderSettings;
  model: string;
  apiKey?: string;
  messages: RuntimeChatMessage[];
};

export type RuntimeToolRequest = {
  tool: AgentToolName;
  path?: string;
  content?: string;
  command?: string;
  query?: string;
  url?: string;
  prompt?: string;
  size?: string;
  model?: string;
};

export type RuntimeStreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_request"; request: RuntimeToolRequest };

export class ProviderRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderRuntimeError";
  }
}

export async function* streamProviderResponse(request: RuntimeRequest): AsyncGenerator<string> {
  for await (const event of streamProviderEvents(request)) {
    if (event.type === "text") {
      yield event.delta;
    }
  }
}

export async function* streamProviderEvents(request: RuntimeRequest): AsyncGenerator<RuntimeStreamEvent> {
  if (request.provider.apiMode === "ollama_generate") {
    yield* streamOllamaChatEvents(request);
    return;
  }

  if (request.provider.apiMode === "anthropic_messages") {
    yield* streamAnthropicMessageEvents(request);
    return;
  }

  if (request.provider.apiMode === "responses") {
    yield* streamOpenAiResponseEvents(request);
    return;
  }

  yield* streamOpenAiCompatibleChatEvents(request);
}

async function streamFetch(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const detail = await response.text();
    throw new ProviderRuntimeError(
      `妯″瀷鏈嶅姟杩斿洖 HTTP ${response.status}${detail ? `锛?{detail.slice(0, 240)}` : ""}`
    );
  }
  if (!response.body) {
    throw new ProviderRuntimeError("妯″瀷鏈嶅姟娌℃湁杩斿洖鍙鍙栫殑娴併€?");
  }
  return response;
}

async function* streamOpenAiCompatibleChatEvents(request: RuntimeRequest): AsyncGenerator<RuntimeStreamEvent> {
  const baseUrl = requireBaseUrl(request.provider);
  const pendingToolCalls = new Map<number, { name: string; arguments: string }>();
  const response = await streamFetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...bearerHeaders(request)
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      tools: buildOpenAiTools(),
      stream: true
    })
  });

  for await (const data of readServerSentData(response)) {
    if (data === "[DONE]") {
      return;
    }
    const payload = parseJsonObject(data);
    const choice = payload?.choices?.[0];
    const delta = choice?.delta?.content;
    if (typeof delta === "string" && delta) {
      yield { type: "text", delta };
    }

    for (const toolCall of choice?.delta?.tool_calls ?? []) {
      const index = typeof toolCall.index === "number" ? toolCall.index : 0;
      const current = pendingToolCalls.get(index) ?? { name: "", arguments: "" };
      current.name += toolCall.function?.name ?? "";
      current.arguments += toolCall.function?.arguments ?? "";
      pendingToolCalls.set(index, current);
    }

    if (choice?.finish_reason === "tool_calls") {
      for (const item of pendingToolCalls.values()) {
        const request = runtimeToolFromFunction(item.name, item.arguments);
        if (request) {
          yield { type: "tool_request", request };
        }
      }
    }
  }
}

async function* streamOpenAiResponseEvents(request: RuntimeRequest): AsyncGenerator<RuntimeStreamEvent> {
  const baseUrl = requireBaseUrl(request.provider);
  const functionArguments = new Map<string, { name: string; arguments: string }>();
  const instructions = request.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const input = request.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role,
      content: message.content
    }));

  const response = await streamFetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...bearerHeaders(request)
    },
    body: JSON.stringify({
      model: request.model,
      instructions: instructions || undefined,
      input,
      tools: buildResponsesTools(),
      stream: true
    })
  });

  for await (const data of readServerSentData(response)) {
    if (data === "[DONE]") {
      return;
    }
    const payload = parseJsonObject(data);
    if (payload?.type === "response.output_text.delta" && typeof payload.delta === "string") {
      yield { type: "text", delta: payload.delta };
    }
    if (payload?.type === "response.refusal.delta" && typeof payload.delta === "string") {
      yield { type: "text", delta: payload.delta };
    }
    if (payload?.type === "response.function_call_arguments.delta") {
      const id = payload.item_id ?? payload.output_index ?? "default";
      const current = functionArguments.get(id) ?? { name: "", arguments: "" };
      current.arguments += payload.delta ?? "";
      functionArguments.set(id, current);
    }
    if (payload?.type === "response.output_item.done" && payload.item?.type === "function_call") {
      const request = runtimeToolFromFunction(payload.item.name, payload.item.arguments ?? "");
      if (request) {
        yield { type: "tool_request", request };
      }
    }
  }
}

async function* streamAnthropicMessageEvents(request: RuntimeRequest): AsyncGenerator<RuntimeStreamEvent> {
  const baseUrl = requireBaseUrl(request.provider);
  if (!request.apiKey) {
    throw new ProviderRuntimeError("Anthropic Provider 闇€瑕?API Key銆?");
  }

  const system = request.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const messages = request.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role,
      content: message.content
    }));

  const response = await streamFetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": request.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: 4096,
      system: system || undefined,
      messages,
      tools: buildAnthropicTools(),
      stream: true
    })
  });

  let currentTool: { name: string; arguments: string } | null = null;

  for await (const data of readServerSentData(response)) {
    const payload = parseJsonObject(data);
    const text = payload?.delta?.text;
    if (payload?.type === "content_block_delta" && typeof text === "string") {
      yield { type: "text", delta: text };
    }
    if (payload?.type === "content_block_start" && payload.content_block?.type === "tool_use") {
      currentTool = {
        name: payload.content_block.name ?? "",
        arguments: ""
      };
    }
    if (payload?.type === "content_block_delta" && typeof payload.delta?.partial_json === "string" && currentTool) {
      currentTool.arguments += payload.delta.partial_json;
    }
    if (payload?.type === "content_block_stop" && currentTool) {
      const request = runtimeToolFromFunction(currentTool.name, currentTool.arguments);
      if (request) {
        yield { type: "tool_request", request };
      }
      currentTool = null;
    }
  }
}

async function* streamOllamaChatEvents(request: RuntimeRequest): AsyncGenerator<RuntimeStreamEvent> {
  const baseUrl = requireBaseUrl(request.provider);
  const pendingToolCalls = new Map<number, { name: string; arguments: string }>();
  const response = await streamFetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      tools: buildOpenAiTools(),
      stream: true
    })
  });

  for await (const line of readLines(response)) {
    if (!line.trim()) {
      continue;
    }
    const payload = parseJsonObject(line);
    const delta = payload?.message?.content ?? payload?.response;
    if (typeof delta === "string" && delta) {
      yield { type: "text", delta };
    }
    for (const toolCall of payload?.message?.tool_calls ?? []) {
      const index = pendingToolCalls.size;
      const current = pendingToolCalls.get(index) ?? { name: "", arguments: "" };
      current.name = toolCall.function?.name ?? current.name;
      current.arguments +=
        typeof toolCall.function?.arguments === "string"
          ? toolCall.function.arguments
          : JSON.stringify(toolCall.function?.arguments ?? {});
      pendingToolCalls.set(index, current);
    }
    if (payload?.done) {
      for (const item of pendingToolCalls.values()) {
        const request = runtimeToolFromFunction(item.name, item.arguments);
        if (request) {
          yield { type: "tool_request", request };
        }
      }
    }
  }
}

async function* readServerSentData(response: Response): AsyncGenerator<string> {
  for await (const line of readLines(response)) {
    if (!line.startsWith("data:")) {
      continue;
    }
    yield line.slice(5).trim();
  }
}

async function* readLines(response: Response): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);
      yield line;
      newlineIndex = buffer.indexOf("\n");
    }
  }

  buffer += decoder.decode();
  if (buffer) {
    yield buffer.replace(/\r$/, "");
  }
}

function requireBaseUrl(provider: ProviderSettings) {
  const baseUrl = provider.baseUrl?.replace(/\/+$/, "");
  if (!baseUrl) {
    throw new ProviderRuntimeError("璇峰厛涓哄綋鍓?Provider 濉啓 Base URL銆?");
  }
  return baseUrl;
}

function bearerHeaders(request: RuntimeRequest): Record<string, string> {
  if (request.provider.kind === "local") {
    return {};
  }
  if (!request.apiKey) {
    throw new ProviderRuntimeError("褰撳墠 Provider 闇€瑕?API Key锛岃鍏堝湪妯″瀷涓績淇濆瓨銆?");
  }
  return { Authorization: `Bearer ${request.apiKey}` };
}

function parseJsonObject(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function runtimeToolFromFunction(name: string, rawArguments: string): RuntimeToolRequest | null {
  const tool = normalizeToolName(name);
  if (!tool) {
    return null;
  }
  const args = parseJsonObject(rawArguments) ?? {};
  return { tool, ...args };
}

function normalizeToolName(name: string): AgentToolName | null {
  if (
    name === "list_dir" ||
    name === "read_file" ||
    name === "write_file" ||
    name === "run_command" ||
    name === "search" ||
    name === "browser" ||
    name === "image_generate"
  ) {
    return name;
  }
  return null;
}

function buildOpenAiTools() {
  return toolDefinitions().map((tool) => ({
    type: "function",
    function: tool
  }));
}

function buildResponsesTools() {
  return toolDefinitions().map((tool) => ({
    type: "function",
    ...tool
  }));
}

function buildAnthropicTools() {
  return toolDefinitions().map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters
  }));
}

function toolDefinitions() {
  const stringProperty = { type: "string" };
  return [
    {
      name: "list_dir",
      description: "List files and folders inside the configured workspace.",
      parameters: {
        type: "object",
        properties: { path: stringProperty },
        additionalProperties: false
      }
    },
    {
      name: "read_file",
      description: "Read a UTF-8 text file inside the configured workspace.",
      parameters: {
        type: "object",
        properties: { path: stringProperty },
        required: ["path"],
        additionalProperties: false
      }
    },
    {
      name: "write_file",
      description: "Write a UTF-8 text file inside the configured workspace after approval.",
      parameters: {
        type: "object",
        properties: { path: stringProperty, content: stringProperty },
        required: ["path", "content"],
        additionalProperties: false
      }
    },
    {
      name: "run_command",
      description: "Run a PowerShell command in the configured workspace after approval.",
      parameters: {
        type: "object",
        properties: { command: stringProperty, path: stringProperty },
        required: ["command"],
        additionalProperties: false
      }
    },
    {
      name: "search",
      description: "Search the configured workspace using ripgrep.",
      parameters: {
        type: "object",
        properties: { query: stringProperty, path: stringProperty },
        required: ["query"],
        additionalProperties: false
      }
    },
    {
      name: "browser",
      description: "Read a web page URL after approval and return title plus page text.",
      parameters: {
        type: "object",
        properties: { url: stringProperty, prompt: stringProperty },
        required: ["url"],
        additionalProperties: false
      }
    },
    {
      name: "image_generate",
      description: "Generate an image from a prompt after approval.",
      parameters: {
        type: "object",
        properties: { prompt: stringProperty, size: stringProperty, model: stringProperty },
        required: ["prompt"],
        additionalProperties: false
      }
    }
  ];
}

