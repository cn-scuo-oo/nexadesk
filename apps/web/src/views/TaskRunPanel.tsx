function TaskRunPanel({
  activeAgent,
  activeRuntimeModel,
  activeRuntimeProvider,
  approvals,
  artifacts,
  completedTasks,
  messageCount,
  pendingTasks,
  taskBoard,
  toolActivity,
  workspaceLabel,
  onOpenContext
}: {
  activeAgent: AgentProfile | null;
  activeRuntimeModel: string;
  activeRuntimeProvider?: ProviderSettings;
  approvals: number;
  artifacts?: import("./lib/types").WorkspaceArtifact[];
  completedTasks: number;
  messageCount: number;
  pendingTasks: number;
  taskBoard: TaskBoardItem[];
  toolActivity: Array<ToolCall & { messageAuthor: string; createdAt: string }>;
  workspaceLabel: string;
  onOpenContext: () => void;
}) {
  const [activePanel, setActivePanel] = useState<"changes" | "activity" | "overview">("changes");
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
  const [artifactView, setArtifactView] = useState<"tools" | "artifacts">("tools");
  const fileChanges = toolActivity.filter((tool) => {
    const name = String(tool.name);
    return name.includes("write") || name.includes("file") || name.includes("command");
  });
  const visibleTools = toolActivity.slice(-5).reverse();
  const visibleChanges = fileChanges.slice(-4).reverse();
  const selectedChange = visibleChanges.find((tool) => tool.id === selectedChangeId) ?? visibleChanges[0] ?? null;
  const runningTools = toolActivity.filter((tool) => tool.status === "running" || tool.status === "queued").length;
  const completedTools = toolActivity.filter(
    (tool) => tool.status === "completed" || tool.status === "approved"
  ).length;
  const previewTools = selectedChange
    ? [selectedChange, ...visibleChanges.filter((tool) => tool.id !== selectedChange.id).slice(0, 2)]
    : [];
  const visibleArtifacts = artifacts ?? [];
  const codePreviewLines =
    previewTools.length > 0
      ? previewTools.map((tool) => ({
          id: tool.id,
          sign: tool.status === "failed" || tool.status === "rejected" ? "-" : "+",
          text: `${toolNameLabel(tool.name)} · ${tool.summary}`
        }))
      : [
          { id: "waiting-1", sign: "+", text: "等待 Agent 产生文件写入、命令输出或代码 diff。" },
          { id: "waiting-2", sign: "+", text: "高风险写入会先进入审批队列，批准后再执行。" },
          { id: "waiting-3", sign: "+", text: "这里会作为任务运行页的代码变更预览区。" }
        ];

  return (
    <aside className="task-run-panel" aria-label="任务执行面板">
      <div className="task-run-panel-head">
        <div>
          <p className="eyebrow">Run Inspector</p>
          <h3>代码变更</h3>
          <span>
            {activeAgent?.name ?? "Cowork 助手"} · {activeRuntimeModel || "未选择模型"}
          </span>
        </div>
        <button className="secondary-button" onClick={onOpenContext} type="button">
          上下文
        </button>
      </div>

      <div className="task-run-tabs run-panel-tabs" aria-label="运行面板标签">
        <button
          className={activePanel === "overview" ? "active" : ""}
          onClick={() => setActivePanel("overview")}
          type="button"
        >
          运行概览
        </button>
        <button
          className={activePanel === "activity" ? "active" : ""}
          onClick={() => setActivePanel("activity")}
          type="button"
        >
          工具活动
        </button>
        <button
          className={activePanel === "changes" ? "active" : ""}
          onClick={() => setActivePanel("changes")}
          type="button"
        >
          代码变更
        </button>
      </div>

      {activePanel === "changes" ? (
        <section className="task-run-card code-change-card task-run-primary">
          <div className="task-run-heading">
            <div>
              <p className="eyebrow">代码变更</p>
              <h3>{artifactView === "artifacts" ? "工作区工件" : "文件与命令"}</h3>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                className={artifactView === "tools" ? "secondary-button active-toggle" : "ghost-button"}
                onClick={() => setArtifactView("tools")}
                type="button"
                style={{ fontSize: "0.7rem", padding: "2px 8px" }}
              >
                实时活动
              </button>
              <button
                className={artifactView === "artifacts" ? "secondary-button active-toggle" : "ghost-button"}
                onClick={() => setArtifactView("artifacts")}
                type="button"
                style={{ fontSize: "0.7rem", padding: "2px 8px" }}
              >
                工件沉淀
              </button>
            </div>
          </div>

          {artifactView === "artifacts" ? (
            <div className="change-inspector">
              <div className="change-file-list" aria-label="工作区工件列表">
                {visibleArtifacts.length === 0 ? (
                  <article className="change-empty-card">
                    <strong>暂无工件</strong>
                    <span>Agent 生成的 diff、报告、文件会沉淀在这里供审阅。</span>
                  </article>
                ) : (
                  visibleArtifacts.map((artifact) => (
                    <article className="artifact-item" key={artifact.id}>
                      <div>
                        <span className={`artifact-kind ${artifact.kind}`}>
                          {artifact.kind === "diff" ? "Diff" : artifact.kind === "file" ? "文件" : artifact.kind === "report" ? "报告" : "命令"}
                        </span>
                        <strong>{artifact.title}</strong>
                        <span className={`artifact-status ${artifact.status}`}>
                          {artifact.status === "applied" ? "已应用" : artifact.status === "ready" ? "待审阅" : "草稿"}
                        </span>
                      </div>
                      <p>{artifact.summary}</p>
                      {artifact.path && <small className="artifact-path">{artifact.path}</small>}
                      {artifact.kind === "diff" && (
                        <div className="artifact-diff-preview">
                          <pre>
                            {artifact.summary.split("\n").slice(0, 12).map((line, i) => (
                              <code
                                className={line.startsWith("-") ? "removed" : line.startsWith("+") ? "added" : ""}
                                key={i}
                              >
                                {line}
                              </code>
                            ))}
                          </pre>
                        </div>
                      )}
                      {artifact.status === "ready" && (
                        <div className="artifact-actions">
                          <button className="primary-button" type="button" style={{ fontSize: "0.72rem", padding: "4px 12px" }}>
                            应用变更
                          </button>
                          <button className="secondary-button" type="button" style={{ fontSize: "0.72rem", padding: "4px 12px" }}>
                            查看详情
                          </button>
                        </div>
                      )}
                    </article>
                  ))
                )}
              </div>
            </div>
          ) : (
          <div className="change-inspector">
            <div className="change-file-list" aria-label="代码变更列表">
              {visibleChanges.length === 0 ? (
                <article className="change-empty-card">
                  <strong>等待变更</strong>
                  <span>写文件、读文件或执行命令后会进入这里。</span>
                </article>
              ) : (
                visibleChanges.map((tool) => (
                  <button
                    className={selectedChange?.id === tool.id ? "active" : ""}
                    key={`${tool.id}-change`}
                    onClick={() => setSelectedChangeId(tool.id)}
                    type="button"
                  >
                    <span className={`tool-call-dot ${tool.status}`} />
                    <span>
                      <strong>{toolNameLabel(tool.name)}</strong>
                      <small>{tool.summary}</small>
                    </span>
                    <b>{toolStatusLabel(tool.status)}</b>
                  </button>
                ))
              )}
            </div>
            <div className="change-preview-stack">
              <div className="change-selected-summary">
                <span>{selectedChange ? toolStatusLabel(selectedChange.status) : "待生成"}</span>
                <strong>{selectedChange ? toolNameLabel(selectedChange.name) : "实时写入预览"}</strong>
                <small>{selectedChange?.summary ?? "暂无真实文件变更，先保留写入预览区域。"}</small>
              </div>
              <div className="code-preview-window" aria-label="实时写入预览">
                <div className="code-preview-title">
                  <span />
                  实时写入
                </div>
                <pre>
                  {codePreviewLines.map((line, index) => (
                    <code className={line.sign === "-" ? "removed" : "added"} key={line.id}>
                      {String(index + 1).padStart(2, "0")} {line.sign} {line.text}
                    </code>
                  ))}
                </pre>
              </div>
            </div>
          </div>
          )}
        </section>
      ) : activePanel === "activity" ? (
        <section className="task-run-card task-run-primary">
          <div className="task-run-heading">
            <div>
              <p className="eyebrow">工具活动</p>
              <h3>实时执行</h3>
            </div>
            <Terminal size={17} />
          </div>
          <div className="task-activity-list">
            {visibleTools.length === 0 ? (
              <span className="task-panel-empty">暂无工具调用。Agent 读取文件、运行命令或写入结果后会出现在这里。</span>
            ) : (
              visibleTools.map((tool) => (
                <article className={`task-activity-row ${tool.status}`} key={tool.id}>
                  <span className={`tool-call-dot ${tool.status}`} />
                  <div>
                    <strong>{toolNameLabel(tool.name)}</strong>
                    <small>{tool.summary}</small>
                  </div>
                  <b>{toolStatusLabel(tool.status)}</b>
                </article>
              ))
            )}
          </div>
        </section>
      ) : (
        <section className="task-run-card run-overview-card task-run-primary">
          <div className="task-run-heading">
            <div>
              <p className="eyebrow">运行概览</p>
              <h3>{activeAgent?.name ?? "Cowork 助手"}</h3>
            </div>
            <span className={`agent-status ${activeAgent?.status ?? "idle"}`} />
          </div>
          <p>
            {activeRuntimeProvider?.name ?? "未选择模型服务"} · {activeRuntimeModel || "未选择模型"}
          </p>
          <div className="run-metric-strip">
            <span>
              <b>{messageCount}</b>
              消息
            </span>
            <span>
              <b>{runningTools}</b>
              运行中
            </span>
            <span>
              <b>{completedTools}</b>
              已完成
            </span>
          </div>
        </section>
      )}

      <section className="task-run-card">
        <div className="task-run-heading">
          <div>
            <p className="eyebrow">审批</p>
            <h3>{approvals > 0 ? `${approvals} 个待处理` : "无需审批"}</h3>
          </div>
          <ShieldCheck size={17} />
        </div>
        <button className="secondary-button" onClick={onOpenContext} type="button">
          打开审批与上下文
        </button>
      </section>

      <section className="task-run-card">
        <div className="task-run-heading">
          <div>
            <p className="eyebrow">任务队列</p>
            <h3>协作步骤</h3>
          </div>
          <ListChecks size={17} />
        </div>
        <div className="task-mini-board">
          <article>
            <span className="status muted-status">Workspace</span>
            <strong>{workspaceLabel || "当前工作区"}</strong>
          </article>
          <article>
            <span className="status muted-status">Progress</span>
            <strong>
              {pendingTasks} 个进行中 · {completedTasks} 个完成
            </strong>
          </article>
          {taskBoard.slice(0, 3).map((task) => (
            <article key={task.id}>
              <span className="status muted-status">{task.status}</span>
              <strong>{task.title}</strong>
            </article>
          ))}
        </div>
      </section>
    </aside>
  );
}