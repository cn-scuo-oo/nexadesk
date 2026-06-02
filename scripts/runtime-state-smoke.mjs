import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "nexadesk-runtime-"));
const settingsPath = join(dataDir, "settings.json");
const secretsPath = join(dataDir, "secrets.encrypted.json");
const runtimeStatePath = join(dataDir, "runtime-state.json");
const secretKey = randomBytes(32).toString("base64");
const fakeReply = "runtime persistence reply";
const userPrompt = "verify this message is persisted";
const toolPrompt = "please list the workspace";
const agentOverridePrompt = "verify the report agent provider override";
const agentOverrideReply = "agent provider override reply";
const approvalReason = "not allowed in smoke test";
const toolReply = [
  "need approval before writing",
  "```nexadesk-tool",
  JSON.stringify({ tool: "write_file", path: "approval-smoke.txt", content: "hello" }),
  "```"
].join("\n");
const seenModels = [];

let fakeModelServer;
let firstApi;
let secondApi;

try {
  const modelPort = await getFreePort();
  fakeModelServer = await startFakeModelServer(modelPort);

  const firstPort = await getFreePort();
  firstApi = startApi(firstPort);
  await waitForHealth(firstPort, firstApi);

  const initial = await requestJson(firstPort, "/api/settings");
  const providerId = "openai-compatible";
  const model = "fake-runtime-model";
  const agentProviderId = "newapi";
  const agentModel = "agent-runtime-model";
  const provider = initial.providers.find((item) => item.id === providerId);
  const agentProvider = initial.providers.find((item) => item.id === agentProviderId);
  assert(provider, "openai-compatible provider was not found");
  assert(agentProvider, "newapi provider was not found");
  const configuredProvider = {
    ...provider,
    connected: true,
    baseUrl: `http://127.0.0.1:${modelPort}/v1`,
    models: [model],
    defaultModel: model
  };
  const configuredAgentProvider = {
    ...agentProvider,
    connected: true,
    baseUrl: `http://127.0.0.1:${modelPort}/v1`,
    models: [agentModel],
    defaultModel: agentModel
  };

  await requestJson(firstPort, "/api/settings", {
    method: "PUT",
    body: JSON.stringify({
      settings: {
        ...initial,
        model: {
          activeProviderId: providerId,
          activeModel: model
        },
        workspace: {
          ...initial.workspace,
          defaultWorkspace: dataDir,
          exportDirectory: dataDir,
          allowedRoots: [dataDir]
        },
        providers: initial.providers.map((item) =>
          item.id === providerId
            ? configuredProvider
            : item.id === agentProviderId
              ? configuredAgentProvider
            : item
        ),
        assistant: {
          ...initial.assistant,
          agents: initial.assistant.agents.map((agent) =>
            agent.id === "report" ? { ...agent, providerId: agentProviderId } : agent
          )
        }
      },
      providerSecrets: [
        { providerId, apiKey: "sk-runtime-smoke" },
        { providerId: agentProviderId, apiKey: "sk-agent-runtime-smoke" }
      ]
    })
  });
  await writeFile(join(dataDir, "workspace-smoke.txt"), "workspace tool smoke", "utf8");

  const refreshedModels = await requestJson(firstPort, "/api/providers/models", {
    method: "POST",
    body: JSON.stringify({ provider: configuredProvider, timeoutMs: 8000 })
  });
  assert(refreshedModels.ok === true, "provider models refresh did not succeed");
  assert(
    refreshedModels.models.includes("fake-runtime-model"),
    "provider models refresh did not return the fake model"
  );
  assert(refreshedModels.checkedAt, "provider models refresh did not return a checkedAt timestamp");

  const testedProvider = await requestJson(firstPort, "/api/providers/test", {
    method: "POST",
    body: JSON.stringify({ provider: configuredProvider, timeoutMs: 8000 })
  });
  assert(testedProvider.ok === true, "provider test did not succeed");
  assert(testedProvider.checkedAt, "provider test did not return a checkedAt timestamp");

  const settingsWithProviderStatus = await requestJson(firstPort, "/api/settings");
  assert(
    settingsWithProviderStatus.providerStatus?.tests?.[providerId]?.ok === true,
    "provider test status was not persisted to settings"
  );
  assert(
    settingsWithProviderStatus.providerStatus?.modelRefreshes?.[providerId]?.models?.includes("fake-runtime-model"),
    "provider model refresh status was not persisted to settings"
  );

  const before = await requestJson(firstPort, "/api/snapshot");
  const sessionId = before.sessions[0]?.id;
  assert(sessionId, "snapshot did not include a session");

  await requestText(firstPort, `/api/sessions/${sessionId}/messages/stream`, {
    method: "POST",
    body: JSON.stringify({ content: userPrompt, providerId, model, agentId: "cowork" })
  });
  await requestText(firstPort, `/api/sessions/${sessionId}/messages/stream`, {
    method: "POST",
    body: JSON.stringify({ content: toolPrompt, providerId, model, agentId: "cowork" })
  });
  await requestText(firstPort, `/api/sessions/${sessionId}/messages/stream`, {
    method: "POST",
    body: JSON.stringify({ content: agentOverridePrompt, agentId: "report" })
  });

  const savedState = JSON.parse(await readFile(runtimeStatePath, "utf8"));
  assert(
    savedState.messages.some((message) => message.role === "user" && message.content === userPrompt),
    "user message was not written to runtime state"
  );
  assert(
    savedState.messages.some((message) => message.role === "assistant" && message.content.includes(fakeReply)),
    "assistant reply was not written to runtime state"
  );
  assert(
    savedState.messages.some(
      (message) => message.role === "tool" && message.author === "list_dir" && message.content.includes("workspace-smoke.txt")
    ),
    "low-risk tool result message was not written to runtime state"
  );
  assert(
    seenModels.includes(agentModel),
    "agent provider override did not send the agent provider model to the fake runtime"
  );
  assert(
    savedState.messages.some(
      (message) => message.role === "assistant" && message.content.includes(agentOverrideReply)
    ),
    "agent provider override reply was not written to runtime state"
  );

  await requestText(firstPort, `/api/sessions/${sessionId}/messages/stream`, {
    method: "POST",
    body: JSON.stringify({ content: "please request a write approval", providerId, model, agentId: "cowork" })
  });
  const withApproval = await requestJson(firstPort, "/api/snapshot");
  const approval = withApproval.approvals.find((item) => item.toolName === "write_file");
  assert(approval, "write_file approval was not queued");

  const resolved = await requestJson(firstPort, `/api/approvals/${approval.id}/resolve`, {
    method: "POST",
    body: JSON.stringify({ approved: false, reason: approvalReason })
  });
  assert(resolved.history?.decision === "rejected", "approval rejection history was not returned");
  assert(resolved.history?.reason === approvalReason, "approval rejection reason was not returned");

  const stateWithHistory = JSON.parse(await readFile(runtimeStatePath, "utf8"));
  assert(
    stateWithHistory.approvalHistory.some((item) => item.id === approval.id && item.reason === approvalReason),
    "approval rejection history was not written to runtime state"
  );

  await stopApi(firstApi);
  firstApi = null;

  const secondPort = await getFreePort();
  secondApi = startApi(secondPort);
  await waitForHealth(secondPort, secondApi);

  const restored = await requestJson(secondPort, "/api/snapshot");
  const restoredSettings = await requestJson(secondPort, "/api/settings");
  assert(
    restoredSettings.providerStatus?.tests?.[providerId]?.ok === true,
    "provider test status did not survive server restart"
  );
  assert(
    restoredSettings.providerStatus?.modelRefreshes?.[providerId]?.models?.includes("fake-runtime-model"),
    "provider model refresh status did not survive server restart"
  );
  assert(
    restored.messages.some((message) => message.role === "user" && message.content === userPrompt),
    "user message did not survive server restart"
  );
  assert(
    restored.messages.some((message) => message.role === "assistant" && message.content.includes(fakeReply)),
    "assistant reply did not survive server restart"
  );
  assert(
    restored.messages.some(
      (message) => message.role === "tool" && message.author === "list_dir" && message.content.includes("workspace-smoke.txt")
    ),
    "low-risk tool result message did not survive server restart"
  );
  assert(
    restored.messages.some(
      (message) => message.role === "assistant" && message.content.includes(agentOverrideReply)
    ),
    "agent provider override reply did not survive server restart"
  );
  assert(
    restored.approvalHistory.some((item) => item.id === approval.id && item.reason === approvalReason),
    "approval history did not survive server restart"
  );

  console.log("NexaDesk runtime state smoke test passed.");
} finally {
  if (firstApi) {
    await stopApi(firstApi);
  }
  if (secondApi) {
    await stopApi(secondApi);
  }
  if (fakeModelServer) {
    await new Promise((resolve) => fakeModelServer.close(resolve));
  }
  await rm(dataDir, { recursive: true, force: true });
}

