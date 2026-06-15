function WorkspaceFilePreviewDrawer({
  preview,
  sending,
  onAskAgent,
  onClose
}: {
  preview: WorkspaceFilePreviewResult | null;
  sending: boolean;
  onAskAgent: () => void;
  onClose: () => void;
}) {
  if (!preview) return null;
  return (
    <div className="workspace-file-preview-drawer">
      <strong>{preview.name}</strong>
      <pre>{preview.content}</pre>
      <button onClick={onClose} type="button">
        关闭
      </button>
    </div>
  );
}

function MessageBubble({ message, agents }: { message: ChatMessage; agents: AgentProfile[] }) {
  return (
    <div className={`message-bubble ${message.role}`}>
      <strong>{message.author}</strong>
      <p>{message.content}</p>
    </div>
  );
}