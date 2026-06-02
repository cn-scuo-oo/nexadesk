import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = "49397";
const dataDir = await mkdtemp(join(tmpdir(), "nexadesk-settings-"));
const settingsPath = join(dataDir, "settings.json");
const secretsPath = join(dataDir, "secrets.encrypted.json");
const workspaceDir = join(dataDir, "workspace");
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
  await mkdir(workspaceDir, { recursive: true });
  await writeFile(join(workspaceDir, "workspace-panel-smoke.txt"), "workspace panel smoke", "utf8");

  const initial = await requestJson("/api/settings");
  const providerId = "openai-compatible";
  assert(initial.providerStatus?.tests, "provider status defaults were not present");
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
    workspace: {
      ...initial.workspace,
      defaultWorkspace: workspaceDir,
      exportDirectory: workspaceDir,
      allowedRoots: [workspaceDir]
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
  assert(reloaded.workspace.defaultWorkspace === workspaceDir, "workspace path did not persist");
  assert(provider?.apiKeyConfigured === true, "provider API key state did not persist");
  const workspaceList = await requestJson("/api/workspace/list?path=.");
  assert(workspaceList.exists === true, "workspace list did not report an existing directory");
  assert(
    workspaceList.entries.some((entry) => entry.name === "workspace-panel-smoke.txt" && entry.kind === "file"),
    "workspace list did not include the smoke file"
  );
  const workspaceFile = await requestJson("/api/workspace/file?path=workspace-panel-smoke.txt");
  assert(workspaceFile.exists === true, "workspace file preview did not report an existing file");
  assert(workspaceFile.content === "workspace panel smoke", "workspace file preview did not return the smoke file content");
  const workspaceNameSearch = await requestJson("/api/workspace/search?query=panel&mode=name&path=.");
  assert(
    workspaceNameSearch.matches.some((match) => match.name === "workspace-panel-smoke.txt"),
    "workspace filename search did not include the smoke file"
  );
  const workspaceContentSearch = await requestJson("/api/workspace/search?query=workspace%20panel&mode=content&path=.");
  assert(
    workspaceContentSearch.matches.some((match) => match.path === "workspace-panel-smoke.txt" && match.line === 1),
    "workspace content search did not include the smoke file"
  );

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
    providers: [...cleared.providers, customProvider],
    providerStatus: {
      tests: {
        ...cleared.providerStatus.tests,
        [customProviderId]: {
          ok: true,
          message: "custom provider test smoke",
          checkedAt: new Date().toISOString()
        }
      },
      modelRefreshes: {
        ...cleared.providerStatus.modelRefreshes,
        [customProviderId]: {
          ok: true,
          message: "custom provider refresh smoke",
          checkedAt: new Date().toISOString(),
          models: ["custom-model"]
        }
      }
    }
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
  assert(
    !customDeleted.providerStatus.tests[customProviderId] &&
      !customDeleted.providerStatus.modelRefreshes[customProviderId],
    "deleted provider status was not pruned"
  );

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
