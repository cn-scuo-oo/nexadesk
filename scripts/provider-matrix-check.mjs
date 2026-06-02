import { createDefaultProviders } from "../packages/shared/src/index.ts";

const live = process.argv.includes("--live");

const matrix = [
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    apiMode: "chat_completions",
    requiredModels: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner"],
    requiredCapabilities: ["streaming", "function_calling", "structured_output"],
    envKey: "DEEPSEEK_API_KEY",
    officialUrl: "https://api-docs.deepseek.com/"
  },
  {
    id: "dashscope-qwen",
    label: "Alibaba Cloud Bailian / Qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiMode: "chat_completions",
    requiredModels: ["qwen-plus", "qwen-max", "qwen-turbo", "qwen-vl-plus"],
    requiredCapabilities: ["streaming", "function_calling", "vision", "structured_output"],
    envKey: "DASHSCOPE_API_KEY",
    officialUrl: "https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope"
  },
  {
    id: "siliconflow-cn",
    label: "SiliconFlow",
    baseUrl: "https://api.siliconflow.cn/v1",
    apiMode: "chat_completions",
    requiredModels: ["deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct"],
    requiredCapabilities: ["streaming", "function_calling", "structured_output"],
    envKey: "SILICONFLOW_API_KEY",
    officialUrl: "https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions"
  },
  {
    id: "moonshot",
    label: "Moonshot Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    apiMode: "chat_completions",
    requiredModels: ["kimi-k2.6", "kimi-k2.5", "moonshot-v1-128k"],
    requiredCapabilities: ["streaming", "function_calling", "vision", "structured_output"],
    envKey: "MOONSHOT_API_KEY",
    officialUrl: "https://platform.kimi.com/docs/api/overview"
  },
  {
    id: "zhipu",
    label: "Zhipu GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiMode: "chat_completions",
    requiredModels: ["glm-5.1", "glm-5-turbo", "glm-5", "glm-4.7", "glm-4.7-flash"],
    requiredCapabilities: ["streaming", "function_calling", "web_search", "structured_output"],
    envKey: "ZHIPU_API_KEY",
    officialUrl: "https://docs.bigmodel.cn/api-reference"
  }
];

const providers = new Map(createDefaultProviders().map((provider) => [provider.id, provider]));
const rows = [];
const failures = [];

for (const expected of matrix) {
  const provider = providers.get(expected.id);
  const row = {
    provider: expected.label,
    id: expected.id,
    static: "ok",
    live: live ? "pending" : "not-run"
  };

  if (!provider) {
    row.static = "missing";
    failures.push(`${expected.id}: provider missing from createDefaultProviders()`);
    rows.push(row);
    continue;
  }

  const normalizedBaseUrl = normalizeUrl(provider.baseUrl ?? "");
  const expectedBaseUrl = normalizeUrl(expected.baseUrl);
  if (normalizedBaseUrl !== expectedBaseUrl) {
    failures.push(`${expected.id}: baseUrl expected ${expectedBaseUrl}, got ${normalizedBaseUrl || "(empty)"}`);
  }
  if (provider.apiMode !== expected.apiMode) {
    failures.push(`${expected.id}: apiMode expected ${expected.apiMode}, got ${provider.apiMode}`);
  }
  for (const model of expected.requiredModels) {
    if (!provider.models.includes(model)) {
      failures.push(`${expected.id}: missing model ${model}`);
    }
  }
  for (const capability of expected.requiredCapabilities) {
    if (!provider.capabilities.includes(capability)) {
      failures.push(`${expected.id}: missing capability ${capability}`);
    }
  }

  row.static = failures.some((failure) => failure.startsWith(`${expected.id}:`)) ? "fail" : "ok";
  rows.push(row);
}

if (live) {
  for (const row of rows) {
    const expected = matrix.find((item) => item.id === row.id);
    if (!expected || row.static !== "ok") {
      row.live = "skipped";
      continue;
    }
    const apiKey = process.env[expected.envKey];
    if (!apiKey) {
      row.live = `skipped:${expected.envKey}`;
      continue;
    }
    const result = await probeModelsEndpoint(expected, apiKey);
    row.live = result.ok ? `ok:${result.status}` : `fail:${result.status ?? "error"}`;
    if (!result.ok) {
      failures.push(`${expected.id}: live probe failed: ${result.message}`);
    }
  }
}

console.log(formatTable(rows));

if (failures.length) {
  console.error("\nProvider matrix check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  live
    ? "\nProvider matrix check passed. Live probes ran only for providers with matching env keys."
    : "\nProvider matrix check passed. Static defaults match the documented domestic provider matrix."
);

async function probeModelsEndpoint(expected, apiKey) {
  const url = `${normalizeUrl(expected.baseUrl)}/models`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000).unref();
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal
    });
    if (response.ok) {
      return { ok: true, status: response.status, message: "ok" };
    }
    const text = await response.text();
    return {
      ok: false,
      status: response.status,
      message: `HTTP ${response.status}${text ? ` ${text.slice(0, 180)}` : ""}`
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "unknown error"
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeUrl(url) {
  return url.replace(/\/+$/, "");
}

function formatTable(items) {
  const headers = ["provider", "id", "static", "live"];
  const widths = Object.fromEntries(
    headers.map((header) => [
      header,
      Math.max(header.length, ...items.map((item) => String(item[header] ?? "").length))
    ])
  );
  const separator = headers.map((header) => "-".repeat(widths[header])).join("-+-");
  const lines = [
    headers.map((header) => header.padEnd(widths[header])).join(" | "),
    separator,
    ...items.map((item) => headers.map((header) => String(item[header] ?? "").padEnd(widths[header])).join(" | "))
  ];
  return lines.join("\n");
}
