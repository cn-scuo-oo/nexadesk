function ModuleHeader({
  actionLabel,
  detail,
  eyebrow,
  title,
  onAction
}: {
  actionLabel?: string;
  detail: string;
  eyebrow: string;
  title: string;
  onAction?: () => void;
}) {
  return (
    <header className="module-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      {actionLabel && onAction ? (
        <button className="secondary-button" onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : null}
    </header>
  );
}

function SettingsCenter({
  initialTab,
  settings,
  imChannels,
  status,
  onSave
}: {
  initialTab: SettingsTab;
  settings: AppSettings;
  imChannels?: import("./lib/types").ImAgentChannel[];
  status: string | null;
  onSave: (settings: AppSettings, providerSecrets?: ProviderSecretUpdate[]) => Promise<AppSettings>;
}) {
  const [draft, setDraft] = useState(settings);
  const [localStatus, setLocalStatus] = useState<string | null>(status);
  const [desktopStatus, setDesktopStatus] = useState<DesktopStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [detectingEngines, setDetectingEngines] = useState(false);
  const [engineDetections, setEngineDetections] = useState<AgentEngineDetectionRecord[]>([]);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    setLocalStatus(status);
  }, [status]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    let cancelled = false;
    fetchDesktopStatus()
      .then((nextStatus) => {
        if (!cancelled) {
          setDesktopStatus(nextStatus);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDesktopStatus(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function persist(next: AppSettings, providerSecrets: ProviderSecretUpdate[] = []): Promise<AppSettings> {
    setSaving(true);
    try {
      const saved = await onSave(next, providerSecrets);
      setDraft(saved);
      setLocalStatus("Settings saved.");
      return saved;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Failed to save settings.";
      setLocalStatus(message);
      throw reason instanceof Error ? reason : new Error(message);
    } finally {
      setSaving(false);
    }
  }

  function updateDraft(patch: Partial<AppSettings>) {
    setDraft((current) => ({
      ...current,
      ...patch
    }));
  }

  async function refreshDesktopStatus() {
    try {
      setDesktopStatus(await fetchDesktopStatus());
    } catch {
      setDesktopStatus(null);
    }
  }

  async function chooseDirectory({
    title,
    defaultPath,
    onSelect
  }: {
    title: string;
    defaultPath?: string;
    onSelect: (path: string) => void;
  }) {
    if (!window.nexadeskDesktop?.selectDirectory) {
      setLocalStatus("目录选择器只在桌面应用中可用。当前模式可以先手动填写路径。");
      return;
    }

    try {
      const selectedPath = await window.nexadeskDesktop.selectDirectory({ title, defaultPath });
      if (!selectedPath) {
        return;
      }
      onSelect(selectedPath);
      setLocalStatus(`已选择目录：${selectedPath}`);
    } catch (reason) {
      setLocalStatus(reason instanceof Error ? `目录选择失败：${reason.message}` : "目录选择失败。");
    }
  }

  async function copyDesktopDiagnostics() {
    try {
      const nextStatus = desktopStatus ?? (await fetchDesktopStatus());
      setDesktopStatus(nextStatus);
      await navigator.clipboard.writeText(formatDesktopDiagnostics(nextStatus));
      setCopyStatus("诊断信息已复制。");
    } catch (reason) {
      setCopyStatus(reason instanceof Error ? `复制失败：${reason.message}` : "复制失败。");
    }
  }

  const selectedRuntimeProvider =
    draft.providers.find((provider) => provider.id === draft.model.activeProviderId) ?? draft.providers[0];
  const runtimeModels = Array.from(
    new Set([draft.model.activeModel, ...(selectedRuntimeProvider?.models ?? [])])
  ).filter(Boolean);
  const canPickDirectory = Boolean(window.nexadeskDesktop?.selectDirectory);
  const activeSettingsTab = settingsTabs.find((tab) => tab.id === activeTab) ?? settingsTabs[0];

  function updateAgent(agentId: string, patch: Partial<AgentProfile>) {
    updateDraft({
      assistant: {
        ...draft.assistant,
        agents: draft.assistant.agents.map((agent) => (agent.id === agentId ? { ...agent, ...patch } : agent))
      }
    });
  }

  function updateEngine(engineId: string, patch: Partial<AgentEngineSettings>) {
    updateDraft({
      assistant: {
        ...draft.assistant,
        engines: draft.assistant.engines.map((engine) => (engine.id === engineId ? { ...engine, ...patch } : engine))
      }
    });
  }

  async function handleDetectAgentEngines() {
    setDetectingEngines(true);
    setLocalStatus(null);
    try {
      const result = await detectAgentEngines();
      setEngineDetections(result.detections);
      setDraft((current) => ({
        ...current,
        assistant: {
          ...current.assistant,
          engines: result.engines
        }
      }));
      const installed = result.detections.filter((detection) => detection.installed).length;
      setLocalStatus(`Agent 引擎检测完成：${installed}/${result.detections.length} 个可用。`);
    } catch (reason) {
      setLocalStatus(reason instanceof Error ? `Agent 引擎检测失败：${reason.message}` : "Agent 引擎检测失败。");
    } finally {
      setDetectingEngines(false);
    }
  }

  function updateSkill(skillId: string, patch: Partial<SkillProfile>) {
    updateDraft({
      assistant: {
        ...draft.assistant,
        skills: draft.assistant.skills.map((skill) => (skill.id === skillId ? { ...skill, ...patch } : skill))
      }
    });
  }

  function addCustomSkill() {
    const id = `custom-skill-${crypto.randomUUID().slice(0, 8)}`;
    updateDraft({
      assistant: {
        ...draft.assistant,
        skills: [
          ...draft.assistant.skills,
          {
            id,
            name: "自定义技能",
            description: "描述这个技能适合在什么场景使用。",
            enabled: true,
            source: "custom",
            instructions: "Define when to use this skill, what it should output, and any safety rules."
          }
        ]
      }
    });
  }

  return (
    <section className="workspace settings-workspace" id="settings">
      <div className="settings-shell">
        <aside className="settings-rail">
          <div className="settings-rail-head">
            <p className="eyebrow">设置</p>
            <h2>NexaDesk</h2>
            <span>模型、助手、工具和桌面诊断</span>
          </div>
          <nav className="settings-nav" aria-label="Settings sections">
            {settingsTabGroups.map((group) => (
              <div className="settings-nav-group" key={group.title}>
                <span>{group.title}</span>
                {group.tabs.map((tabId) => {
                  const tab = settingsTabs.find((item) => item.id === tabId);
                  if (!tab) {
                    return null;
                  }
                  return (
                    <button
                      className={activeTab === tab.id ? "settings-nav-button active" : "settings-nav-button"}
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      type="button"
                    >
                      <strong>{tab.label}</strong>
                      <small>{tab.detail}</small>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="settings-rail-foot">
            <span>{draft.providers.filter((provider) => provider.connected).length} 个模型服务</span>
            <span>{draft.assistant.agents.filter((agent) => agent.enabled).length} 个启用助手</span>
          </div>
        </aside>

        <section className="settings-main">
          <header className="settings-main-header">
            <div>
              <p className="eyebrow">{activeSettingsTab?.label ?? "设置中心"}</p>
              <h2>{activeSettingsTab?.label ?? "应用设置"}</h2>
              <p>{activeSettingsTab?.detail ?? "管理 NexaDesk 配置。"}</p>
            </div>
            <div className="settings-main-actions">
              {localStatus ? <span className="settings-status-pill">{localStatus}</span> : null}
              <button
                className="primary-button"
                disabled={saving}
                onClick={() => void persist(draft).catch(() => undefined)}
                type="button"
              >
                {saving ? "保存中..." : "保存更改"}
              </button>
            </div>
          </header>

          <div className="settings-detail">
            {activeTab === "providers" ? (
              <ProviderConfigPanel
                settings={draft}
                providers={draft.providers}
                onSaveSettings={(next, providerSecrets = []) => {
                  setDraft(next);
                  return persist(next, providerSecrets);
                }}
                onSaveProvider={(provider, providerSecrets = []) => {
                  const exists = draft.providers.some((item) => item.id === provider.id);
                  const next = {
                    ...draft,
                    providers: exists
                      ? draft.providers.map((item) => (item.id === provider.id ? provider : item))
                      : [...draft.providers, provider],
                    model:
                      draft.model.activeProviderId === provider.id || !draft.model.activeProviderId
                        ? {
                            activeProviderId: provider.id,
                            activeModel: provider.defaultModel || provider.models[0] || ""
                          }
                        : draft.model
                  };
                  setDraft(next);
                  return persist(next, providerSecrets);
                }}
              />
            ) : null}

            {activeTab === "model" ? (
              <section className="panel-block settings-section">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">模型中心</p>
                    <h3>工作台默认模型</h3>
                  </div>
                  <Zap size={18} />
                </div>
                <div className="settings-form">
                  <label className="field-label">
                    <span>默认 Provider</span>
                    <select
                      value={selectedRuntimeProvider?.id ?? ""}
                      onChange={(event) => {
                        const provider = draft.providers.find((item) => item.id === event.target.value);
                        updateDraft({
                          model: {
                            activeProviderId: event.target.value,
                            activeModel: provider?.defaultModel || provider?.models[0] || ""
                          }
                        });
                      }}
                    >
                      {draft.providers.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.connected ? "启用" : "停用"} - {provider.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    <span>默认模型</span>
                    <select
                      value={draft.model.activeModel}
                      onChange={(event) =>
                        updateDraft({
                          model: { ...draft.model, activeModel: event.target.value }
                        })
                      }
                    >
                      {runtimeModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="secret-note">
                    工作台会优先使用这里选择的 Provider 和模型。切换后保存，下一条消息就会真实调用该模型。
                  </p>
                </div>
              </section>
            ) : null}

            {activeTab === "engines" ? (
              <section className="panel-block settings-section engine-settings">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">Agent Engine Center</p>
                    <h3>外部 Agent 引擎</h3>
                  </div>
                  <button
                    className="mini-button"
                    disabled={detectingEngines}
                    onClick={() => void handleDetectAgentEngines()}
                    type="button"
                  >
                    {detectingEngines ? "检测中..." : "检测本机引擎"}
                  </button>
                </div>
                <div className="settings-form">
                  <p className="secret-note">
                    这里把模型 Provider 和 Agent 执行器拆开管理：Provider 负责 API/模型，Agent 引擎负责本机
                    CLI、运行时、权限模式和后续启动检测。
                  </p>
                  <div className="collapse-list">
                    {draft.assistant.engines.map((engine) => {
                      const detection = engineDetections.find((item) => item.engineId === engine.id);
                      return (
                        <details
                          className={engine.enabled ? "config-disclosure enabled" : "config-disclosure"}
                          key={engine.id}
                        >
                          <summary>
                            <span className="summary-main">
                              <strong>{engine.name}</strong>
                              <small>
                                {engine.kind.toUpperCase()} ·{" "}
                                {engine.setupStatus === "ready"
                                  ? "可用"
                                  : engine.setupStatus === "needs_setup"
                                    ? "待配置"
                                    : "未安装"}{" "}
                                · {engine.description}
                              </small>
                            </span>
                            <label className="connection-toggle" onClick={(event) => event.stopPropagation()}>
                              <input
                                checked={engine.enabled}
                                onChange={(event) =>
                                  updateEngine(engine.id, {
                                    enabled: event.target.checked,
                                    setupStatus:
                                      event.target.checked && !engine.installed ? "needs_setup" : engine.setupStatus
                                  })
                                }
                                type="checkbox"
                              />
                              <span>{engine.enabled ? "启用" : "停用"}</span>
                            </label>
                          </summary>
                          <div className="disclosure-body">
                            <div className="engine-status-row">
                              <span className={engine.installed ? "status ready" : "status muted-status"}>
                                {engine.installed ? "已检测" : "未检测"}
                              </span>
                              <span className="runtime-pill">
                                {engine.configSource === "local_cli" ? "读取本机 CLI 配置" : "使用 NexaDesk 模型中心"}
                              </span>
                              {detection?.version ? <span className="runtime-pill">{detection.version}</span> : null}
                            </div>
                            {detection ? (
                              <div className="engine-detection-card">
                                <strong>{detection.message}</strong>
                                {detection.resolvedPath ? <span>命令路径：{detection.resolvedPath}</span> : null}
                                {detection.configPath ? <span>配置路径：{detection.configPath}</span> : null}
                                <small>检测时间：{formatTime(detection.checkedAt)}</small>
                              </div>
                            ) : null}
                            <div className="field-grid">
                              <label className="field-label">
                                <span>配置来源</span>
                                <select
                                  value={engine.configSource}
                                  onChange={(event) =>
                                    updateEngine(engine.id, {
                                      configSource: event.target.value as AgentEngineSettings["configSource"]
                                    })
                                  }
                                >
                                  <option value="nexadesk_model">NexaDesk 模型中心</option>
                                  <option value="local_cli">本机 CLI 配置</option>
                                </select>
                              </label>
                              <label className="field-label">
                                <span>权限模式</span>
                                <select
                                  value={engine.permissionMode}
                                  onChange={(event) =>
                                    updateEngine(engine.id, {
                                      permissionMode: event.target.value as AgentEngineSettings["permissionMode"]
                                    })
                                  }
                                >
                                  <option value="ask">进入审批队列</option>
                                  <option value="conservative">保守模式</option>
                                  <option value="auto">自动模式</option>
                                  <option value="bypass">外部引擎自行处理</option>
                                </select>
                              </label>
                            </div>
                            <div className="field-grid">
                              <label className="field-label">
                                <span>CLI 命令</span>
                                <input
                                  disabled={engine.kind === "builtin"}
                                  value={engine.command ?? ""}
                                  onChange={(event) => updateEngine(engine.id, { command: event.target.value })}
                                  placeholder="例如 codex、claude、qwen"
                                />
                              </label>
                              <label className="field-label">
                                <span>配置文件路径</span>
                                <input
                                  value={engine.configPath ?? ""}
                                  onChange={(event) => updateEngine(engine.id, { configPath: event.target.value })}
                                  placeholder="后续可自动检测本机 CLI 配置"
                                />
                              </label>
                            </div>
                            <div className="field-grid">
                              <label className="field-label">
                                <span>绑定 Provider</span>
                                <select
                                  value={engine.providerId ?? ""}
                                  onChange={(event) =>
                                    updateEngine(engine.id, { providerId: event.target.value || undefined })
                                  }
                                >
                                  <option value="">跟随默认模型</option>
                                  {draft.providers.map((provider) => (
                                    <option key={provider.id} value={provider.id}>
                                      {provider.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="field-label">
                                <span>绑定模型</span>
                                <input
                                  value={engine.model ?? ""}
                                  onChange={(event) => updateEngine(engine.id, { model: event.target.value })}
                                  placeholder="为空则跟随 Provider 默认模型"
                                />
                              </label>
                            </div>
                            <div className="engine-capability-row">
                              {engine.capabilities.map((capability) => (
                                <span key={capability}>{capability}</span>
                              ))}
                            </div>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </div>
              </section>
            ) : null}

            {activeTab === "assistants" ? (
              <section className="panel-block settings-section assistant-settings">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">助手系统</p>
                    <h3>内置助手</h3>
                  </div>
                  <Bot size={18} />
                </div>
                <div className="settings-form">
                  <div className="collapse-list">
                    {draft.assistant.agents.map((agent) => (
                      <details
                        className={agent.enabled ? "config-disclosure enabled" : "config-disclosure"}
                        key={agent.id}
                      >
                        <summary>
                          <span className="summary-main">
                            <strong>{agent.name}</strong>
                            <small>
                              {agent.category} · {agent.description}
                            </small>
                          </span>
                          <label className="connection-toggle" onClick={(event) => event.stopPropagation()}>
                            <input
                              checked={agent.enabled}
                              onChange={(event) => updateAgent(agent.id, { enabled: event.target.checked })}
                              type="checkbox"
                            />
                            <span>{agent.enabled ? "启用" : "停用"}</span>
                          </label>
                        </summary>
                        <div className="disclosure-body">
                          <label className="field-label">
                            <span>绑定 Agent 引擎</span>
                            <select
                              value={agent.engineId ?? "nexadesk_builtin"}
                              onChange={(event) =>
                                updateAgent(agent.id, { engineId: event.target.value as AgentProfile["engineId"] })
                              }
                            >
                              {draft.assistant.engines.map((engine) => (
                                <option key={engine.id} value={engine.id}>
                                  {engine.enabled ? "启用" : "停用"} - {engine.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field-label">
                            <span>绑定 Provider</span>
                            <select
                              value={agent.providerId}
                              onChange={(event) => updateAgent(agent.id, { providerId: event.target.value })}
                            >
                              {draft.providers.map((provider) => (
                                <option key={provider.id} value={provider.id}>
                                  {provider.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field-label">
                            <span>系统提示词</span>
                            <textarea
                              rows={4}
                              value={agent.instructions}
                              onChange={(event) => updateAgent(agent.id, { instructions: event.target.value })}
                            />
                          </label>
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            {activeTab === "skills" ? (
              <section className="panel-block settings-section skill-settings">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">技能系统</p>
                    <h3>启用、禁用与自定义技能</h3>
                  </div>
                  <button className="mini-button" onClick={addCustomSkill} type="button">
                    新建技能
                  </button>
                </div>
                <div className="settings-form">
                  <div className="collapse-list">
                    {draft.assistant.skills.map((skill) => (
                      <details
                        className={skill.enabled ? "config-disclosure enabled" : "config-disclosure"}
                        key={skill.id}
                      >
                        <summary>
                          <span className="summary-main">
                            <strong>{skill.name}</strong>
                            <small>
                              {skill.source === "custom" ? "自定义" : "内置"} · {skill.description}
                            </small>
                          </span>
                          <label className="connection-toggle" onClick={(event) => event.stopPropagation()}>
                            <input
                              checked={skill.enabled}
                              onChange={(event) => updateSkill(skill.id, { enabled: event.target.checked })}
                              type="checkbox"
                            />
                            <span>{skill.enabled ? "启用" : "停用"}</span>
                          </label>
                        </summary>
                        <div className="disclosure-body">
                          <label className="field-label">
                            <span>技能名称</span>
                            <input
                              disabled={skill.source !== "custom"}
                              value={skill.name}
                              onChange={(event) => updateSkill(skill.id, { name: event.target.value })}
                            />
                          </label>
                          <label className="field-label">
                            <span>适用场景</span>
                            <input
                              value={skill.description}
                              onChange={(event) => updateSkill(skill.id, { description: event.target.value })}
                            />
                          </label>
                          <label className="field-label">
                            <span>技能提示词</span>
                            <textarea
                              rows={4}
                              value={skill.instructions}
                              onChange={(event) => updateSkill(skill.id, { instructions: event.target.value })}
                            />
                          </label>
                        </div>
                      </details>
                    ))}
                  </div>
                  <p className="secret-note">
                    助手只会加载自己绑定且已启用的技能。自定义技能会随设置保存，后续可以扩展成本地技能包或插件。
                  </p>
                </div>
              </section>
            ) : null}

            {activeTab === "appearance" ? (
              <section className="panel-block settings-section">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">界面</p>
                    <h3>外观与主题</h3>
                  </div>
                  <Settings size={18} />
                </div>
                <div className="settings-form">
                  <div className="field-grid">
                    <label className="field-label">
                      <span>语言</span>
                      <select value={lang} onChange={(event) => setLang(event.target.value as Lang)}>
                        <option value="zh">简体中文</option>
                        <option value="en">English</option>
                      </select>
                    </label>
                    <label className="field-label">
                      <span>界面密度</span>
                      <select
                        value={draft.appearance.density}
                        onChange={(event) =>
                          updateDraft({
                            appearance: {
                              ...draft.appearance,
                              density: event.target.value as AppSettings["appearance"]["density"]
                            }
                          })
                        }
                      >
                        <option value="comfortable">舒适</option>
                        <option value="compact">紧凑</option>
                      </select>
                    </label>
                  </div>

                  <h4
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--muted-text)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      margin: "12px 0 6px"
                    }}
                  >
                    主题模式
                  </h4>
                  <div className="theme-mode-row">
                    {(["light", "dark", "system"] as const).map((m) => (
                      <button
                        className={themeMode === m ? "theme-mode-btn active" : "theme-mode-btn"}
                        key={m}
                        onClick={() => setThemeMode(m)}
                        type="button"
                      >
                        {m === "light" ? "☀️ 浅色" : m === "dark" ? "🌙 深色" : "💻 跟随系统"}
                      </button>
                    ))}
                  </div>

                  <h4
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--muted-text)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      margin: "12px 0 6px"
                    }}
                  >
                    主题配色
                  </h4>
                  <div className="theme-gallery">
                    {THEMES.filter(
                      (t) => themeMode === "system" || t.appearance === themeMode || themeMode === themeMode
                    ).map((theme) => (
                      <button
                        className={themeId === theme.id ? "theme-swatch active" : "theme-swatch"}
                        key={theme.id}
                        onClick={() => setThemeId(theme.id)}
                        type="button"
                        title={theme.description}
                      >
                        <div className="theme-preview-strip">
                          {theme.preview.map((color, i) => (
                            <span key={i} style={{ background: color }} />
                          ))}
                        </div>
                        <small>{theme.name}</small>
                      </button>
                    ))}
                  </div>

                  <div className="field-grid" style={{ marginTop: 12 }}>
                    <label className="field-label">
                      <span>字体预设</span>
                      <select
                        value={
                          fontOptions.includes(draft.appearance.fontFamily) ? draft.appearance.fontFamily : "Custom"
                        }
                        onChange={(event) => {
                          if (event.target.value !== "Custom") {
                            updateDraft({ appearance: { ...draft.appearance, fontFamily: event.target.value } });
                          }
                        }}
                      >
                        {fontOptions.map((font) => (
                          <option key={font} value={font}>
                            {font === "Custom" ? "Custom" : font}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label">
                      <span>字号</span>
                      <input
                        min={12}
                        max={20}
                        type="number"
                        value={draft.appearance.fontSize}
                        onChange={(event) =>
                          updateDraft({ appearance: { ...draft.appearance, fontSize: Number(event.target.value) } })
                        }
                      />
                    </label>
                  </div>
                </div>
              </section>
            ) : null}

            {activeTab === "workspace" ? (
              <section className="panel-block settings-section">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">工作区</p>
                    <h3>文件与导出</h3>
                  </div>
                  <Folder size={18} />
                </div>
                <div className="settings-form">
                  <label className="field-label">
                    <span>默认工作区</span>
                    <div className="directory-field">
                      <input
                        value={draft.workspace.defaultWorkspace}
                        onChange={(event) =>
                          updateDraft({ workspace: { ...draft.workspace, defaultWorkspace: event.target.value } })
                        }
                      />
                      <button
                        className="mini-button"
                        disabled={!canPickDirectory}
                        onClick={() =>
                          void chooseDirectory({
                            title: "选择默认工作区",
                            defaultPath: draft.workspace.defaultWorkspace,
                            onSelect: (path) =>
                              updateDraft({
                                workspace: {
                                  ...draft.workspace,
                                  defaultWorkspace: path,
                                  allowedRoots: uniquePathList([...draft.workspace.allowedRoots, path])
                                }
                              })
                          })
                        }
                        type="button"
                      >
                        选择目录
                      </button>
                    </div>
                  </label>
                  <label className="field-label">
                    <span>导出目录</span>
                    <div className="directory-field">
                      <input
                        value={draft.workspace.exportDirectory}
                        onChange={(event) =>
                          updateDraft({ workspace: { ...draft.workspace, exportDirectory: event.target.value } })
                        }
                      />
                      <button
                        className="mini-button"
                        disabled={!canPickDirectory}
                        onClick={() =>
                          void chooseDirectory({
                            title: "选择导出目录",
                            defaultPath: draft.workspace.exportDirectory || draft.workspace.defaultWorkspace,
                            onSelect: (path) =>
                              updateDraft({
                                workspace: {
                                  ...draft.workspace,
                                  exportDirectory: path,
                                  allowedRoots: uniquePathList([...draft.workspace.allowedRoots, path])
                                }
                              })
                          })
                        }
                        type="button"
                      >
                        选择目录
                      </button>
                    </div>
                  </label>
                  <label className="field-label">
                    <span>允许访问的根目录</span>
                    <textarea
                      rows={3}
                      value={draft.workspace.allowedRoots.join("\n")}
                      onChange={(event) =>
                        updateDraft({
                          workspace: {
                            ...draft.workspace,
                            allowedRoots: event.target.value
                              .split("\n")
                              .map((item) => item.trim())
                              .filter(Boolean)
                          }
                        })
                      }
                    />
                  </label>
                  <div className="config-actions">
                    <button
                      className="secondary-button"
                      disabled={!canPickDirectory}
                      onClick={() =>
                        void chooseDirectory({
                          title: "添加允许访问的根目录",
                          defaultPath: draft.workspace.defaultWorkspace,
                          onSelect: (path) =>
                            updateDraft({
                              workspace: {
                                ...draft.workspace,
                                allowedRoots: uniquePathList([...draft.workspace.allowedRoots, path])
                              }
                            })
                        })
                      }
                      type="button"
                    >
                      添加允许目录
                    </button>
                    <span className="secret-note">
                      目录选择仅在桌面应用中启用。Agent 的读写工具会被限制在允许访问的根目录内。
                    </span>
                  </div>
                </div>
              </section>
            ) : null}

            {activeTab === "permissions" ? (
              <section className="panel-block settings-section">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">权限</p>
                    <h3>安全策略</h3>
                  </div>
                  <ShieldCheck size={18} />
                </div>
                <div className="settings-form">
                  {(["shell", "fileWrite", "network", "browser", "mcp", "automation"] as const).map((key) => (
                    <label className="field-label policy-row" key={key}>
                      <span>{policyLabel(key)}</span>
                      <select
                        value={draft.permissions[key]}
                        onChange={(event) =>
                          updateDraft({
                            permissions: {
                              ...draft.permissions,
                              [key]: event.target.value as AppSettings["permissions"][typeof key]
                            }
                          })
                        }
                      >
                        <option value="ask">每次询问</option>
                        <option value="allow">允许</option>
                        <option value="deny">拒绝</option>
                      </select>
                    </label>
                  ))}
                  <label className="connection-toggle">
                    <input
                      checked={draft.permissions.autoApproveLowRisk}
                      onChange={(event) =>
                        updateDraft({
                          permissions: { ...draft.permissions, autoApproveLowRisk: event.target.checked }
                        })
                      }
                      type="checkbox"
                    />
                    <span>自动批准低风险操作</span>
                  </label>
                </div>
              </section>
            ) : null}

            {activeTab === "memory" ? (
              <section className="panel-block settings-section">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">Memory</p>
                    <h3>记忆管理</h3>
                  </div>
                  <FileText size={18} />
                </div>
                <div className="settings-form">
                  {(["projectMemory", "conversationMemory", "longTermMemory"] as const).map((key) => (
                    <label className="connection-toggle" key={key}>
                      <input
                        checked={draft.memory[key]}
                        onChange={(event) =>
                          updateDraft({
                            memory: { ...draft.memory, [key]: event.target.checked }
                          })
                        }
                        type="checkbox"
                      />
                      <span>{memorySettingLabel(key)}</span>
                    </label>
                  ))}
                  <label className="field-label">
                    <span>记忆保留天数</span>
                    <input
                      min={1}
                      max={365}
                      type="number"
                      value={draft.memory.retentionDays}
                      onChange={(event) =>
                        updateDraft({
                          memory: { ...draft.memory, retentionDays: Number(event.target.value) }
                        })
                      }
                    />
                  </label>
                  <label className="field-label">
                    <span>记忆规则备注</span>
                    <textarea
                      rows={4}
                      value={draft.memory.notes}
                      onChange={(event) =>
                        updateDraft({
                          memory: { ...draft.memory, notes: event.target.value }
                        })
                      }
                    />
                  </label>
                  <p className="secret-note">
                    这里先保存记忆策略配置；后续可接项目记忆索引、会话摘要和长期记忆审查页。
                  </p>
                </div>
              </section>
            ) : null}

            {activeTab === "im" ? <IMSettingsPanel channels={imChannels} onClose={() => {}} /> : null}

            {activeTab === "email" ? <EmailConfigPanel onClose={() => {}} /> : null}

            {activeTab === "shortcuts" ? (
              <section className="panel-block settings-section">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">Keyboard</p>
                    <h3>快捷键</h3>
                  </div>
                  <KeyRound size={18} />
                </div>
                <div className="settings-form">
                  {(
                    ["sendMessage", "commandPalette", "newTask", "openSettings", "toggleWorkspaceContext"] as const
                  ).map((key) => (
                    <label className="field-label shortcut-row" key={key}>
                      <span>{shortcutSettingLabel(key)}</span>
                      <input
                        value={draft.shortcuts[key]}
                        onChange={(event) =>
                          updateDraft({
                            shortcuts: { ...draft.shortcuts, [key]: event.target.value }
                          })
                        }
                      />
                    </label>
                  ))}
                  <p className="secret-note">
                    快捷键配置已进入设置体系；真正的全局快捷键注册会在桌面快捷键模块里继续接入。
                  </p>
                </div>
              </section>
            ) : null}

            {activeTab === "about" ? (
              <section className="panel-block settings-section">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">About</p>
                    <h3>关于 NexaDesk</h3>
                  </div>
                  <Workflow size={18} />
                </div>
                <div className="settings-form">
                  <div className="diagnostics-grid">
                    <DiagnosticRow label="版本" value={desktopStatus?.version ?? "0.1.0"} />
                    <DiagnosticRow label="发布通道" value={draft.about.releaseChannel} />
                    <DiagnosticRow label="许可证" value={draft.about.license} />
                    <DiagnosticRow label="仓库" value={draft.about.repositoryUrl} />
                    <DiagnosticRow
                      label="运行模式"
                      value={desktopStatus?.mode === "desktop" ? "桌面应用" : "Web 开发"}
                    />
                    <DiagnosticRow label="数据目录" value={desktopStatus?.dataDir ?? "Not set"} />
                  </div>
                  <div className="field-grid">
                    <label className="field-label">
                      <span>发布通道</span>
                      <select
                        value={draft.about.releaseChannel}
                        onChange={(event) =>
                          updateDraft({
                            about: {
                              ...draft.about,
                              releaseChannel: event.target.value as AppSettings["about"]["releaseChannel"]
                            }
                          })
                        }
                      >
                        <option value="stable">Stable</option>
                        <option value="beta">Beta</option>
                        <option value="dev">Dev</option>
                      </select>
                    </label>
                    <label className="connection-toggle">
                      <input
                        checked={draft.about.checkUpdates}
                        onChange={(event) =>
                          updateDraft({
                            about: { ...draft.about, checkUpdates: event.target.checked }
                          })
                        }
                        type="checkbox"
                      />
                      <span>允许检查更新</span>
                    </label>
                  </div>
                  <label className="field-label">
                    <span>仓库地址</span>
                    <input
                      value={draft.about.repositoryUrl}
                      onChange={(event) =>
                        updateDraft({
                          about: { ...draft.about, repositoryUrl: event.target.value }
                        })
                      }
                    />
                  </label>
                  <label className="field-label">
                    <span>许可证说明</span>
                    <input
                      value={draft.about.license}
                      onChange={(event) =>
                        updateDraft({
                          about: { ...draft.about, license: event.target.value }
                        })
                      }
                    />
                  </label>
                </div>
              </section>
            ) : null}

            {activeTab === "desktop" ? (
              <section className="panel-block settings-section">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">桌面应用</p>
                    <h3>安装包与诊断</h3>
                  </div>
                  <Workflow size={18} />
                </div>
                <div className="settings-form">
                  {(["launchAtStartup", "autoUpdate", "telemetry"] as const).map((key) => (
                    <label className="connection-toggle" key={key}>
                      <input
                        checked={draft.app[key]}
                        onChange={(event) => updateDraft({ app: { ...draft.app, [key]: event.target.checked } })}
                        type="checkbox"
                      />
                      <span>{appSettingLabel(key)}</span>
                    </label>
                  ))}
                  <label className="field-label">
                    <span>日志级别</span>
                    <select
                      value={draft.app.logLevel}
                      onChange={(event) =>
                        updateDraft({
                          app: { ...draft.app, logLevel: event.target.value as AppSettings["app"]["logLevel"] }
                        })
                      }
                    >
                      <option value="debug">Debug</option>
                      <option value="info">Info</option>
                      <option value="warn">Warn</option>
                      <option value="error">Error</option>
                    </select>
                  </label>
                  <details className="diagnostics-box">
                    <summary>
                      <span>桌面诊断</span>
                      <span className="diagnostics-actions">
                        <button
                          className="mini-button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void refreshDesktopStatus();
                          }}
                          type="button"
                        >
                          刷新
                        </button>
                        <button
                          className="mini-button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void copyDesktopDiagnostics();
                          }}
                          type="button"
                        >
                          复制诊断
                        </button>
                      </span>
                    </summary>
                    {desktopStatus ? (
                      <div className="diagnostics-grid">
                        <DiagnosticRow
                          label="运行模式"
                          value={desktopStatus.mode === "desktop" ? "桌面应用" : "Web 开发"}
                        />
                        <DiagnosticRow label="Version" value={desktopStatus.version} />
                        <DiagnosticRow label="API" value={desktopStatus.apiBase} />
                        <DiagnosticRow label="Data directory" value={desktopStatus.dataDir ?? "Not set"} />
                        <DiagnosticRow label="Settings file" value={desktopStatus.settingsPath ?? "Not set"} />
                        <DiagnosticRow label="Secrets file" value={desktopStatus.secretsPath ?? "Not set"} />
                        <DiagnosticRow label="Runtime state" value={desktopStatus.runtimeStatePath ?? "Not set"} />
                        <DiagnosticRow
                          label="Secret protection"
                          value={desktopStatus.secretsEncrypted ? "Encrypted" : "Not encrypted"}
                        />
                        <DiagnosticRow label="System secure storage" value={desktopStatus.safeStorage} />
                        <DiagnosticRow label="Log file" value={desktopStatus.logPath ?? "Not set"} />
                        <DiagnosticRow label="Crash log" value={desktopStatus.crashLogPath ?? "Not set"} />
                        <DiagnosticRow label="Platform" value={`${desktopStatus.platform} / ${desktopStatus.arch}`} />
                        <DiagnosticRow label="Uptime" value={`${desktopStatus.uptimeSeconds}s`} />
                        {copyStatus ? <p className="secret-note">{copyStatus}</p> : null}
                      </div>
                    ) : (
                      <p className="secret-note">桌面诊断暂不可用。请确认本地 API 已启动。</p>
                    )}
                  </details>
                </div>
              </section>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}