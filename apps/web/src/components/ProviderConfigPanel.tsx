function ProviderConfigPanel({
  settings,
  providers,
  onSaveSettings,
  onSaveProvider
}: {
  settings: AppSettings;
  providers: ProviderSettings[];
  onSaveSettings?: (
    settings: AppSettings,
    providerSecrets?: ProviderSecretUpdate[]
  ) => Promise<AppSettings> | AppSettings;
  onSaveProvider?: (provider: ProviderSettings, providerSecrets?: ProviderSecretUpdate[]) => Promise<unknown> | unknown;
}) {
  const [selectedProviderId, setSelectedProviderId] = useState(providers[0]?.id ?? "");
  const [drafts, setDrafts] = useState<Record<string, ProviderDraft>>({});
  const [savedProviderId, setSavedProviderId] = useState<string | null>(null);
  const [testProviderId, setTestProviderId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, ProviderTestResult>>({});
  const [refreshProviderId, setRefreshProviderId] = useState<string | null>(null);
  const [modelRefreshResults, setModelRefreshResults] = useState<Record<string, ProviderModelsResult>>({});
  const [savingProviderId, setSavingProviderId] = useState<string | null>(null);
  const [providerNotice, setProviderNotice] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDrafts((current) => {
      const next = { ...current };
      for (const provider of providers) {
        if (!next[provider.id]) {
          next[provider.id] = createProviderDraft(provider);
        }
      }
      return next;
    });
  }, [providers]);

  useEffect(() => {
    if (!providers.some((provider) => provider.id === selectedProviderId)) {
      setSelectedProviderId(providers[0]?.id ?? "");
    }
  }, [providers, selectedProviderId]);

  useEffect(() => {
    setTestResults(settings.providerStatus.tests);
    setModelRefreshResults(settings.providerStatus.modelRefreshes);
  }, [settings.providerStatus]);

  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId);
  const selectedDraft =
    drafts[selectedProviderId] ??
    (selectedProvider
      ? createProviderDraft(selectedProvider)
      : providers[0]
        ? createProviderDraft(providers[0])
        : null);
  const models = selectedDraft ? parseModels(selectedDraft.modelsText) : [];
  const canDeleteSelectedProvider = selectedDraft ? !defaultProviderIds.has(selectedDraft.id) : false;
  const selectedTestResult = selectedDraft ? testResults[selectedDraft.id] : undefined;
  const selectedRefreshResult = selectedDraft ? modelRefreshResults[selectedDraft.id] : undefined;
  const matrixRows = domesticProviderMatrix.map((item) => {
    const provider = providers.find((candidate) => candidate.id === item.id);
    const draft = drafts[item.id] ?? (provider ? createProviderDraft(provider) : null);
    return {
      item,
      provider,
      draft,
      result: testResults[item.id],
      summary: inspectProviderMatrixItem(item, draft)
    };
  });
  const alignedMatrixCount = matrixRows.filter((row) => row.summary.status === "ok").length;
  const testedMatrixCount = matrixRows.filter((row) => Boolean(row.result)).length;
  const enabledProviderCount = providers.filter((provider) => provider.connected).length;
  const savedKeyCount = providers.filter((provider) => provider.apiKeyConfigured).length;
  const totalModelCount = providers.reduce((count, provider) => count + provider.models.length, 0);
  const matrixIssueCount = matrixRows.filter((row) => row.summary.status !== "ok").length;

  function updateSelected(patch: Partial<ProviderDraft>) {
    if (!selectedDraft) {
      return;
    }
    setDrafts((current) => ({
      ...current,
      [selectedDraft.id]: {
        ...selectedDraft,
        ...patch
      }
    }));
    setSavedProviderId(null);
    setTestProviderId(null);
    setProviderNotice(null);
  }

  function updateCapability(capability: ProviderCapability, enabled: boolean) {
    if (!selectedDraft) {
      return;
    }
    updateSelected({
      capabilities: {
        ...selectedDraft.capabilities,
        [capability]: enabled
      }
    });
  }

  async function handleSaveProvider() {
    if (!selectedDraft) {
      return;
    }

    setSavingProviderId(selectedDraft.id);
    try {
      const secretUpdates: ProviderSecretUpdate[] = selectedDraft.apiKey.trim()
        ? [{ providerId: selectedDraft.id, apiKey: selectedDraft.apiKey.trim() }]
        : [];
      const provider = providerDraftToSettings(selectedDraft);
      await onSaveProvider?.(provider, secretUpdates);
      setDrafts((current) => ({
        ...current,
        [selectedDraft.id]: {
          ...selectedDraft,
          apiKey: "",
          apiKeyConfigured: provider.apiKeyConfigured || secretUpdates.length > 0
        }
      }));
      setSavedProviderId(selectedDraft.id);
      setProviderNotice("Provider 已保存。");
    } finally {
      setSavingProviderId(null);
    }
  }

  async function handleAddCustomProvider() {
    const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
    const provider: ProviderSettings = {
      id,
      name: "自定义模型服务",
      kind: "openai_compatible",
      apiMode: "chat_completions",
      connected: false,
      baseUrl: "https://your-api.example.com/v1",
      models: ["model-name"],
      defaultModel: "model-name",
      apiKeyConfigured: false,
      capabilities: ["streaming", "function_calling", "structured_output"]
    };
    setDrafts((current) => ({
      ...current,
      [id]: createProviderDraft(provider)
    }));
    setSelectedProviderId(id);
    await onSaveProvider?.(provider, []);
    setProviderNotice("已新增自定义 Provider。");
  }

  async function handleCopyProvider() {
    if (!selectedDraft) {
      return;
    }
    const id = `custom-copy-${crypto.randomUUID().slice(0, 8)}`;
    const provider: ProviderSettings = {
      ...providerDraftToSettings(selectedDraft),
      id,
      name: `${selectedDraft.name} Copy`,
      connected: false,
      apiKeyConfigured: false
    };
    setDrafts((current) => ({
      ...current,
      [id]: createProviderDraft(provider)
    }));
    setSelectedProviderId(id);
    await onSaveProvider?.(provider, []);
    setProviderNotice("已复制为新的自定义 Provider，API Key 不会被复制。");
  }

  async function handleClearApiKey() {
    if (!selectedDraft) {
      return;
    }
    setSavingProviderId(selectedDraft.id);
    try {
      const provider = {
        ...providerDraftToSettings(selectedDraft),
        apiKeyConfigured: false
      };
      await onSaveProvider?.(provider, [{ providerId: selectedDraft.id, clearApiKey: true }]);
      setDrafts((current) => ({
        ...current,
        [selectedDraft.id]: {
          ...selectedDraft,
          apiKey: "",
          apiKeyConfigured: false
        }
      }));
      setSavedProviderId(selectedDraft.id);
      setProviderNotice("API Key 已清除。");
    } finally {
      setSavingProviderId(null);
    }
  }

  async function handleDeleteProvider() {
    if (!selectedDraft || !onSaveSettings) {
      return;
    }
    if (!canDeleteSelectedProvider) {
      setProviderNotice("内置 Provider 不能删除，可以停用或复制后自定义。");
      return;
    }
    const confirmed = window.confirm(`删除 Provider「${selectedDraft.name}」？这会同时清除它保存的 API Key。`);
    if (!confirmed) {
      return;
    }

    const remainingProviders = settings.providers.filter((provider) => provider.id !== selectedDraft.id);
    const fallbackProvider = remainingProviders.find((provider) => provider.connected) ?? remainingProviders[0];
    const nextSettings: AppSettings = {
      ...settings,
      providers: remainingProviders,
      providerStatus: pruneProviderStatus(
        settings.providerStatus,
        remainingProviders.map((provider) => provider.id)
      ),
      model:
        settings.model.activeProviderId === selectedDraft.id
          ? {
              activeProviderId: fallbackProvider?.id ?? "",
              activeModel: fallbackProvider?.defaultModel || fallbackProvider?.models[0] || ""
            }
          : settings.model,
      assistant: {
        ...settings.assistant,
        agents: settings.assistant.agents.map((agent) =>
          agent.providerId === selectedDraft.id ? { ...agent, providerId: fallbackProvider?.id ?? "" } : agent
        )
      }
    };

    setSavingProviderId(selectedDraft.id);
    try {
      await onSaveSettings(nextSettings, [{ providerId: selectedDraft.id, clearApiKey: true }]);
      setDrafts((current) => {
        const next = { ...current };
        delete next[selectedDraft.id];
        return next;
      });
      setSelectedProviderId(fallbackProvider?.id ?? remainingProviders[0]?.id ?? "");
      setProviderNotice("Provider 已删除，关联 API Key 已清除。");
    } finally {
      setSavingProviderId(null);
    }
  }

  function handleExportSettings() {
    const exported: AppSettings = {
      ...settings,
      providers: settings.providers.map((provider) => ({
        ...provider,
        apiKeyConfigured: false
      })),
      updatedAt: new Date().toISOString()
    };
    const blob = new Blob([`${JSON.stringify(exported, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nexadesk-settings-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setProviderNotice("已导出配置。导出文件不包含 API Key。");
  }

  async function handleImportSettings(file: File | undefined) {
    if (!file || !onSaveSettings) {
      return;
    }
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const imported = sanitizeImportedSettings(parsed, settings);
      const confirmed = window.confirm("导入配置会覆盖当前设置，但不会导入 API Key。继续吗？");
      if (!confirmed) {
        return;
      }
      const saved = await onSaveSettings(imported, []);
      setDrafts(
        saved.providers.reduce<Record<string, ProviderDraft>>((record, provider) => {
          record[provider.id] = createProviderDraft(provider);
          return record;
        }, {})
      );
      setSelectedProviderId(saved.model.activeProviderId || saved.providers[0]?.id || "");
      setProviderNotice("配置已导入。请重新填写需要的 API Key。");
    } catch (reason) {
      setProviderNotice(reason instanceof Error ? `导入失败：${reason.message}` : "导入失败。");
    } finally {
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  }

  async function handleTestProvider() {
    if (!selectedDraft) {
      return;
    }
    setTestProviderId(selectedDraft.id);
    try {
      const result = await testProvider({
        provider: providerDraftToSettings(selectedDraft),
        apiKey: selectedDraft.apiKey.trim() || undefined,
        timeoutMs: 8000
      });
      setTestResults((current) => ({ ...current, [selectedDraft.id]: result }));
      void persistProviderStatus(
        buildProviderStatus(settings.providerStatus, testResults, modelRefreshResults, {
          test: [selectedDraft.id, resultToProviderStatusRecord(result)]
        })
      );
    } catch (reason) {
      const failedResult: ProviderTestResult = {
        ok: false,
        checkedAt: new Date().toISOString(),
        message: reason instanceof Error ? reason.message : "测试失败"
      };
      setTestResults((current) => ({
        ...current,
        [selectedDraft.id]: failedResult
      }));
      void persistProviderStatus(
        buildProviderStatus(settings.providerStatus, testResults, modelRefreshResults, {
          test: [selectedDraft.id, resultToProviderStatusRecord(failedResult)]
        })
      );
    } finally {
      setTestProviderId(null);
    }
  }

  async function handleRefreshModels() {
    if (!selectedDraft) {
      return;
    }
    setRefreshProviderId(selectedDraft.id);
    try {
      const result = await fetchProviderModels({
        provider: providerDraftToSettings(selectedDraft),
        apiKey: selectedDraft.apiKey.trim() || undefined,
        timeoutMs: 10000
      });
      setModelRefreshResults((current) => ({ ...current, [selectedDraft.id]: result }));
      void persistProviderStatus(
        buildProviderStatus(settings.providerStatus, testResults, modelRefreshResults, {
          modelRefresh: [selectedDraft.id, resultToProviderModelsStatusRecord(result)]
        })
      );
      if (!result.ok) {
        setProviderNotice(`刷新模型失败：${result.message}`);
        return;
      }
      if (!result.models.length) {
        setProviderNotice("Provider 已响应，但没有返回可识别的模型名。");
        return;
      }

      setDrafts((current) => {
        const currentDraft = current[selectedDraft.id] ?? selectedDraft;
        const uniqueModels = Array.from(new Set(result.models));
        const currentDefaultModel = currentDraft.defaultModel.trim();
        const defaultModel = uniqueModels.includes(currentDefaultModel)
          ? currentDefaultModel
          : (uniqueModels[0] ?? currentDefaultModel);
        return {
          ...current,
          [selectedDraft.id]: {
            ...currentDraft,
            modelsText: uniqueModels.join("\n"),
            defaultModel
          }
        };
      });
      setSavedProviderId(null);
      setProviderNotice(`已刷新 ${result.models.length} 个模型，请确认后点击"保存"。`);
    } catch (reason) {
      const failedResult: ProviderModelsResult = {
        ok: false,
        checkedAt: new Date().toISOString(),
        models: [],
        message: reason instanceof Error ? reason.message : "刷新模型失败"
      };
      setModelRefreshResults((current) => ({
        ...current,
        [selectedDraft.id]: failedResult
      }));
      void persistProviderStatus(
        buildProviderStatus(settings.providerStatus, testResults, modelRefreshResults, {
          modelRefresh: [selectedDraft.id, resultToProviderModelsStatusRecord(failedResult)]
        })
      );
      setProviderNotice(reason instanceof Error ? `刷新模型失败：${reason.message}` : "刷新模型失败。");
    } finally {
      setRefreshProviderId(null);
    }
  }

  if (!selectedDraft) {
    return null;
  }

  async function persistProviderStatus(providerStatus: ProviderStatusSettings) {
    if (!onSaveSettings) {
      return;
    }
    try {
      await onSaveSettings({ ...settings, providerStatus }, []);
    } catch (reason) {
      setProviderNotice(reason instanceof Error ? `状态保存失败：${reason.message}` : "状态保存失败。");
    }
  }

  return (
    <section className="panel-block provider-config-panel" id="providers">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">模型中心</p>
          <h3>大模型 API 配置</h3>
        </div>
        <KeyRound size={18} />
      </div>

      <div className="provider-config">
        <div className="config-toolbar">
          <span>内置预设 + 自定义第三方接口</span>
          <div className="toolbar-actions">
            <button className="mini-button" onClick={handleAddCustomProvider} type="button">
              新增自定义
            </button>
            <button className="mini-button" onClick={handleExportSettings} type="button">
              导出配置
            </button>
            <button className="mini-button" onClick={() => importInputRef.current?.click()} type="button">
              导入配置
            </button>
            <input
              ref={importInputRef}
              accept="application/json,.json"
              hidden
              onChange={(event) => void handleImportSettings(event.target.files?.[0])}
              type="file"
            />
          </div>
        </div>

        <div className="provider-overview-grid">
          <article>
            <span>启用服务</span>
            <strong>{enabledProviderCount}</strong>
            <small>共 {providers.length} 个 Provider</small>
          </article>
          <article>
            <span>已保存 Key</span>
            <strong>{savedKeyCount}</strong>
            <small>Key 仍在安全存储中</small>
          </article>
          <article>
            <span>模型条目</span>
            <strong>{totalModelCount}</strong>
            <small>可刷新 /models 更新</small>
          </article>
          <article>
            <span>国内矩阵</span>
            <strong>
              {alignedMatrixCount}/{domesticProviderMatrix.length}
            </strong>
            <small>{matrixIssueCount ? `${matrixIssueCount} 项需检查` : "默认配置已对齐"}</small>
          </article>
        </div>

        <div className="provider-workbench">
          <aside className="provider-workbench-side">
            <section className="provider-side-section">
              <div className="provider-side-heading">
                <strong>Provider 列表</strong>
                <small>点击切换当前编辑对象</small>
              </div>
              <div className="provider-picker" aria-label="Provider list">
                {providers.map((provider) => {
                  const draft = drafts[provider.id] ?? createProviderDraft(provider);
                  return (
                    <button
                      className={
                        provider.id === selectedDraft.id ? "provider-picker-card active" : "provider-picker-card"
                      }
                      key={provider.id}
                      onClick={() => setSelectedProviderId(provider.id)}
                      type="button"
                    >
                      <span className={draft.connected ? "agent-status running" : "agent-status"} />
                      <strong>{draft.name}</strong>
                      <small>{draft.apiMode}</small>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="provider-side-section">
              <div className="provider-side-heading">
                <strong>国内 Provider 实测矩阵</strong>
                <small>
                  {alignedMatrixCount}/{domesticProviderMatrix.length} 个已对齐 · {testedMatrixCount} 个有测试记录
                </small>
              </div>
              <div className="provider-matrix-list">
                {matrixRows.map((row) => (
                  <button
                    className={row.item.id === selectedDraft.id ? "provider-matrix-row active" : "provider-matrix-row"}
                    key={row.item.id}
                    onClick={() => {
                      if (row.provider) {
                        setSelectedProviderId(row.item.id);
                        setProviderNotice(null);
                      } else {
                        setProviderNotice(`${row.item.label} 预设不存在，请先恢复默认 Provider。`);
                      }
                    }}
                    title={`官方文档：${row.item.officialUrl}`}
                    type="button"
                  >
                    <span className={`matrix-status-dot ${row.summary.status}`} />
                    <span className="matrix-main">
                      <strong>{row.item.label}</strong>
                      <small>{row.item.baseUrl}</small>
                    </span>
                    <span className="matrix-badges">
                      <span className={`matrix-badge ${row.summary.status}`}>{row.summary.label}</span>
                      <span className={`matrix-badge ${providerTestTone(row.result)}`}>
                        {providerTestLabel(row.result)}
                      </span>
                    </span>
                    <span className="matrix-meta">
                      {row.summary.issues.length
                        ? row.summary.issues.slice(0, 2).join("；")
                        : `Key env: ${row.item.envKey}`}
                    </span>
                  </button>
                ))}
              </div>
              <p className="secret-note compact">矩阵检查默认配置；真实可用性仍以测试连接和刷新模型结果为准。</p>
            </section>
          </aside>

          <div className="provider-editor">
            <div className="provider-editor-header">
              <div>
                <p className="eyebrow">当前 Provider</p>
                <h4>{selectedDraft.name}</h4>
                <small>{selectedDraft.baseUrl || "Base URL 未设置"}</small>
              </div>
              <span className={selectedDraft.connected ? "status ready" : "status muted-status"}>
                {selectedDraft.connected ? "启用" : "停用"}
              </span>
            </div>

            <details className="config-disclosure" open>
              <summary>
                <span className="summary-main">
                  <strong>连接与模型</strong>
                  <small>名称、接口类型、Base URL、默认模型和模型列表</small>
                </span>
              </summary>
              <div className="disclosure-body">
                <div className="field-grid">
                  <label className="field-label">
                    <span>供应商名称</span>
                    <input
                      value={selectedDraft.name}
                      onChange={(event) => updateSelected({ name: event.target.value })}
                      placeholder="OpenAI Official"
                    />
                  </label>

                  <label className="field-label">
                    <span>接口类型</span>
                    <select
                      value={selectedDraft.apiMode}
                      onChange={(event) => updateSelected({ apiMode: event.target.value as ProviderApiMode })}
                    >
                      {apiModeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="field-label">
                  <span>Base URL</span>
                  <input
                    value={selectedDraft.baseUrl}
                    onChange={(event) => updateSelected({ baseUrl: event.target.value })}
                    placeholder="https://api.openai.com/v1"
                  />
                </label>

                <div className="field-grid">
                  <label className="field-label">
                    <span>默认模型</span>
                    <input
                      value={selectedDraft.defaultModel}
                      onChange={(event) => updateSelected({ defaultModel: event.target.value })}
                      placeholder="gpt-5"
                    />
                  </label>
                  <label className="field-label">
                    <span>运行状态</span>
                    <select
                      value={selectedDraft.connected ? "enabled" : "disabled"}
                      onChange={(event) => updateSelected({ connected: event.target.value === "enabled" })}
                    >
                      <option value="enabled">启用</option>
                      <option value="disabled">停用</option>
                    </select>
                  </label>
                </div>

                <label className="field-label">
                  <span>模型列表（每行一个，也支持逗号分隔）</span>
                  <textarea
                    value={selectedDraft.modelsText}
                    onChange={(event) => updateSelected({ modelsText: event.target.value })}
                    placeholder={"gpt-5\nqwen-plus\ndeepseek-chat"}
                    rows={4}
                  />
                </label>
              </div>
            </details>

            <details className="config-disclosure" open>
              <summary>
                <span className="summary-main">
                  <strong>API Key 与操作</strong>
                  <small>测试连接、保存、复制、清除 Key 或删除自定义 Provider</small>
                </span>
              </summary>
              <div className="disclosure-body">
                <label className="field-label">
                  <span>API Key</span>
                  <input
                    autoComplete="off"
                    value={selectedDraft.apiKey}
                    onChange={(event) => updateSelected({ apiKey: event.target.value })}
                    placeholder={
                      selectedDraft.apiKeyConfigured ? "已配置。输入新 Key 可替换。" : "只保存到后端/桌面安全存储"
                    }
                    type="password"
                  />
                </label>

                <div className="config-actions">
                  <button
                    className="secondary-button"
                    disabled={testProviderId === selectedDraft.id}
                    onClick={handleTestProvider}
                    type="button"
                  >
                    {testProviderId === selectedDraft.id ? "测试中..." : "测试连接"}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={refreshProviderId === selectedDraft.id}
                    onClick={handleRefreshModels}
                    type="button"
                  >
                    {refreshProviderId === selectedDraft.id ? "刷新中..." : "刷新模型"}
                  </button>
                  <button className="secondary-button" onClick={handleCopyProvider} type="button">
                    复制
                  </button>
                  <button
                    className="secondary-button"
                    disabled={
                      savingProviderId === selectedDraft.id ||
                      (!selectedDraft.apiKeyConfigured && !selectedDraft.apiKey.trim())
                    }
                    onClick={handleClearApiKey}
                    type="button"
                  >
                    清除 Key
                  </button>
                  <button
                    className="secondary-button danger-button"
                    disabled={savingProviderId === selectedDraft.id || !canDeleteSelectedProvider}
                    onClick={handleDeleteProvider}
                    title={canDeleteSelectedProvider ? "删除这个自定义 Provider" : "内置 Provider 不能删除"}
                    type="button"
                  >
                    删除
                  </button>
                  <button
                    className="primary-button"
                    disabled={savingProviderId === selectedDraft.id}
                    onClick={handleSaveProvider}
                    type="button"
                  >
                    {savingProviderId === selectedDraft.id ? "保存中..." : "保存"}
                  </button>
                </div>
                <p className="secret-note">
                  {providerNotice ??
                    renderProviderNote(selectedDraft, savedProviderId, selectedTestResult, selectedRefreshResult)}
                </p>
              </div>
            </details>

            <details className="config-disclosure">
              <summary>
                <span className="summary-main">
                  <strong>能力开关</strong>
                  <small>Streaming、Tool calling、Vision、Search 和结构化输出</small>
                </span>
              </summary>
              <div className="disclosure-body">
                <div className="capability-grid">
                  {capabilityOptions.map((option) => (
                    <label className="capability-toggle" key={option.value}>
                      <input
                        checked={selectedDraft.capabilities[option.value]}
                        onChange={(event) => updateCapability(option.value, event.target.checked)}
                        type="checkbox"
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.hint}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </details>

            <details className="config-disclosure">
              <summary>
                <span className="summary-main">
                  <strong>预览与状态</strong>
                  <small>
                    {models.length} 个模型 · {selectedDraft.apiKeyConfigured ? "Key 已保存" : "Key 未保存"}
                  </small>
                </span>
              </summary>
              <div className="disclosure-body">
                <div className="provider-check-summary">
                  <ProviderCheckLine label="最近测试" result={selectedTestResult} emptyText="还没有测试连接记录" />
                  <ProviderCheckLine label="最近刷新" result={selectedRefreshResult} emptyText="还没有刷新模型记录" />
                </div>
                <div className="model-chips">
                  {models.map((model) => (
                    <span className="model-chip" key={model}>
                      {model}
                    </span>
                  ))}
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}

function createProviderDraft(provider: ModelProvider | ProviderSettings): ProviderDraft {
  const providerSettings = provider as Partial<ProviderSettings>;
  return {
    id: provider.id,
    name: provider.name,
    kind: provider.kind,
    connected: provider.connected,
    baseUrl: provider.baseUrl ?? "",
    apiMode: provider.apiMode,
    apiKey: "",
    modelsText: provider.models.join("\n"),
    defaultModel: providerSettings.defaultModel ?? provider.models[0] ?? "",
    apiKeyConfigured: providerSettings.apiKeyConfigured ?? false,
    capabilities: createCapabilityRecord(provider.capabilities)
  };
}

function ProviderCheckLine({
  label,
  result,
  emptyText
}: {
  label: string;
  result: ProviderTestResult | ProviderModelsResult | undefined;
  emptyText: string;
}) {
  if (!result) {
    return (
      <div className="provider-check-line">
        <span>{label}</span>
        <strong>未记录</strong>
        <small>{emptyText}</small>
      </div>
    );
  }

  const modelCount = "models" in result ? result.models.length : undefined;
  return (
    <div className={result.ok ? "provider-check-line ok" : "provider-check-line fail"}>
      <span>{label}</span>
      <strong>{result.ok ? "通过" : "失败"}</strong>
      <small>
        {formatProviderCheckTime(result.checkedAt)}
        {typeof result.status === "number" ? ` · HTTP ${result.status}` : ""}
        {typeof modelCount === "number" ? ` · ${modelCount} 个模型` : ""}
        {result.checkedUrl ? ` · ${result.checkedUrl}` : ""}
      </small>
    </div>
  );
}

function providerDraftToSettings(draft: ProviderDraft): ProviderSettings {
  const models = parseModels(draft.modelsText);
  return {
    id: draft.id,
    name: draft.name.trim() || draft.id,
    kind: draft.kind,
    connected: draft.connected,
    baseUrl: draft.baseUrl.trim() || undefined,
    apiMode: draft.apiMode,
    models,
    defaultModel: draft.defaultModel.trim() || (models[0] ?? ""),
    apiKeyConfigured: draft.apiKeyConfigured || Boolean(draft.apiKey.trim()),
    capabilities: capabilityOptions.filter((option) => draft.capabilities[option.value]).map((option) => option.value)
  };
}

function buildProviderStatus(test?: ProviderTestResult, models?: ProviderModelsResult): ProviderStatusRecord {
  return {
    ok: test?.ok ?? false,
    status: test?.status,
    message: test?.message ?? "未检查",
    checkedUrl: test?.checkedAt,
    checkedAt: test?.checkedAt ?? new Date().toISOString()
  };
}

function resultToProviderModelsStatusRecord(result: ProviderModelsResult): ProviderModelsStatusRecord {
  return {
    ok: result.ok,
    status: result.status,
    message: result.message,
    checkedUrl: result.checkedAt,
    checkedAt: result.checkedAt ?? new Date().toISOString(),
    models: result.models
  };
}

function providerTestTone(result?: ProviderStatusRecord): string {
  if (!result) return "未检查";
  return result.ok ? "通过" : "失败";
}

function providerTestLabel(result?: ProviderStatusRecord): string {
  if (!result) return "未检查";
  return result.ok
    ? `通过 ${result.checkedAt ? formatProviderCheckTime(result.checkedAt) : ""}`
    : `失败: ${result.message}`;
}

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}

function formatDuration(ms?: number): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN");
  } catch {
    return iso;
  }
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${Math.floor(diff / 86400000)}天前`;
}

function runtimeStatusLabel(status: string): string {
  return status === "completed" ? "完成" : status === "failed" ? "失败" : status === "running" ? "运行中" : status;
}

function formatRuntimeEntryTps(entry: RuntimeTelemetryEntry): string {
  if (!entry.durationMs || entry.durationMs === 0) return "-";
  return `${(entry.outputTokens / (entry.durationMs / 1000)).toFixed(1)} t/s`;
}

function memorySettingLabel(key: string): string {
  const labels: Record<string, string> = {
    projectMemory: "启用项目记忆",
    conversationMemory: "启用会话记忆",
    longTermMemory: "启用长期记忆"
  };
  return labels[key] ?? key;
}

function shortcutSettingLabel(key: string): string {
  const labels: Record<string, string> = {
    sendMessage: "发送消息",
    commandPalette: "命令面板",
    newTask: "新建任务",
    openSettings: "打开设置",
    toggleWorkspaceContext: "切换工作区"
  };
  return labels[key] ?? key;
}
