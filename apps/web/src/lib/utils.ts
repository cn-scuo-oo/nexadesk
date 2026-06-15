// App utility functions extracted from App.tsx
function sanitizeImportedSkills(value: unknown, fileName: string): SkillProfile[] {
  const candidates = Array.isArray(value)
    ? value
    : Array.isArray((value as { skills?: unknown })?.skills)
      ? (value as { skills: unknown[] }).skills
      : (value as { skill?: unknown })?.skill
        ? [(value as { skill: unknown }).skill]
        : [value];
  return candidates
    .map((item, index) => sanitizeImportedSkill(item, fileName, index))
    .filter((skill): skill is SkillProfile => Boolean(skill));
}

function sanitizeImportedSkill(value: unknown, fileName: string, index: number): SkillProfile | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Partial<SkillProfile> & { path?: string; prompt?: string };
  const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : "";
  const instructions =
    typeof record.instructions === "string" && record.instructions.trim()
      ? record.instructions.trim()
      : typeof record.prompt === "string" && record.prompt.trim()
        ? record.prompt.trim()
        : "";
  if (!name || !instructions) {
    return null;
  }
  const baseId =
    typeof record.id === "string" && record.id.trim()
      ? record.id.trim()
      : `${fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-")}-${index + 1}`;
  const source: SkillProfile["source"] = record.source === "extension" ? "extension" : "custom";
  return {
    id: `custom-${baseId}`.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase(),
    name,
    description:
      typeof record.description === "string" && record.description.trim()
        ? record.description.trim()
        : `Imported from ${fileName}`,
    enabled: typeof record.enabled === "boolean" ? record.enabled : true,
    source,
    instructions
  };
}

function createSkillFromPluginDirectory(directory: string): SkillProfile {
  const normalized = directory.replace(/[\\/]+$/, "");
  const name = normalized.split(/[\\/]/).filter(Boolean).pop() ?? "Local plugin skill";
  return {
    id: `local-plugin-${hashShort(normalized)}`,
    name,
    description: `本地插件目录：${normalized}`,
    enabled: true,
    source: "extension",
    instructions: `使用本地插件目录中的技能说明和工具资源。目录路径：${normalized}。执行前先确认目录内容和高风险动作审批。`
  };
}

function mergeImportedSkills(existing: SkillProfile[], imported: SkillProfile[]) {
  const importedById = new Map(imported.map((skill) => [skill.id, skill]));
  const merged = existing.map((skill) => importedById.get(skill.id) ?? skill);
  const existingIds = new Set(existing.map((skill) => skill.id));
  return [...merged, ...imported.filter((skill) => !existingIds.has(skill.id))];
}

function hashShort(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function DiagnosticRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="diagnostic-row">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}

function formatDesktopDiagnostics(status: DesktopStatus) {
  return [
    `App: ${status.appName} ${status.version}`,
    `Mode: ${status.mode}`,
    `API: ${status.apiBase}`,
    `Data directory: ${status.dataDir ?? "Not set"}`,
    `Settings file: ${status.settingsPath ?? "Not set"}`,
    `Secrets file: ${status.secretsPath ?? "Not set"}`,
    `Runtime state: ${status.runtimeStatePath ?? "Not set"}`,
    `Secrets encrypted: ${status.secretsEncrypted ? "yes" : "no"}`,
    `System secure storage: ${status.safeStorage}`,
    `Log file: ${status.logPath ?? "Not set"}`,
    `Crash log: ${status.crashLogPath ?? "Not set"}`,
    `Platform: ${status.platform} / ${status.arch}`,
    `Node: ${status.nodeVersion}`,
    `Electron: ${status.electronVersion ?? "Not set"}`,
    `Uptime: ${status.uptimeSeconds}s`
  ].join("\n");
}

function uniquePathList(paths: string[]) {
  return Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)));
}

function createLocalApprovalHistory(
  approval: PermissionRequest,
  decision: ApprovalHistoryEntry["decision"],
  reason?: string
): ApprovalHistoryEntry {
  return {
    ...approval,
    decision,
    resolvedAt: new Date().toISOString(),
    reason: reason?.trim() || undefined
  };
}

/* ── Missing helper functions ── */

function appSettingLabel(key: string): string {
  const map: Record<string, string> = {
    launchAtStartup: "开机启动",
    autoUpdate: "自动更新",
    telemetry: "遥测",
    logLevel: "日志级别"
  };
  return map[key] ?? key;
}

function inspectProviderMatrixItem(item: ProviderMatrixItem): string {
  return `${item.label} (${item.baseUrl})`;
}

function resultToProviderStatusRecord(result: ProviderTestResult): ProviderStatusRecord {
  return {
    ok: result.ok,
    status: result.status,
    message: result.message,
    checkedUrl: result.checkedAt,
    checkedAt: result.checkedAt ?? new Date().toISOString()
  };
}

function renderProviderNote(
  draft: any,
  savedId?: string,
  test?: ProviderTestResult,
  refresh?: ProviderModelsResult
): string {
  return "";
}

function createCapabilityRecord(caps?: string[]): Record<string, boolean> {
  const record: Record<string, boolean> = {};
  for (const opt of capabilityOptions) record[opt.value] = caps?.includes(opt.value) ?? false;
  return record;
}

function formatProviderCheckTime(iso?: string): string {
  if (!iso) return "未检查";
  try {
    return new Date(iso).toLocaleString("zh-CN");
  } catch {
    return iso;
  }
}

function parseModels(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function sanitizeImportedProvider(item: unknown): ProviderSettings | null {
  if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") return null;
  return {
    id: item.id,
    name: item.name,
    kind: typeof item.kind === "string" ? (item.kind as ProviderSettings["kind"]) : "openai_compatible",
    apiMode: typeof item.apiMode === "string" ? (item.apiMode as ProviderApiMode) : "chat_completions",
    connected: false,
    baseUrl: typeof item.baseUrl === "string" ? item.baseUrl : "",
    models: Array.isArray(item.models) ? item.models.filter((m: unknown) => typeof m === "string") : [],
    defaultModel: typeof item.defaultModel === "string" ? item.defaultModel : "",
    apiKeyConfigured: false,
    capabilities: (Array.isArray(item.capabilities)
      ? item.capabilities.filter((c: unknown) => typeof c === "string")
      : []) as ProviderCapability[]
  };
}

function sanitizeImportedSettings(value: unknown, fallback: AppSettings): AppSettings {
  if (!isRecord(value) || !Array.isArray(value.providers)) {
    throw new Error("文件不是 NexaDesk 设置 JSON。");
  }

  const providers = value.providers
    .map((item) => sanitizeImportedProvider(item))
    .filter((provider): provider is ProviderSettings => Boolean(provider));

  if (providers.length === 0) {
    throw new Error("导入文件里没有可用 Provider。");
  }
  const firstProvider = providers[0];
  if (!firstProvider) {
    throw new Error("导入文件里没有可用 Provider。");
  }

  const model = isRecord(value.model) ? value.model : {};
  const activeProviderId =
    typeof model.activeProviderId === "string" && providers.some((provider) => provider.id === model.activeProviderId)
      ? model.activeProviderId
      : firstProvider.id;
  const activeProvider = providers.find((provider) => provider.id === activeProviderId) ?? firstProvider;

  return {
    ...fallback,
    providers,
    model: {
      activeProviderId,
      activeModel: typeof model.activeModel === "string" ? model.activeModel : activeProvider.defaultModel
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}