function TaskSearchView({
  activeSessionId,
  files,
  messages,
  recentFiles,
  sessions,
  onNewTask,
  onOpenSession,
  onSelectSession,
  onOpenWorkspace
}: {
  activeSessionId: string | null;
  files: WorkspaceFile[];
  messages: ChatMessage[];
  recentFiles: WorkspaceTreeEntry[];
  sessions: AppSnapshot["sessions"];
  onNewTask: () => void;
  onOpenSession: (sessionId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onOpenWorkspace: () => void;
}) {
  const selectedSession = sessions.find((session) => session.id === activeSessionId) ?? sessions[0];
  const selectedMessages = selectedSession
    ? messages.filter((message) => message.sessionId === selectedSession.id)
    : [];
  const latestMessage = selectedMessages[selectedMessages.length - 1];
  const contextFiles = [...recentFiles, ...files.slice(0, 4)].slice(0, 6);

  return (
    <section className="workspace module-workspace">
      <ModuleHeader
        eyebrow="Search"
        title="任务记录"
        detail="任务列表和任务详情联动，先查看上下文，再进入运行页继续协作。"
        actionLabel="新建任务"
        onAction={onNewTask}
      />
      <div className="module-search-bar">
        <Search size={18} />
        <input placeholder="搜索任务、文件或上下文" />
      </div>
      <div className="module-toolbar">
        <span className="active">全部任务</span>
        <span>已完成</span>
        <span>有审批</span>
        <span>文件上下文</span>
      </div>
      <div className="task-record-layout">
        <section className="panel-block task-record-list-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">History</p>
              <h3>任务记录</h3>
            </div>
            <CircleDot size={18} />
          </div>
          <div className="task-record-list">
            {sessions.map((session) => (
              <button
                className={selectedSession?.id === session.id ? "task-record-row active" : "task-record-row"}
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                type="button"
              >
                <span className={session.pinned ? "history-status-dot pinned" : "history-status-dot"} />
                <span>
                  <strong>{session.title}</strong>
                  <small>
                    {formatRelativeTime(session.updatedAt)} ·{" "}
                    {messages.filter((message) => message.sessionId === session.id).length} 条消息
                  </small>
                </span>
                <b>{session.pinned ? "置顶" : "详情"}</b>
              </button>
            ))}
          </div>
        </section>

        <section className="panel-block task-detail-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Task Detail</p>
              <h3>{selectedSession?.title ?? "未选择任务"}</h3>
            </div>
            <button
              className="primary-button"
              disabled={!selectedSession}
              onClick={() => selectedSession && onOpenSession(selectedSession.id)}
              type="button"
            >
              进入任务
            </button>
          </div>

          <div className="task-detail-summary">
            <span>
              <b>{selectedMessages.length}</b>
              消息
            </span>
            <span>
              <b>{selectedSession?.agentIds.length ?? 0}</b>
              助手
            </span>
            <span>
              <b>{selectedSession?.pinned ? "是" : "否"}</b>
              置顶
            </span>
          </div>

          <div className="task-detail-body">
            <article className="task-detail-card">
              <p className="eyebrow">Latest</p>
              <strong>
                {latestMessage
                  ? `${latestMessage.author} · ${formatRelativeTime(latestMessage.createdAt)}`
                  : "暂无消息"}
              </strong>
              <span>{latestMessage?.content || "从新建任务发起协作后，最近消息会显示在这里。"}</span>
            </article>

            <article className="task-detail-card">
              <p className="eyebrow">Workspace</p>
              <strong>{selectedSession?.workspace ?? "未设置工作区"}</strong>
              <span>任务详情会保留工作区、助手和消息摘要；后续可继续接真实文件 diff 与运行日志。</span>
            </article>
          </div>

          <div className="task-detail-context">
            <div className="panel-heading compact">
              <div>
                <p className="eyebrow">Context</p>
                <h3>最近上下文</h3>
              </div>
              <FileText size={18} />
            </div>
            <div className="stack-list">
              {contextFiles.map((file) => (
                <button className="module-row" key={file.path} onClick={onOpenWorkspace} type="button">
                  <strong>{file.path}</strong>
                  <span>{file.kind}</span>
                  <b>预览</b>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}