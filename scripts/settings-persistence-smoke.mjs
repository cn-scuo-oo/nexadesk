import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = "49397";
const dataDir = await mkdtemp(join(tmpdir(), "nexadesk-settings-"));
const settingsPath = join(dataDir, "settings.json");
const secretsPath = join(dataDir, "secrets.encrypted.json");
const secretKey = randomBytes(32).toString("base64");

const child = spawn(process.execPath, ["apps/server/dist/index.cjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NEXADESK_HOST: "127.0.0.1",
    NEXADESK_PORT: port,
    NEXADESK_DATA_DIR: dataDir,
    NEXADESK_SETTINGS_PATH: settingsPath,
    NEXADESK_SECRETS_PATH: secretsPath,
    NEXADESK_SECRET_KEY: secretKey
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

try {
  await waitForHealth();

  const initial = await requestJson("/api/settings");
  const providerId = "openai-compatible";
  const settings = {
    ...initial,
    model: {
      activeProviderId: providerId,
      activeModel: "deepseek-chat"
    },
    appearance: {
      ...initial.appearance,
      fontFamily: "JetBrains Mono",
      fontSize: 15,
      density: "compact"
    },
    app: {
      ...initial.app,
      logLevel: "debug"
    },
    providers: initial.providers.map((provider) =>
      provider.id === providerId
        ? {
            ...provider,
            connected: true,
            baseUrl: "https://api.example.com/v1",
            models: ["deepseek-chat", "qwen-plus"],
            defaultModel: "deepseek-chat"
          }
        : provider
    )
  };

  await requestJson("/api/settings", {
    method: "PUT",
    body: JSON.stringify({
      settings,
      providerSecrets: [{ providerId, apiKey: "sk-test-persistence" }]
    })
  });

  const reloaded = await requestJson("/api/settings");
  const provider = reloaded.providers.find((item) => item.id === providerId);
  assert(reloaded.model.activeProviderId === providerId, "active provider did not persist");
  assert(reloaded.model.activeModel === "deepseek-chat", "active model did not persist");
  assert(reloaded.appearance.fontFamily === "JetBrains Mono", "font family did not persist");
  assert(reloaded.appearance.fontSize === 15, "font size did not persist");
  assert(reloaded.app.logLevel === "debug", "log level did not persist");
  assert(provider?.apiKeyConfigured === true, "provider API key state did not persist");

  const secretsRaw = await readFile(secretsPath, "utf8");
  const secrets = JSON.parse(secretsRaw);
  assert(secrets.encrypted === true, "secrets file was not encrypted");
  assert(!secretsRaw.includes("sk-test-persistence"), "plain API key leaked into secrets file");

  await requestJson("/api/settings", {
    method: "PUT",
    body: JSON.stringify({
      settings: reloaded,
      providerSecrets: [{ providerId, clearApiKey: true }]
    })
  });
  const cleared = await requestJson("/api/settings");
  assert(
    cleared.providers.find((item) => item.id === providerId)?.apiKeyConfigured === false,
    "provider API key clear did not persist"
  );

  const customProviderId = "custom-prune-smoke";
  const customProvider = {
    id: customProviderId,
    name: "Custom prune smoke",
    kind: "openai_compatible",
    apiMode: "chat_completions",
    connected: true,
    baseUrl: "https://api.example.com/v1",
    models: ["custom-model"],
    defaultModel: "custom-model",
    apiKeyConfigured: false,
    capabilities: ["streaming"]
  };
  const withCustomProvider = {
    ...cleared,
    providers: [...cleared.providers, customProvider]
  };
  await requestJson("/api/settings", {
    method: "PUT",
    body: JSON.stringify({
      settings: withCustomProvider,
      providerSecrets: [{ providerId: customProviderId, apiKey: "sk-custom-prune" }]
    })
  });
  const customSaved = await requestJson("/api/settings");
  assert(
    customSaved.providers.find((item) => item.id === customProviderId)?.apiKeyConfigured === true,
    "custom provider key was not saved"
  );

  const withoutCustomProvider = {
    ...customSaved,
    providers: customSaved.providers.filter((provider) => provider.id !== customProviderId)
  };
  await requestJson("/api/settings", {
    method: "PUT",
    body: JSON.stringify({ settings: withoutCustomProvider, providerSecrets: [] })
  });
  const customDeleted = await requestJson("/api/settings");
  assert(!customDeleted.providers.some((item) => item.id === customProviderId), "custom provider was not deleted");

  await requestJson("/api/settings", {
    method: "PUT",
    body: JSON.stringify({
      settings: {
        ...customDeleted,
        providers: [...customDeleted.providers, customProvider]
      },
      providerSecrets: []
    })
  });
  const customReadded = await requestJson("/api/settings");
  assert(
    customReadded.providers.find((item) => item.id === customProviderId)?.apiKeyConfigured === false,
    "deleted provider key was not pruned"
  );

  await requestJson("/api/settings", {
    method: "PUT",
    body: JSON.stringify({
      settings: customReadded,
      providerSecrets: [{ providerId, apiKey: "sk-recovery-preserve" }]
    })
  });
  await writeFile(settingsPath, "{ broken settings json", "utf8");
  const recovered = await requestJson("/api/settings/recover", {
    method: "POST",
    body: JSON.stringify({ resetSecrets: false })
  });
  assert(recovered.backupPaths.length >= 1, "corrupted settings file was not backed up");
  assert(recovered.settings.model.activeProviderId, "recovered settings did not include an active provider");
  assert(
    recovered.settings.providers.find((item) => item.id === providerId)?.apiKeyConfigured === true,
    "settings recovery did not preserve readable provider secret state"
  );
  const afterRecovery = await requestJson("/api/settings");
  assert(afterRecovery.updatedAt === recovered.settings.updatedAt, "recovered settings did not persist");

  console.log(`NexaDesk settings persistence smoke test passed on port ${port}.`);
} finally {
  child.kill();
  await rm(dataDir, { recursive: true, force: true });
}

async function waitForHealth() {
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
  throw new Error(`API did not become healthy. Output:\n${output}`);
}

async function requestJson(path, init = {}) {
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
  return response.json();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
