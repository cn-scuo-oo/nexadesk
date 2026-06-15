function NewTaskView({
  activeRuntimeModel,
  activeRuntimeProvider,
  draft,
  error,
  providers,
  recoveringSettings,
  sending,
  onDraftChange,
  onRecoverSettings,
  onRuntimeChange,
  onSend
}: {
  activeRuntimeModel: string;
  activeRuntimeProvider?: ProviderSettings;
  draft: string;
  error: string | null;
  providers: ProviderSettings[];
  recoveringSettings: boolean;
  sending: boolean;
  onDraftChange: (value: string) => void;
  onRecoverSettings: () => void;
  onRuntimeChange: (providerId: string, model?: string) => Promise<void>;
  onSend: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const quickTasks = [
    {
      label: "制作幻灯片",
      detail: "结构、页面、讲稿",
      prompt: "帮我制作一个项目汇报 PPT 大纲，并列出每页标题和要点。"
    },
    {
      label: "数据分析",
      detail: "表格、口径、结论",
      prompt: "帮我分析当前工作区里的数据文件，先总结字段和可能的分析方向。"
    },
    {
      label: "创建网页",
      detail: "产品页、工具页、小游戏",
      prompt: "帮我创建一个可运行的网页原型，先给出结构再实现。"
    },
    {
      label: "整理文件",
      detail: "目录、命名、归档",
      prompt: "帮我扫描工作区目录，提出文件整理和归档方案。"
    }
  ];

  return (
    <section className="workspace welcome-workspace">
      <header className="minimal-topbar assignment-topbar">
        <div className="assignment-topbar-title">
          <span className="workspace-view-pill">对话</span>
          <span>工作室</span>
          <strong>新建任务</strong>
        </div>
        <RuntimePicker
          activeRuntimeModel={activeRuntimeModel}
          activeRuntimeProvider={activeRuntimeProvider}
          providers={providers}
          onRuntimeChange={onRuntimeChange}
        />
        <span className="safe-badge">
          <ShieldCheck size={14} />
          安全防护中
        </span>
      </header>

      {error ? (
        <div className="notice notice-with-actions start-notice">
          <span>API note: {error}. The workbench is using demo data until the server is available.</span>
          <button className="mini-button" disabled={recoveringSettings} onClick={onRecoverSettings} type="button">
            {recoveringSettings ? "恢复中..." : "恢复本地设置"}
          </button>
        </div>
      ) : null}

      <div className="start-canvas">
        <div className="assignment-bot-mark">
          <Sparkles size={32} />
        </div>
        <div className="assignment-heading">
          <h2>开始协作</h2>
          <p>把一个任务交给 Cowork，NexaDesk 会把模型、工具、文件上下文和审批串起来。</p>
        </div>

        <form className="new-task-composer" onSubmit={onSend}>
          <textarea
            aria-label="新建任务"
            placeholder="分配任务或提出问题..."
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
          />
          <div className="new-task-composer-footer">
            <span>
              <Folder size={15} />
              当前工作区
              <b>已连接上下文</b>
            </span>
            <div>
              <button className="icon-button" type="button" aria-label="附件">
                <FileText size={15} />
              </button>
              <button className="icon-button" type="button" aria-label="技能">
                <Workflow size={15} />
              </button>
              <button className="send-orb" disabled={sending || !draft.trim()} type="submit">
                <Send size={20} />
              </button>
            </div>
          </div>
        </form>

        <div className="quick-prompt-row assignment-quick-row">
          {quickTasks.map((task, index) => (
            <button key={task.label} onClick={() => onDraftChange(task.prompt)} type="button">
              {index === 0 ? (
                <FileText size={16} />
              ) : index === 1 ? (
                <Zap size={16} />
              ) : index === 2 ? (
                <Workflow size={16} />
              ) : (
                <Folder size={16} />
              )}
              <span>
                <strong>{task.label}</strong>
                <small>{task.detail}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="assignment-context-strip">
          <span>Local runtime · {activeRuntimeProvider?.name ?? "未选择模型服务"}</span>
          <span>{activeRuntimeModel || "未选择模型"}</span>
          <span>工具审批已开启</span>
        </div>
      </div>
    </section>
  );
}