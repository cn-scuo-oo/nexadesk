function ScheduledTasksView({
  agents,
  automationRuns,
  automations,
  taskBoard,
  onCreateAutomation,
  onRunAutomation,
  onUpdateAutomation
}: {
  agents: AgentProfile[];
  automationRuns: AppSnapshot["automationRuns"];
  automations: AppSnapshot["automations"];
  taskBoard: TaskBoardItem[];
  onCreateAutomation: (payload: {
    name: string;
    prompt: string;
    scheduleKind: AutomationScheduleKind;
    enabled: boolean;
    agentId?: string;
  }) => Promise<void> | void;
  onRunAutomation: (jobId: string) => Promise<void> | void;
  onUpdateAutomation: (
    jobId: string,
    patch: {
      enabled?: boolean;
      scheduleKind?: AutomationScheduleKind;
      name?: string;
      prompt?: string;
      agentId?: string;
    }
  ) => Promise<void> | void;
}) {
  const [selectedAutomationId, setSelectedAutomationId] = useState<string | null>(automations[0]?.id ?? null);
  const [draftName, setDraftName] = useState("每天整理工作区文件");
  const [draftPrompt, setDraftPrompt] = useState("检查默认工作区最近变化，列出风险、待办和建议。");
  const [draftScheduleKind, setDraftScheduleKind] = useState<AutomationScheduleKind>("daily");
  const [draftAgentId, setDraftAgentId] = useState<string>(agents[0]?.id ?? "");
  const [draftEnabled, setDraftEnabled] = useState(true);
  const [automationBusyId, setAutomationBusyId] = useState<string | null>(null);
  const [automationStatus, setAutomationStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedAutomationId || !automations.some((job) => job.id === selectedAutomationId)) {
      setSelectedAutomationId(automations[0]?.id ?? null);
    }
  }, [automations, selectedAutomationId]);

  const selectedAutomation = automations.find((job) => job.id === selectedAutomationId) ?? automations[0];
  const enabledAutomations = automations.filter((job) => job.enabled).length;
  const runningTasks =
    automationRuns.filter((run) => run.status === "running").length ||
    taskBoard.filter((task) => task.status === "Running").length;
  const nextRunLabel = selectedAutomation?.nextRun || "未计划";
  const selectedRuns = selectedAutomation
    ? automationRuns.filter((run) => run.jobId === selectedAutomation.id)
    : automationRuns;

  async function submitAutomation(event: FormEvent) {
    event.preventDefault();
    const name = draftName.trim();
    const prompt = draftPrompt.trim();
    if (!name || !prompt) {
      setAutomationStatus("请填写任务名称和执行提示词。");
      return;
    }
    setAutomationStatus(null);
    await Promise.resolve(
      onCreateAutomation({
        name,
        prompt,
        scheduleKind: draftScheduleKind,
        enabled: draftEnabled,
        agentId: draftAgentId || undefined
      })
    );
    setDraftName("");
    setDraftPrompt("");
  }

  async function toggleAutomation(jobId: string, enabled: boolean) {
    setAutomationBusyId(jobId);
    try {
      await Promise.resolve(onUpdateAutomation(jobId, { enabled }));
    } finally {
      setAutomationBusyId(null);
    }
  }

  async function runAutomationNow(jobId: string) {
    setAutomationBusyId(jobId);
    try {
      await Promise.resolve(onRunAutomation(jobId));
    } finally {
      setAutomationBusyId(null);
    }
  }

  return (
    <section className="workspace module-workspace automation-workspace">
      <ModuleHeader
        eyebrow="Automation"
        title="定时任务"
        detail="计划任务、运行记录和执行助手分开管理，后续可接真实后台调度。"
      />
      <div className="automation-dashboard">
        <section className="automation-summary-card">
          <span>
            <b>{automations.length}</b>
            计划任务
          </span>
          <span>
            <b>{enabledAutomations}</b>
            已启用
          </span>
          <span>
            <b>{runningTasks}</b>
            运行中
          </span>
          <span>
            <b>{agents.filter((agent) => agent.enabled).length}</b>
            可用助手
          </span>
        </section>

        <section className="panel-block automation-plan-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Schedule</p>
              <h3>任务计划</h3>
            </div>
            <CircleDot size={18} />
          </div>
          <div className="automation-plan-list">
            {automations.length === 0 ? (
              <EmptyState title="暂无定时任务" detail="创建计划后会显示在这里。" />
            ) : (
              automations.map((job) => (
                <button
                  className={selectedAutomation?.id === job.id ? "automation-plan-row active" : "automation-plan-row"}
                  key={job.id}
                  onClick={() => setSelectedAutomationId(job.id)}
                  type="button"
                >
                  <span className={job.enabled ? "history-status-dot pinned" : "history-status-dot muted"} />
                  <span>
                    <strong>{job.name}</strong>
                    <small>{job.schedule}</small>
                  </span>
                  <b>{job.lastStatus === "failed" ? "失败" : job.enabled ? "启用" : "停用"}</b>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="panel-block automation-detail-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Task Detail</p>
              <h3>{selectedAutomation?.name ?? "选择一个计划"}</h3>
            </div>
            <ListChecks size={18} />
          </div>
          <div className="automation-detail-grid">
            <article>
              <p className="eyebrow">计划</p>
              <strong>{selectedAutomation?.schedule ?? "未设置"}</strong>
              <span>
                {selectedAutomation ? automationScheduleKindLabel(selectedAutomation.scheduleKind) : "未选择任务"}
              </span>
            </article>
            <article>
              <p className="eyebrow">下次运行</p>
              <strong>{nextRunLabel}</strong>
              <span>{selectedAutomation?.enabled ? "后端调度器会按计划触发。" : "当前任务未启用。"}</span>
            </article>
            <article>
              <p className="eyebrow">执行助手</p>
              <strong>
                {agents.find((agent) => agent.id === selectedAutomation?.agentId)?.name ??
                  agents.find((agent) => agent.id === "cowork")?.name ??
                  agents[0]?.name ??
                  "未配置"}
              </strong>
              <span>
                {selectedAutomation?.lastRunAt ? `上次运行：${formatTime(selectedAutomation.lastRunAt)}` : "尚未运行。"}
              </span>
            </article>
          </div>
          {selectedAutomation ? (
            <div className="automation-action-row">
              <button
                className="secondary-button"
                disabled={automationBusyId === selectedAutomation.id}
                onClick={() => void toggleAutomation(selectedAutomation.id, !selectedAutomation.enabled)}
                type="button"
              >
                {selectedAutomation.enabled ? "停用计划" : "启用计划"}
              </button>
              <button
                className="primary-button"
                disabled={automationBusyId === selectedAutomation.id}
                onClick={() => void runAutomationNow(selectedAutomation.id)}
                type="button"
              >
                {automationBusyId === selectedAutomation.id ? "执行中..." : "立即运行"}
              </button>
              {selectedAutomation.failureReason ? (
                <span className="automation-failure-reason">失败原因：{selectedAutomation.failureReason}</span>
              ) : null}
            </div>
          ) : null}
          <form className="automation-composer-card" onSubmit={(event) => void submitAutomation(event)}>
            <strong>新建计划任务</strong>
            <div className="automation-create-inline">
              <input
                placeholder="例如：每天整理工作区文件"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
              />
              <select value={draftAgentId} onChange={(event) => setDraftAgentId(event.target.value)}>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
              <select
                value={draftScheduleKind}
                onChange={(event) => setDraftScheduleKind(event.target.value as AutomationScheduleKind)}
              >
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
                <option value="hourly">每小时</option>
                <option value="once">仅一次</option>
                <option value="manual">手动</option>
              </select>
              <button className="primary-button" type="submit">
                创建
              </button>
            </div>
            <textarea
              rows={3}
              value={draftPrompt}
              onChange={(event) => setDraftPrompt(event.target.value)}
              placeholder="写清楚这个计划任务要让 Agent 做什么。"
            />
            <label className="connection-toggle inline-check-row">
              <input
                checked={draftEnabled}
                onChange={(event) => setDraftEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>创建后立即启用</span>
            </label>
            {automationStatus ? <p className="automation-failure-reason">{automationStatus}</p> : null}
          </form>
        </section>

        <section className="panel-block automation-runs-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Runs</p>
              <h3>运行记录</h3>
            </div>
            <Terminal size={18} />
          </div>
          <div className="automation-run-list">
            {selectedRuns.length === 0 ? (
              <EmptyState title="暂无运行记录" detail="计划触发或手动运行后会显示执行历史。" />
            ) : null}
            {selectedRuns.map((run) => {
              const owner = agents.find((agent) => agent.id === run.agentId);
              return (
                <article key={run.id}>
                  <span className={`tool-call-dot ${run.status}`} />
                  <div>
                    <strong>{run.jobName}</strong>
                    <small>
                      {owner?.name ?? "Unassigned"} · {formatRelativeTime(run.startedAt)} ·{" "}
                      {run.durationMs ? formatDuration(run.durationMs) : "运行中"}
                    </small>
                    {run.failureReason ? (
                      <small className="automation-run-error">失败原因：{run.failureReason}</small>
                    ) : null}
                    {run.resultSummary ? <small>{run.resultSummary}</small> : null}
                  </div>
                  <b>{automationRunStatusLabel(run.status)}</b>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}
