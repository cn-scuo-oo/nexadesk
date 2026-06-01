import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "nexadesk-runtime-"));
const settingsPath = join(dataDir, "settings.json");
const secretsPath = join(dataDir, "secrets.encrypted.json");
const runtimeStatePath = join(dataDir, "runtime-state.json");
const secretKey = randomBytes(32).toString("base64");
const fakeReply = "持久化测试回复";
const userPrompt = "请验证这条消息会被持久化。";

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
  const provider = initial.providers.find((item) => item.id === providerId);
  assert(provider, "openai-compatible provider was not found");

  await requestJson(firstPort, "/api/settings", {
    method: "PUT",
    body: JSON.stringify({
      settings: {
        ...initial,
        model: {
          activeProviderId: providerId,
          activeModel: model
        },
        providers: initial.providers.map((item) =>
          item.id === providerId
            ? {
                ...item,
                connected: true,
                baseUrl: `http://127.0.0.1:${modelPort}/v1`,
                models: [model],
                defaultModel: model
              }
            : item
        )
      },
      providerSecrets: [{ providerId, apiKey: "sk-runtime-smoke" }]
    })
  });

  const before = await requestJson(firstPort, "/api/snapshot");
  const sessionId = before.sessions[0]?.id;
  assert(sessionId, "snapshot did not include a session");

  await requestText(firstPort, `/api/sessions/${sessionId}/messages/stream`, {
    method: "POST",
    body: JSON.stringify({ content: userPrompt, providerId, model, agentId: "cowork" })
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

  await stopApi(firstApi);
  firstApi = null;

  const secondPort = await getFreePort();
  secondApi = startApi(secondPort);
  await waitForHealth(secondPort, secondApi);

  const restored = await requestJson(secondPort, "/api/snapshot");
  assert(
    restored.messages.some((message) => message.role === "user" && message.content === userPrompt),
    "user message did not survive server restart"
  );
  assert(
    restored.messages.some((message) => message.role === "assistant" && message.content.includes(fakeReply)),
    "assistant reply did not survive server restart"
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
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: fakeReply } }] })}\n\n`);
      response.write("data: [DONE]\n\n");
      response.end();
      return;
    }

    if (request.url === "/v1/models") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "fake-runtime-model" }] }));
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
