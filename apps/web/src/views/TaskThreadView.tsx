function TaskThreadView({
  activeAgent,
  activeApprovals,
  activeMessages,
  activeRuntimeModel,
  activeRuntimeProvider,
  draft,
  providers,
  sending,
  taskBoard,
  workspaceLabel,
  onDraftChange,
  onOpenContext,
  onRuntimeChange,
  onSend
}: {
  activeAgent: AgentProfile | null;
  activeApprovals: number;
  activeMessages: ChatMessage[];
  activeRuntimeModel: string;
  activeRuntimeProvider?: ProviderSettings;
  draft: string;
  providers: ProviderSettings[];
  sending: boolean;
  taskBoard: TaskBoardItem[];
  workspaceLabel: string;
  onDraftChange: (value: string) => void;
  onOpenContext: () => void;
  onRuntimeChange: (providerId: string, model?: string) => Promise<void>;
  onSend: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const currentTask = taskBoard.find((task) => task.status === "Running") ?? taskBoard[0];
  const completedTasks = taskBoard.filter((task) => task.status === "Done").length;
  const pendingTasks = taskBoard.filter((task) => task.status !== "Done").length;
  const toolActivity = activeMessages.flatMap((message) =>
    (message.toolCalls ?? []).map((tool) => ({
      ...tool,
      messageAuthor: message.author,
      createdAt: message.createdAt
    }))
  );

  return (
    <section className="workspace thread-workspace">
      <header className="task-command-bar run-topbar">
        <div className="task-command-left">
          <div className="thread-tabs" aria-label="任务视图">
            <span className="active">对话</span>
            <span>工作室</span>
          </div>
          <div>
            <strong>任务工作台</strong>
            <small>{currentTask?.title ?? "开始协作"}</small>
          </div>
        </div>
        <div className="task-command-actions">
          <RuntimePicker
            activeRuntimeModel={activeRuntimeModel}
            activeRuntimeProvider={activeRuntimeProvider}
            providers={providers}
            onRuntimeChange={onRuntimeChange}
          />
          <button className="secondary-button thread-context-trigger" onClick={onOpenContext} type="button">
            <FileText size={15} />
            上下文
            {activeApprovals > 0 ? <b>{activeApprovals}</b> : null}
          </button>
        </div>
      </header>

      <div className="task-workbench-canvas">
        <section className="task-workbench-stage task-run-layout">
          <section className="task-chat-column" aria-label="任务对话区">
            <div className="task-chat-header">
              <div>
                <p className="eyebrow">Conversation</p>
                <h2>{activeAgent?.name ?? "Cowork 助手"}</h2>
                <span>{currentTask?.detail ?? "把问题交给 Cowork，工具、审批和上下文会进入右侧运行面板。"}</span>
              </div>
              <div className="task-chat-pills" aria-label="任务状态">
                <span>
                  <Bot size={14} />
                  {activeAgent?.status === "running" ? "运行中" : "待命"}
                </span>
                <span>
                  <ShieldCheck size={14} />
                  {activeApprovals > 0 ? `${activeApprovals} 个审批` : "安全防护中"}
                </span>
              </div>
            </div>

            <div className="task-conversation-pane">
              <div className="message-list workbench-message-list run-message-list">
                {activeMessages.length === 0 ? (
                  <EmptyState title="还没有任务消息" detail="从新建任务发起一次协作，消息会出现在这里。" />
                ) : (
                  activeMessages.map((message) => <MessageBubble key={message.id} message={message} compactTools />)
                )}
                {sending ? <div className="message streaming"><p>正在思考...</p></div> : null}
              </div>

              <form className="workbench-composer run-composer" onSubmit={onSend}>
                <textarea
                  aria-label="任务输入"
                  placeholder="分配任务或继续提问..."
                  value={draft}
                  onChange={(event) => onDraftChange(event.target.value)}
                />
                <div className="workbench-composer-footer">
                  <span>
                    <Folder size={15} />
                    {workspaceLabel || "当前工作区"}
                  </span>
                  <div>
                    <button className="icon-button" onClick={onOpenContext} type="button" aria-label="打开上下文">
                      <FileText size={15} />
                    </button>
                    <button className="icon-button" type="button" aria-label="选择技能">
                      <Workflow size={15} />
                    </button>
                    <button
                      className="send-orb"
                      disabled={sending || !draft.trim()}
                      type="submit"
                      aria-label="发送任务"
                    >
                      <Send size={20} />
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </section>

          <TaskRunPanel
            activeAgent={activeAgent}
            activeRuntimeModel={activeRuntimeModel}
            activeRuntimeProvider={activeRuntimeProvider}
            approvals={activeApprovals}
            artifacts={snapshot.artifacts}
            completedTasks={completedTasks}
            messageCount={activeMessages.length}
            pendingTasks={pendingTasks}
            taskBoard={taskBoard}
            toolActivity={toolActivity}
            workspaceLabel={workspaceLabel}
            onOpenContext={onOpenContext}
          />
        </section>
      </div>
    </section>
  );
}
