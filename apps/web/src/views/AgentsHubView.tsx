function AgentsHubView({
  activeAgent,
  agents,
  engines,
  teams,
  onActivate,
  onCreate,
  onEdit,
  onOpenSettings
}: {
  activeAgent: AgentProfile | null;
  agents: AgentProfile[];
  engines: AgentEngineSettings[];
  teams: AgentTeam[];
  onActivate: (agentId: string) => void;
  onCreate: () => void;
  onEdit: (agentId: string) => void;
  onOpenSettings: () => void;
}) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(activeAgent?.id ?? agents[0]?.id ?? null);
  const [agentViewTab, setAgentViewTab] = useState<"agents" | "teams">("agents");

  useEffect(() => {
    if (!selectedAgentId || !agents.some((agent) => agent.id === selectedAgentId)) {
      setSelectedAgentId(activeAgent?.id ?? agents[0]?.id ?? null);
    }
  }, [activeAgent, agents, selectedAgentId]);

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? activeAgent ?? agents[0];
  const selectedEngine = selectedAgent ? engines.find((engine) => engine.id === selectedAgent.engineId) : undefined;
  const enabledAgents = agents.filter((agent) => agent.enabled);
  const runningAgents = agents.filter((agent) => agent.status === "running");

  return (
    <section className="workspace module-workspace agent-workspace">
      <ModuleHeader
        eyebrow="Agents"
        title="我的 Agent"
        detail="助手、团队和运行引擎集中到独立页面。"
        actionLabel="新建 Agent"
        onAction={onCreate}
      />
      <div className="agent-team-layout">
        <section className="panel-block agent-team-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Team</p>
              <h3>团队管理</h3>
            </div>
            <Users size={18} />
          </div>
          <div className="agent-team-stats">
            <span>
              <b>{agents.length}</b>总 Agent
            </span>
            <span>
              <b>{enabledAgents.length}</b>已启用
            </span>
            <span>
              <b>{runningAgents.length}</b>运行中
            </span>
          </div>

          <div className="marketplace-tabs">
            <button
              className={agentViewTab === "agents" ? "marketplace-tab active" : "marketplace-tab"}
              onClick={() => setAgentViewTab("agents")}
              type="button"
            >
              Agent
            </button>
            <button
              className={agentViewTab === "teams" ? "marketplace-tab active" : "marketplace-tab"}
              onClick={() => setAgentViewTab("teams")}
              type="button"
            >
              团队
            </button>
          </div>

          {agentViewTab === "agents" ? (
            <div className="agent-team-list">
              {agents.length === 0 ? (
                <EmptyState title="暂无 Agent" detail="新建 Agent 后会显示在团队列表中。" />
              ) : (
                agents.map((agent) => {
                  const engine = engines.find((item) => item.id === agent.engineId);
                  return (
                    <button
                      className={selectedAgent?.id === agent.id ? "agent-team-row active" : "agent-team-row"}
                      key={agent.id}
                      onClick={() => setSelectedAgentId(agent.id)}
                      type="button"
                    >
                      <span className="agent-mini-avatar">{agent.name.slice(0, 1)}</span>
                      <span>
                        <strong>{agent.name}</strong>
                        <small>
                          {engine?.name ?? "NexaDesk Built-in"} · {agent.enabled ? "启用" : "停用"}
                        </small>
                      </span>
                      {activeAgent?.id === agent.id ? <b>当前</b> : null}
                    </button>
                  );
                })
              )}
            </div>
          ) : (
            <div className="team-grid">
              {teams.map((team) => (
                <article className="team-card" key={team.id}>
                  <span className="team-emoji">{team.emoji}</span>
                  <strong>{team.name}</strong>
                  <small>{team.description}</small>
                  <span className="team-member-count">
                    {team.agentIds.length} 个成员 · {team.workflow}
                  </span>
                </article>
              ))}
              <article
                className="team-card"
                style={{
                  borderStyle: "dashed",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  minHeight: 100
                }}
              >
                <span style={{ fontSize: 24 }}>+</span>
                <small>新建团队</small>
              </article>
            </div>
          )}
        </section>

        <section className="panel-block agent-detail-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Agent Detail</p>
              <h3>{selectedAgent?.name ?? "选择一个 Agent"}</h3>
            </div>
            <span className={selectedAgent?.enabled ? "status ready" : "status muted-status"}>
              {selectedAgent?.enabled ? "启用" : "停用"}
            </span>
          </div>

          {selectedAgent ? (
            <div className="agent-detail-body">
              <div className="agent-detail-hero">
                <span className="agent-large-avatar">{selectedAgent.name.slice(0, 1)}</span>
                <div>
                  <p className="eyebrow">{agentCategoryLabel(selectedAgent.category)}</p>
                  <h3>{selectedAgent.name}</h3>
                  <p>{selectedAgent.description}</p>
                </div>
              </div>

              <div className="agent-detail-grid">
                <article>
                  <p className="eyebrow">状态</p>
                  <strong>{selectedAgent.status}</strong>
                  <span>{activeAgent?.id === selectedAgent.id ? "当前工作台 Agent" : "可切换到当前工作台"}</span>
                </article>
                <article>
                  <p className="eyebrow">Provider</p>
                  <strong>{selectedAgent.providerId}</strong>
                  <span>模型中心配置会决定真实调用来源。</span>
                </article>
                <article>
                  <p className="eyebrow">技能</p>
                  <strong>{selectedAgent.skills.length}</strong>
                  <span>{selectedAgent.skills.slice(0, 3).join(" / ") || "未绑定技能"}</span>
                </article>
                <article>
                  <p className="eyebrow">MCP 工具</p>
                  <strong>{selectedAgent.mcpToolIds.length}</strong>
                  <span>{selectedAgent.mcpToolIds.length ? "已绑定工具权限" : "未绑定工具"}</span>
                </article>
              </div>

              <section className="agent-instruction-card">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">System Prompt</p>
                    <h3>系统提示词</h3>
                  </div>
                  <FileText size={17} />
                </div>
                <p>{selectedAgent.instructions}</p>
              </section>

              <section className="agent-engine-card">
                <div>
                  <p className="eyebrow">Runtime Engine</p>
                  <h3>{selectedEngine?.name ?? "NexaDesk Built-in"}</h3>
                  <span>{selectedEngine?.description ?? "使用内置模型中心和审批策略运行。"}</span>
                </div>
                <div className="agent-engine-meta">
                  <span>
                    Kind <b>{selectedEngine?.kind ?? "builtin"}</b>
                  </span>
                  <span>
                    权限 <b>{enginePermissionLabel(selectedEngine?.permissionMode)}</b>
                  </span>
                  <span>
                    配置 <b>{engineSourceLabel(selectedEngine?.configSource)}</b>
                  </span>
                  <span>
                    状态 <b>{engineSetupLabel(selectedEngine?.setupStatus)}</b>
                  </span>
                </div>
              </section>

              <div className="agent-detail-actions">
                <button className="secondary-button" onClick={() => onEdit(selectedAgent.id)} type="button">
                  编辑 Agent
                </button>
                <button className="primary-button" onClick={() => onActivate(selectedAgent.id)} type="button">
                  {activeAgent?.id === selectedAgent.id ? "当前 Agent" : "切换到工作台"}
                </button>
                <button className="secondary-button" onClick={onOpenSettings} type="button">
                  打开完整助手设置
                </button>
              </div>
            </div>
          ) : (
            <EmptyState title="未选择 Agent" detail="从左侧团队列表选择一个 Agent。" />
          )}
        </section>

        <section className="panel-block agent-engine-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Engines</p>
              <h3>运行引擎配置</h3>
            </div>
            <Terminal size={18} />
          </div>
          <div className="agent-engine-list">
            {engines.map((engine) => {
              const linkedAgents = agents.filter((agent) => agent.engineId === engine.id);
              return (
                <article
                  className={selectedEngine?.id === engine.id ? "agent-engine-row active" : "agent-engine-row"}
                  key={engine.id}
                >
                  <div>
                    <strong>{engine.name}</strong>
                    <span>{engine.description}</span>
                  </div>
                  <div className="agent-engine-row-footer">
                    <small>
                      {engine.kind} · {engineSetupLabel(engine.setupStatus)}
                    </small>
                    <b>{linkedAgents.length} Agent</b>
                  </div>
                  <div className="agent-engine-capabilities">
                    {engine.capabilities.slice(0, 5).map((capability) => (
                      <span key={capability}>{capability}</span>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}

function agentCategoryLabel(category: AgentProfile["category"]) {
  const labels: Record<AgentProfile["category"], string> = {
    cowork: "Cowork",
    code: "代码助手",
    office: "Office 助手",
    file: "文件助手",
    report: "报告助手",
    custom: "自定义助手"
  };
  return labels[category];
}

function enginePermissionLabel(mode?: AgentEngineSettings["permissionMode"]) {
  const labels: Record<AgentEngineSettings["permissionMode"], string> = {
    ask: "询问",
    auto: "自动",
    conservative: "保守",
    bypass: "绕过"
  };
  return mode ? labels[mode] : "询问";
}

function engineSourceLabel(source?: AgentEngineSettings["configSource"]) {
  const labels: Record<AgentEngineSettings["configSource"], string> = {
    nexadesk_model: "模型中心",
    local_cli: "本机 CLI"
  };
  return source ? labels[source] : "模型中心";
}

function engineSetupLabel(status?: AgentEngineSettings["setupStatus"]) {
  const labels: Record<AgentEngineSettings["setupStatus"], string> = {
    ready: "可用",
    needs_setup: "待配置",
    not_installed: "未安装"
  };
  return status ? labels[status] : "可用";
}