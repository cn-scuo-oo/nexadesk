function LoadingScreen() {
  return (
    <main className="loading-screen">
      <Workflow size={24} />
      <strong>Starting NexaDesk</strong>
      <span>Loading workspace snapshot...</span>
    </main>
  );
}

function Metric({ hint, label, value }: { hint?: string; label: string; value: string }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function TaskCard({ task, agents }: { task: any; agents: AgentProfile[] }) {
  return (
    <div className="task-card">
      <strong>{task.name ?? task.title ?? "Task"}</strong>
      <span>{task.status ?? "pending"}</span>
    </div>
  );
}

function ApprovalCard({
  approval,
  onResolve
}: {
  approval: PermissionRequest;
  onResolve: (id: string, approved: boolean) => void;
}) {
  return (
    <div className="approval-card">
      <strong>{approval.action}</strong>
      <span>{approval.risk}</span>
      <div>
        <button onClick={() => onResolve(approval.id, true)} type="button">
          批准
        </button>
        <button onClick={() => onResolve(approval.id, false)} type="button">
          拒绝
        </button>
      </div>
    </div>
  );
}

function ApprovalHistoryCard({ entry }: { entry: ApprovalHistoryEntry }) {
  return (
    <div className="approval-history-card">
      <strong>{entry.action}</strong>
      <span>{entry.decision}</span>
    </div>
  );
}

function WorkspaceFilePanel({
  files,
  onSelect
}: {
  files: WorkspaceTreeEntry[];
  onSelect: (file: WorkspaceTreeEntry) => void;
}) {
  return (
    <div className="workspace-file-panel">
      {files.map((f) => (
        <button key={f.path} onClick={() => onSelect(f)} type="button">
          {f.name}
        </button>
      ))}
    </div>
  );
}

function ActivityItem({ event }: { event: ActivityEvent }) {
  return (
    <div className="activity-item">
      <span className="activity-item-title">{event.title}</span>
      <p className="activity-item-detail">{event.detail}</p>
    </div>
  );
}