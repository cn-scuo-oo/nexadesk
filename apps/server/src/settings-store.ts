import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, rename } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  createDefaultProviders,
  createDefaultSettings,
  type AppSettings,
  type ModelProvider,
  type ProviderStatusSettings,
  type ProviderSecretUpdate
} from "@nexadesk/shared";

type SecretFile = {
  providerKeys: Record<string, { apiKey: string; updatedAt: string }>;
};

type EncryptedSecretFile = {
  encrypted: true;
  algorithm: "aes-256-gcm";
  iv: string;
  tag: string;
  data: string;
};

const repoRoot = resolve(getEnv("NEXADESK_REPO_ROOT", "AION_LITE_REPO_ROOT") ?? process.cwd());
const settingsPath = getEnv("NEXADESK_SETTINGS_PATH", "AION_LITE_SETTINGS_PATH") ?? join(repoRoot, "data", "settings.json");
const secretsPath =
  getEnv("NEXADESK_SECRETS_PATH", "AION_LITE_SECRETS_PATH") ?? join(repoRoot, "data", "secrets.local.json");

export type SettingsRecoveryResult = {
  settings: AppSettings;
  backupPaths: string[];
  resetSecrets: boolean;
  warning?: string;
};

export async function loadSettings(providers: ModelProvider[]): Promise<AppSettings> {
  const defaults = createDefaultSettings(createDefaultProviders());
  const saved = await readJson<AppSettings>(settingsPath);
  const secrets = await loadSecrets();
  return applySecretState(mergeSettings(defaults, saved), secrets);
}

export async function saveSettings(
  input: AppSettings,
  providers: ModelProvider[],
  providerSecrets: ProviderSecretUpdate[] = []
): Promise<AppSettings> {
  const defaults = createDefaultSettings(createDefaultProviders());
  const currentSecrets = await loadSecrets();
  const updatedSecrets = applySecretUpdates(currentSecrets, providerSecrets);
  const merged = mergeSettings(defaults, input);
  const prunedSecrets = pruneSecretsToProviders(updatedSecrets, merged.providers);
  const next = applySecretState(merged, prunedSecrets);
  const sanitized: AppSettings = {
    ...next,
    providers: next.providers.map((provider) => ({
      ...provider,
      apiKeyConfigured: Boolean(prunedSecrets.providerKeys[provider.id])
    })),
    updatedAt: new Date().toISOString()
  };

  await writeJson(settingsPath, sanitized);
  await writeSecrets(prunedSecrets);
  return sanitized;
}

export async function getProviderApiKey(providerId: string): Promise<string | undefined> {
  const secrets = await loadSecrets();
  return secrets.providerKeys[providerId]?.apiKey;
}

