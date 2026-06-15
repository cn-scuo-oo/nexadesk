function McpServerEditorModal({
  server,
  onClose,
  onSave
}: {
  server: McpServerSettings | null;
  onClose: () => void;
  onSave: (server: McpServerSettings) => void;
}) {
  const [name, setName] = useState(server?.name ?? "自定义 MCP");
  const [description, setDescription] = useState(server?.description ?? "描述这个 MCP 服务器提供的工具。");
  const [transport, setTransport] = useState<McpServerSettings["transport"]>(server?.transport ?? "stdio");
  const [enabled, setEnabled] = useState(server?.enabled ?? true);
  const [command, setCommand] = useState(server?.command ?? "npx");
  const [argsText, setArgsText] = useState((server?.args ?? []).join("\n"));
  const [url, setUrl] = useState(server?.url ?? "http://127.0.0.1:8787/mcp");

  function submitMcpServer(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }
    const args = argsText
      .split(/\r?\n/)
      .map((arg) => arg.trim())
      .filter(Boolean);

    onSave({
      id: server?.id ?? `custom-mcp-${crypto.randomUUID().slice(0, 8)}`,
      name: trimmedName,
      description: description.trim() || "自定义 MCP 服务器。",
      transport,
      enabled,
      command: transport === "stdio" ? command.trim() || undefined : undefined,
      args: transport === "stdio" ? args : undefined,
      url: transport === "http" ? url.trim() || undefined : undefined
    });
  }

  return (
    <div className="agent-editor-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="agent-editor-modal mcp-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-label="MCP 编辑器"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submitMcpServer}
      >
        <div className="agent-editor-header">
          <div>
            <p className="eyebrow">MCP Server</p>
            <h2>{server ? "编辑 MCP" : "新增 MCP"}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="关闭 MCP 编辑器">
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
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <label>
              <span>连接方式</span>
              <select
                value={transport}
                onChange={(event) => setTransport(event.target.value as McpServerSettings["transport"])}
              >
                <option value="stdio">stdio 本地命令</option>
                <option value="http">HTTP 远程端点</option>
              </select>
            </label>
            <label className="inline-check-row">
              <input checked={enabled} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" />
              <span>启用这个 MCP</span>
            </label>
          </section>
          <section className="settings-form">
            {transport === "stdio" ? (
              <>
                <label>
                  <span>命令</span>
                  <input
                    value={command}
                    onChange={(event) => setCommand(event.target.value)}
                    placeholder="npx / node / uvx"
                  />
                </label>
                <label>
                  <span>参数（每行一个）</span>
                  <textarea
                    value={argsText}
                    onChange={(event) => setArgsText(event.target.value)}
                    placeholder={"-y\n@modelcontextprotocol/server-filesystem"}
                  />
                </label>
              </>
            ) : (
              <label>
                <span>HTTP URL</span>
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="http://127.0.0.1:8787/mcp"
                />
              </label>
            )}
            <div className="mcp-editor-note">
              <strong>测试连接</strong>
              <span>保存后在 MCP 页面点击"测试连接"。stdio 会检查本地命令是否存在，HTTP 会请求端点并返回状态码。</span>
            </div>
          </section>
        </div>
        <div className="agent-editor-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            取消
          </button>
          <button className="primary-button" type="submit">
            保存 MCP
          </button>
        </div>
      </form>
    </div>
  );
}