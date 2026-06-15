function AgentEditorModal({
  agent,
  engines,
  mcpServers,
  mcpTools,
  providers,
  skills,
  onClose,
  onSave
}: {
  agent: AgentProfile | null;
  engines: AgentEngineSettings[];
  mcpServers: McpServerSettings[];
  mcpTools: McpToolDefinition[];
  providers: ProviderSettings[];
  skills: SkillProfile[];
  onClose: () => void;
  onSave: (agent: AgentProfile) => void;
}) {
  const fallbackEngine = engines.find((engine) => engine.enabled) ?? engines[0];
  const fallbackProvider = providers.find((provider) => provider.connected) ?? providers[0];
  const [name, setName] = useState(agent?.name ?? "自定义 Agent");
  const [description, setDescription] = useState(agent?.description ?? "描述这个 Agent 负责的任务。");
  const [category, setCategory] = useState<AgentProfile["category"]>(agent?.category ?? "custom");
  const [enabled, setEnabled] = useState(agent?.enabled ?? true);
  const [engineId, setEngineId] = useState(agent?.engineId ?? fallbackEngine?.id ?? "nexadesk_builtin");
  const [providerId, setProviderId] = useState(agent?.providerId ?? fallbackProvider?.id ?? "openai-compatible");
  const [instructions, setInstructions] = useState(
    agent?.instructions ?? "说明这个 Agent 应该如何处理任务、何时请求工具、输出什么结果。"
  );
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(() => new Set(agent?.skills ?? []));
  const [selectedMcpToolIds, setSelectedMcpToolIds] = useState<Set<string>>(() => new Set(agent?.mcpToolIds ?? []));
  const selectedEngine = engines.find((engine) => engine.id === engineId) ?? fallbackEngine;
  const mcpToolChoices = buildMcpToolChoices(mcpServers, mcpTools, selectedMcpToolIds);

  function toggleSkill(skillId: string) {
    setSelectedSkillIds((current) => {
      const next = new Set(current);
      if (next.has(skillId)) {
        next.delete(skillId);
      } else {
        next.add(skillId);
      }
      return next;
    });
  }

  function toggleMcpTool(toolId: string) {
    setSelectedMcpToolIds((current) => {
      const next = new Set(current);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  }

  function submitAgent(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }
    onSave({
      id: agent?.id ?? `custom-agent-${crypto.randomUUID().slice(0, 8)}`,
      name: trimmedName,
      description: description.trim() || "自定义 Agent",
      runtime: selectedEngine?.name ?? "NexaDesk Built-in",
      engineId,
      providerId,
      status: agent?.status ?? "idle",
      skills: [...selectedSkillIds],
      mcpToolIds: [...selectedMcpToolIds],
      enabled,
      category,
      instructions: instructions.trim() || "按用户目标完成任务，必要时请求工具和审批。"
    });
  }

  return (
    <div className="agent-editor-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="agent-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Agent 编辑器"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submitAgent}
      >
        <div className="agent-editor-header">
          <div>
            <p className="eyebrow">Agent Builder</p>
            <h2>{agent ? "编辑 Agent" : "新建 Agent"}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="关闭 Agent 编辑器">
            <X size={17} />
          </button>
        </div>
        <div className="agent-editor-grid">
          <section className="settings-form">
            <label>
              <span>名称</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              <span>描述</span>
              <input value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <label>
              <span>类型</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as AgentProfile["category"])}
              >
                <option value="cowork">Cowork</option>
                <option value="code">代码</option>
                <option value="office">Office</option>
                <option value="file">文件</option>
                <option value="report">报告</option>
                <option value="custom">自定义</option>
              </select>
            </label>
            <label>
              <span>Agent 引擎</span>
              <select
                value={engineId}
                onChange={(event) => setEngineId(event.target.value as AgentEngineSettings["id"])}
              >
                {engines.map((engine) => (
                  <option key={engine.id} value={engine.id}>
                    {engine.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>默认 Provider</span>
              <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-check-row">
              <input checked={enabled} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" />
              <span>启用这个 Agent</span>
            </label>
          </section>
          <section className="settings-form">
            <label>
              <span>系统提示词</span>
              <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} />
            </label>
            <div className="agent-skill-picker">
              <span>绑定技能</span>
              <div>
                {skills.map((skill) => (
                  <label key={skill.id}>
                    <input
                      checked={selectedSkillIds.has(skill.id)}
                      onChange={() => toggleSkill(skill.id)}
                      type="checkbox"
                    />
                    <strong>{skill.name}</strong>
                  </label>
                ))}
              </div>
            </div>
            <div className="agent-skill-picker mcp-tool-picker">
              <span>绑定 MCP 工具</span>
              <div>
                {mcpToolChoices.length === 0 ? (
                  <small className="empty-picker-note">先到 MCP 页面新增服务器并刷新工具。</small>
                ) : (
                  mcpToolChoices.map((choice) => (
                    <label key={choice.id}>
                      <input
                        checked={selectedMcpToolIds.has(choice.id)}
                        onChange={() => toggleMcpTool(choice.id)}
                        type="checkbox"
                      />
                      <strong>{choice.label}</strong>
                      <small>{choice.detail}</small>
                    </label>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
        <div className="agent-editor-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            取消
          </button>
          <button className="primary-button" type="submit">
            保存 Agent
          </button>
        </div>
      </form>
    </div>
  );
}