export async function recoverSettings(
  providers: ModelProvider[],
  options: { resetSecrets?: boolean } = {}
): Promise<SettingsRecoveryResult> {
  const backupPaths: string[] = [];
  const settingsBackup = await backupFileIfExists(settingsPath, "recovered-settings");
  if (settingsBackup) {
    backupPaths.push(settingsBackup);
  }

  let secrets: SecretFile = { providerKeys: {} };
  let warning: string | undefined;
  const resetSecrets = Boolean(options.resetSecrets);

  if (resetSecrets) {
    const secretsBackup = await backupFileIfExists(secretsPath, "recovered-secrets");
    if (secretsBackup) {
      backupPaths.push(secretsBackup);
    }
    await writeSecrets(secrets);
  } else {
    try {
      secrets = await loadSecrets();
    } catch (error) {
      const secretsBackup = await backupFileIfExists(secretsPath, "recovered-secrets");
      if (secretsBackup) {
        backupPaths.push(secretsBackup);
      }
      warning =
        error instanceof Error
          ? `Secrets file could not be read and was reset: ${error.message}`
          : "Secrets file could not be read and was reset.";
      await writeSecrets(secrets);
    }
  }

  const defaults = createDefaultSettings(providers.length ? providers : createDefaultProviders());
  const recovered = {
    ...applySecretState(defaults, secrets),
    updatedAt: new Date().toISOString()
  };
  await writeJson(settingsPath, recovered);
  return { settings: recovered, backupPaths, resetSecrets, warning };
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function backupFileIfExists(path: string, label: string) {
  try {
    await access(path, constants.F_OK);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${path}.${label}-${timestamp}.bak`;
  await mkdir(dirname(backupPath), { recursive: true });
  await rename(path, backupPath);
  return backupPath;
}

async function loadSecrets(): Promise<SecretFile> {
  const raw = await readJson<SecretFile | EncryptedSecretFile>(secretsPath);
  if (!raw) {
    return { providerKeys: {} };
  }
  if (isEncryptedSecretFile(raw)) {
    return decryptSecrets(raw);
  }
  return raw as SecretFile;
}

async function writeSecrets(secrets: SecretFile) {
  const encrypted = encryptSecrets(secrets);
  await writeJson(secretsPath, encrypted ?? secrets);
}

function applySecretUpdates(secrets: SecretFile, updates: ProviderSecretUpdate[]): SecretFile {
  const next: SecretFile = {
    providerKeys: { ...secrets.providerKeys }
  };
  const now = new Date().toISOString();

  for (const update of updates) {
    if (update.clearApiKey) {
      delete next.providerKeys[update.providerId];
      continue;
    }
    if (update.apiKey?.trim()) {
      next.providerKeys[update.providerId] = {
        apiKey: update.apiKey.trim(),
        updatedAt: now
      };
    }
  }

  return next;
}

function pruneSecretsToProviders(secrets: SecretFile, providers: AppSettings["providers"]): SecretFile {
  const providerIds = new Set(providers.map((provider) => provider.id));
  return {
    providerKeys: Object.fromEntries(
      Object.entries(secrets.providerKeys).filter(([providerId]) => providerIds.has(providerId))
    )
  };
}

function encryptSecrets(secrets: SecretFile): EncryptedSecretFile | null {
  const key = getSecretEncryptionKey();
  if (!key) {
    return null;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(secrets), "utf8"), cipher.final()]);
  return {
    encrypted: true,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64")
  };
}

function decryptSecrets(file: EncryptedSecretFile): SecretFile {
  const key = getSecretEncryptionKey();
  if (!key) {
    throw new Error("Secrets file is encrypted but NEXADESK_SECRET_KEY is not configured.");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(file.iv, "base64"));
  decipher.setAuthTag(Buffer.from(file.tag, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(file.data, "base64")), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8")) as SecretFile;
}

function isEncryptedSecretFile(value: SecretFile | EncryptedSecretFile): value is EncryptedSecretFile {
  return "encrypted" in value && value.encrypted === true;
}

function getSecretEncryptionKey() {
  const value = getEnv("NEXADESK_SECRET_KEY", "AION_LITE_SECRET_KEY");
  if (!value) {
    return null;
  }
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error("NEXADESK_SECRET_KEY must be a base64 encoded 32-byte key.");
  }
  return key;
}

function getEnv(name: string, legacyName: string) {
  return process.env[name] ?? process.env[legacyName];
}

function applySecretState(settings: AppSettings, secrets: SecretFile): AppSettings {
  return {
    ...settings,
    providers: settings.providers.map((provider) => ({
      ...provider,
      apiKeyConfigured: Boolean(secrets.providerKeys[provider.id])
    }))
  };
}

function mergeSettings(defaults: AppSettings, saved: AppSettings | null): AppSettings {
  if (!saved) {
    return defaults;
  }
  const providers = mergeProviders(defaults.providers, saved.providers ?? []);

  return {
    ...defaults,
    ...saved,
    providers,
    model: { ...defaults.model, ...saved.model },
    assistant: {
      agents: mergeAgents(defaults.assistant.agents, saved.assistant?.agents ?? []),
      skills: mergeSkills(defaults.assistant.skills, saved.assistant?.skills ?? [])
    },
    providerStatus: mergeProviderStatus(defaults.providerStatus, saved.providerStatus, providers),
    appearance: { ...defaults.appearance, ...saved.appearance },
    workspace: { ...defaults.workspace, ...saved.workspace },
    permissions: { ...defaults.permissions, ...saved.permissions },
    app: { ...defaults.app, ...saved.app }
  };
}

function mergeProviders(defaultProviders: AppSettings["providers"], savedProviders: AppSettings["providers"]) {
  const savedById = new Map(savedProviders.map((provider) => [provider.id, provider]));
  const merged = defaultProviders.map((provider) => ({
    ...provider,
    ...savedById.get(provider.id),
    name: isCorruptedText(savedById.get(provider.id)?.name) ? provider.name : savedById.get(provider.id)?.name ?? provider.name
  }));
  const defaultIds = new Set(defaultProviders.map((provider) => provider.id));
  return [
    ...merged,
    ...savedProviders
      .filter((provider) => !defaultIds.has(provider.id))
      .map((provider) => ({
        ...provider,
        name: isCorruptedText(provider.name) ? "Custom model provider" : provider.name
      }))
  ];
}

function mergeProviderStatus(
  defaults: ProviderStatusSettings,
  saved: ProviderStatusSettings | undefined,
  providers: AppSettings["providers"]
) {
  const providerIds = new Set(providers.map((provider) => provider.id));
  return {
    tests: pruneProviderStatusRecord({ ...defaults.tests, ...(saved?.tests ?? {}) }, providerIds),
    modelRefreshes: pruneProviderStatusRecord(
      { ...defaults.modelRefreshes, ...(saved?.modelRefreshes ?? {}) },
      providerIds
    )
  };
}

function pruneProviderStatusRecord<T>(record: Record<string, T>, providerIds: Set<string>) {
  return Object.fromEntries(Object.entries(record).filter(([providerId]) => providerIds.has(providerId)));
}

function isCorruptedText(value: string | undefined) {
  if (!value) {
    return false;
  }
  const mojibakeMarkers = [
    "�",
    "锟",
    "鍔",
    "璁",
    "妯",
    "鎶",
    "鑷",
    "绯",
    "鐢",
    "闃",
    "纭",
    "鏈",
    "搴",
    "浣",
    "榛",
    "娴",
    "瀹",
    "绱"
  ];
  return mojibakeMarkers.some((marker) => value.includes(marker));
}

function mergeAgents(defaultAgents: AppSettings["assistant"]["agents"], savedAgents: AppSettings["assistant"]["agents"]) {
  const savedById = new Map(savedAgents.map((agent) => [agent.id, agent]));
  const merged = defaultAgents.map((agent) => ({
    ...agent,
    ...savedById.get(agent.id),
    name: isCorruptedText(savedById.get(agent.id)?.name) ? agent.name : savedById.get(agent.id)?.name ?? agent.name,
    description: isCorruptedText(savedById.get(agent.id)?.description)
      ? agent.description
      : savedById.get(agent.id)?.description ?? agent.description,
    instructions: isCorruptedText(savedById.get(agent.id)?.instructions)
      ? agent.instructions
      : savedById.get(agent.id)?.instructions ?? agent.instructions
  }));
  const defaultIds = new Set(defaultAgents.map((agent) => agent.id));
  return [...merged, ...savedAgents.filter((agent) => !defaultIds.has(agent.id))];
}

function mergeSkills(defaultSkills: AppSettings["assistant"]["skills"], savedSkills: AppSettings["assistant"]["skills"]) {
  const savedById = new Map(savedSkills.map((skill) => [skill.id, skill]));
  const merged = defaultSkills.map((skill) => ({
    ...skill,
    ...savedById.get(skill.id),
    name: isCorruptedText(savedById.get(skill.id)?.name) ? skill.name : savedById.get(skill.id)?.name ?? skill.name,
    description: isCorruptedText(savedById.get(skill.id)?.description)
      ? skill.description
      : savedById.get(skill.id)?.description ?? skill.description,
    instructions: isCorruptedText(savedById.get(skill.id)?.instructions)
      ? skill.instructions
      : savedById.get(skill.id)?.instructions ?? skill.instructions
  }));
  const defaultIds = new Set(defaultSkills.map((skill) => skill.id));
  return [...merged, ...savedSkills.filter((skill) => !defaultIds.has(skill.id))];
}