function startApi(port) {
  const child = spawn(process.execPath, ["apps/server/dist/index.cjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXADESK_HOST: "127.0.0.1",
      NEXADESK_PORT: String(port),
      NEXADESK_DATA_DIR: dataDir,
      NEXADESK_SETTINGS_PATH: settingsPath,
      NEXADESK_SECRETS_PATH: secretsPath,
      NEXADESK_RUNTIME_STATE_PATH: runtimeStatePath,
      NEXADESK_SECRET_KEY: secretKey
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.output = "";
  child.stdout.on("data", (chunk) => {
    child.output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    child.output += chunk.toString();
  });
  return child;
}

async function startFakeModelServer(port) {
  const server = createHttpServer((request, response) => {
    if (request.url === "/v1/chat/completions") {
      response.writeHead(200, {
        "Cache-Control": "no-cache",
        "Content-Type": "text/event-stream"
      });
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        let latestUserContent = body;
        try {
          const payload = JSON.parse(body);
          if (typeof payload.model === "string") {
            seenModels.push(payload.model);
          }
          const messages = Array.isArray(payload.messages) ? payload.messages : [];
          const latestUser = messages.findLast((message) => message?.role === "user");
          latestUserContent = typeof latestUser?.content === "string" ? latestUser.content : "";
        } catch {
          latestUserContent = body;
        }

        const content = latestUserContent.includes(toolPrompt)
          ? [
              "I will inspect the workspace.",
              "```nexadesk-tool",
              JSON.stringify({ tool: "list_dir", path: "." }),
              "```"
            ].join("\n")
          : latestUserContent.includes(agentOverridePrompt)
            ? agentOverrideReply
          : latestUserContent.includes("please request a write approval")
            ? toolReply
            : fakeReply;
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
        response.write("data: [DONE]\n\n");
        response.end();
      });
      return;
    }

    if (request.url === "/v1/models") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "fake-runtime-model" }, { id: "agent-runtime-model" }] }));
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("not found");
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server;
}

async function waitForHealth(port, child) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      await sleep(200);
    }
  }
  throw new Error(`API did not become healthy. Output:\n${child.output}`);
}

async function requestJson(port, path, init = {}) {
  const response = await request(port, path, init);
  return response.json();
}

async function requestText(port, path, init = {}) {
  const response = await request(port, path, init);
  return response.text();
}

async function request(port, path, init = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    },
    ...init
  });
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${await response.text()}`);
  }
  return response;
}

async function stopApi(child) {
  if (child.exitCode !== null) {
    return;
  }
  await new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill();
    setTimeout(resolve, 2000).unref();
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
