function McpHubView({
  servers,
  testResults,
  toolResults,
  testingServerId,
  refreshingToolsServerId,
  toolPolicies,
  onCreate,
  onDelete,
  onEdit,
  onOpenSettings,
  onRefreshTools,
  onTest,
  onToggle,
  onUpdateToolPolicy
}: {
  servers: McpServerSettings[];
  testResults: Record<string, McpServerTestResult>;
  toolResults: Record<string, McpServerToolsResult>;
  testingServerId: string | null;
  refreshingToolsServerId: string | null;
  toolPolicies: McpToolPolicy[];
  onCreate: () => void;
  onDelete: (serverId: string) => void;
  onEdit: (serverId: string) => void;
  onOpenSettings: () => void;
  onRefreshTools: (server: McpServerSettings) => void;
  onTest: (server: McpServerSettings) => void;
  onToggle: (serverId: string, enabled: boolean) => void;
  onUpdateToolPolicy: (policy: McpToolPolicy) => void;
}) {
  const [selectedServerId, setSelectedServerId] = useState<string | null>(servers[0]?.id ?? null);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [mcpMarketTab, setMcpMarketTab] = useState<"installed" | "marketplace" | "custom">("installed");
  const mcpRegistry = [
    {
      id: "tavily",
      name: "Tavily Search",
      category: "搜索",
      description: "AI 优化的网页搜索 API，返回结构化结果。",
      command: "npx -y @anthropic/tavily-mcp"
    },
    {
      id: "github-mcp",
      name: "GitHub MCP",
      category: "开发",
      description: "GitHub 仓库管理、Issue、PR 和代码搜索。",
      command: "npx -y @anthropic/github-mcp"
    },
    {
      id: "context7",
      name: "Context7",
      category: "开发",
      description: "实时库文档查询，自动获取最新 API 文档。",
      command: "npx -y @anthropic/context7-mcp"
    },
    {
      id: "gdrive",
      name: "Google Drive",
      category: "生产力",
      description: "Google Drive 文件搜索、读取和管理。",
      command: "npx -y @anthropic/gdrive-mcp"
    },
    {
      id: "slack-mcp",
      name: "Slack MCP",
      category: "生产力",
      description: "Slack 频道消息读取和发送。",
      command: "npx -y @anthropic/slack-mcp"
    },
    {
      id: "postgres-mcp",
      name: "PostgreSQL",
      category: "数据",
      description: "PostgreSQL 数据库查询和管理。",
      command: "npx -y @anthropic/postgres-mcp"
    }
  ];
  const mcpCategories = ["全部", "搜索", "开发", "生产力", "数据"];
  const [mcpCategoryFilter, setMcpCategoryFilter] = useState("全部");
  const filteredRegistry =
    mcpCategoryFilter === "全部" ? mcpRegistry : mcpRegistry.filter((r) => r.category === mcpCategoryFilter);
  useEffect(() => {
    if (!selectedServerId || !servers.some((server) => server.id === selectedServerId)) {
      setSelectedServerId(servers[0]?.id ?? null);
    }
  }, [selectedServerId, servers]);

  const enabledCount = servers.filter((server) => server.enabled).length;
  const discoveredTools = Object.values(toolResults).flatMap((result) => result.tools);
  const discoveredToolCount = discoveredTools.length;
  const selectedServer = servers.find((server) => server.id === selectedServerId) ?? servers[0];
  const selectedTools = selectedServer ? (toolResults[selectedServer.id]?.tools ?? []) : [];
  const selectedResult = selectedServer ? testResults[selectedServer.id] : undefined;
  const selectedToolsResult = selectedServer ? toolResults[selectedServer.id] : undefined;
  const selectedTarget = selectedServer
    ? selectedServer.transport === "http"
      ? selectedServer.url || "未配置 URL"
      : [selectedServer.command, ...(selectedServer.args ?? [])].filter(Boolean).join(" ") || "未配置命令"
    : "未选择服务器";

  const selectedTool = selectedToolId ? (discoveredTools.find((t) => t.id === selectedToolId) ?? null) : null;
  const toolPolicy = selectedTool ? toolPolicies.find((p) => p.toolId === selectedTool.id) : undefined;
  const toolPermissionValue: PermissionPolicy = toolPolicy?.permission ?? "ask";

  function renderSchema(schema: unknown, depth = 0): ReactNode {
    if (!schema || typeof schema !== "object") {
      return <code className="mcp-schema-primitive">{String(schema ?? "无")}</code>;
    }
    if (Array.isArray(schema)) {
      return (
        <div className="mcp-schema-block" style={{ marginLeft: depth * 14 }}>
          [
          {schema.map((item, i) => (
            <div key={i}>{renderSchema(item, depth + 1)}</div>
          ))}
          ]
        </div>
      );
    }
    const entries = Object.entries(schema as Record<string, unknown>);
    if (entries.length === 0) {
      return <code className="mcp-schema-primitive">{"{}"}</code>;
    }
    return (
      <div className="mcp-schema-block" style={{ marginLeft: depth * 14 }}>
        {"{"}
        {entries.map(([key, value]) => (
          <div className="mcp-schema-row" key={key}>
            <span className="mcp-schema-key">"{key}"</span>
            <span className="mcp-schema-colon">:</span>
            {typeof value === "object" && value !== null ? (
              renderSchema(value, depth + 1)
            ) : (
              <span className="mcp-schema-value">{JSON.stringify(value)}</span>
            )}
          </div>
        ))}
        {"}"}
      </div>
    );
  }

  function buildExample(schema: unknown): string {
    if (!schema || typeof schema !== "object") return "{}";
    const s = schema as Record<string, unknown>;
    const example: Record<string, unknown> = {};
    const props = s.properties as Record<string, Record<string, unknown>> | undefined;
    if (!props) return JSON.stringify(schema, null, 2);
    const required = new Set((s.required as string[]) ?? []);
    for (const [key, prop] of Object.entries(props)) {
      const type = prop.type as string;
      const desc = (prop.description as string) ?? "";
      if (type === "string") {
        example[key] = desc.includes("path")
          ? "/example/path"
          : desc.includes("url")
            ? "https://example.com"
            : `example_${key}`;
      } else if (type === "number" || type === "integer") {
        example[key] = type === "integer" ? 1 : 1.0;
      } else if (type === "boolean") {
        example[key] = true;
      } else if (type === "array") {
        example[key] = [];
      } else {
        example[key] = {};
      }
    }
    return JSON.stringify(example, null, 2);
  }

  return (
    <section className="workspace module-workspace mcp-workspace">
      <ModuleHeader
        eyebrow="MCP"
        title="MCP 工具服务器"
        detail="服务器详情和工具市场分开展示，刷新后可查看真实工具清单。"
        actionLabel="新增 MCP"
        onAction={onCreate}
      />
      <div className="mcp-console-layout">
        <section className="panel-block mcp-server-list-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Servers</p>
              <h3>服务器</h3>
            </div>
            <ShieldCheck size={18} />
          </div>
          <div className="mcp-gateway-stats">
            <span>
              启用 <b>{enabledCount}</b>
            </span>
            <span>
              总数 <b>{servers.length}</b>
            </span>
            <span>
              工具 <b>{discoveredToolCount}</b>
            </span>
          </div>
          <div className="mcp-server-list">
            {servers.map((server) => (
              <button
                className={selectedServer?.id === server.id ? "mcp-server-row active" : "mcp-server-row"}
                key={server.id}
                onClick={() => {
                  setSelectedServerId(server.id);
                  setSelectedToolId(null);
                }}
                type="button"
              >
                <Terminal size={16} />
                <span>
                  <strong>{server.name}</strong>
                  <small>
                    {server.transport} · {server.enabled ? "启用" : "停用"}
                  </small>
                </span>
                <b>{toolResults[server.id]?.tools.length ?? 0}</b>
              </button>
            ))}
          </div>
        </section>

        <section className="panel-block mcp-server-detail-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Server Detail</p>
              <h3>{selectedServer?.name ?? "未选择服务器"}</h3>
            </div>
            <span className={selectedServer?.enabled ? "status ready" : "status muted-status"}>
              {selectedServer?.enabled ? "启用" : "停用"}
            </span>
          </div>
          {selectedServer ? (
            <div className="mcp-detail-body">
              <p>{selectedServer.description}</p>
              <code className="mcp-server-target">{selectedTarget}</code>
              <div className="mcp-detail-meta">
                <span>
                  Transport <b>{selectedServer.transport}</b>
                </span>
                <span>
                  Tools <b>{selectedTools.length}</b>
                </span>
                <span>
                  Test <b>{selectedResult ? (selectedResult.ok ? "通过" : "失败") : "未测试"}</b>
                </span>
              </div>
              {selectedResult ? (
                <div className={selectedResult.ok ? "mcp-test-result ok" : "mcp-test-result failed"}>
                  <strong>{selectedResult.ok ? "连接可用" : "连接失败"}</strong>
                  <span>
                    {selectedResult.message}
                    {typeof selectedResult.status === "number" ? ` · HTTP ${selectedResult.status}` : ""}
                  </span>
                </div>
              ) : null}
              {selectedToolsResult ? (
                <div className={selectedToolsResult.ok ? "mcp-tools-result ok" : "mcp-tools-result failed"}>
                  <strong>
                    {selectedToolsResult.ok ? `已发现 ${selectedToolsResult.tools.length} 个工具` : "工具发现失败"}
                  </strong>
                  <span>{selectedToolsResult.message}</span>
                </div>
              ) : null}
              <div className="mcp-card-actions">
                <button
                  className="secondary-button"
                  onClick={() => onToggle(selectedServer.id, !selectedServer.enabled)}
                  type="button"
                >
                  {selectedServer.enabled ? "停用" : "启用"}
                </button>
                <button
                  className="secondary-button"
                  disabled={testingServerId === selectedServer.id}
                  onClick={() => onTest(selectedServer)}
                  type="button"
                >
                  {testingServerId === selectedServer.id ? "测试中..." : "测试连接"}
                </button>
                <button
                  className="secondary-button"
                  disabled={refreshingToolsServerId === selectedServer.id}
                  onClick={() => onRefreshTools(selectedServer)}
                  type="button"
                >
                  {refreshingToolsServerId === selectedServer.id ? "刷新中..." : "刷新工具"}
                </button>
                <button className="secondary-button" onClick={() => onEdit(selectedServer.id)} type="button">
                  编辑
                </button>
                <button
                  className="secondary-button danger-soft-button"
                  onClick={() => onDelete(selectedServer.id)}
                  type="button"
                >
                  删除
                </button>
              </div>
              <button className="secondary-button" onClick={onOpenSettings} type="button">
                打开权限策略
              </button>
            </div>
          ) : (
            <EmptyState title="未选择服务器" detail="新增或选择一个 MCP 服务器后查看详情。" />
          )}
        </section>

        <section className="panel-block mcp-tool-market-panel">
          {selectedTool ? (
            <>
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">Tool Detail</p>
                  <h3>{selectedTool.title || selectedTool.name}</h3>
                </div>
                <button className="icon-button" onClick={() => setSelectedToolId(null)} type="button">
                  <X size={15} />
                </button>
              </div>
              <div className="mcp-tool-detail-body">
                <div className="mcp-tool-detail-header">
                  <Workflow size={16} />
                  <div>
                    <strong>{selectedTool.name}</strong>
                    <span>{selectedTool.serverName}</span>
                  </div>
                </div>
                <p className="mcp-tool-detail-desc">{selectedTool.description || "该工具没有描述。"}</p>

                <div className="mcp-tool-detail-section">
                  <h4>输入 Schema</h4>
                  <div className="mcp-schema-viewer">
                    {selectedTool.inputSchema ? (
                      renderSchema(selectedTool.inputSchema)
                    ) : (
                      <span className="mcp-schema-empty">该工具没有定义输入 Schema。</span>
                    )}
                  </div>
                </div>

                <div className="mcp-tool-detail-section">
                  <h4>参数示例</h4>
                  <pre className="mcp-example-code">
                    {selectedTool.inputSchema ? buildExample(selectedTool.inputSchema) : "{}"}
                  </pre>
                </div>

                <div className="mcp-tool-detail-section">
                  <h4>工具权限</h4>
                  <div className="mcp-tool-permission-row">
                    {(["allow", "ask", "deny"] as const).map((perm) => (
                      <label className={`mcp-perm-radio${toolPermissionValue === perm ? " active" : ""}`} key={perm}>
                        <input
                          checked={toolPermissionValue === perm}
                          onChange={() =>
                            onUpdateToolPolicy({
                              toolId: selectedTool.id,
                              serverId: selectedTool.serverId,
                              permission: perm
                            })
                          }
                          name={`mcp-tool-perm-${selectedTool.id}`}
                          type="radio"
                        />
                        <span>{perm === "allow" ? "允许" : perm === "ask" ? "询问" : "拒绝"}</span>
                      </label>
                    ))}
                  </div>
                  <p className="mcp-perm-hint">
                    {toolPermissionValue === "allow" && "该工具将自动执行，不再弹出审批。"}
                    {toolPermissionValue === "ask" && "每次调用前将弹出审批确认。"}
                    {toolPermissionValue === "deny" && "该工具将被禁止调用。"}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="marketplace-tabs">
                <button
                  className={mcpMarketTab === "installed" ? "marketplace-tab active" : "marketplace-tab"}
                  onClick={() => setMcpMarketTab("installed")}
                  type="button"
                >
                  已安装
                </button>
                <button
                  className={mcpMarketTab === "marketplace" ? "marketplace-tab active" : "marketplace-tab"}
                  onClick={() => setMcpMarketTab("marketplace")}
                  type="button"
                >
                  市场
                </button>
                <button
                  className={mcpMarketTab === "custom" ? "marketplace-tab active" : "marketplace-tab"}
                  onClick={() => setMcpMarketTab("custom")}
                  type="button"
                >
                  自定义
                </button>
              </div>

              {mcpMarketTab === "installed" ? (
                <div className="mcp-tool-market-grid">
                  {selectedTools.length === 0 ? (
                    <EmptyState title="暂无工具" detail={'点击"刷新工具"后会显示该服务器真实暴露的工具。'} />
                  ) : (
                    selectedTools.map((tool) => {
                      const tp = toolPolicies.find((p) => p.toolId === tool.id);
                      const permLabel =
                        tp?.permission === "allow" ? "允许" : tp?.permission === "deny" ? "拒绝" : "询问";
                      const permClass =
                        tp?.permission === "allow"
                          ? "status ready"
                          : tp?.permission === "deny"
                            ? "status danger-status"
                            : "status muted-status";
                      return (
                        <article className="mcp-tool-market-card" key={tool.id}>
                          <div>
                            <Workflow size={16} />
                            <strong>{tool.title || tool.name}</strong>
                            <span>{tool.serverName}</span>
                          </div>
                          <p>{tool.description || "该工具没有描述。"}</p>
                          <div className="mcp-card-actions">
                            <button
                              className="secondary-button"
                              onClick={() => setSelectedToolId(tool.id)}
                              type="button"
                            >
                              查看详情
                            </button>
                            {tp ? <span className={permClass}>{permLabel}</span> : null}
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              ) : mcpMarketTab === "marketplace" ? (
                <>
                  <div style={{ display: "flex", gap: 6, padding: "8px 12px", flexWrap: "wrap" }}>
                    {mcpCategories.map((cat) => (
                      <button
                        className={mcpCategoryFilter === cat ? "quick-action-chip" : "quick-action-chip"}
                        key={cat}
                        onClick={() => setMcpCategoryFilter(cat)}
                        style={
                          mcpCategoryFilter === cat
                            ? {
                                borderColor: "var(--green)",
                                color: "var(--green)",
                                background: "var(--theme-primary-muted)"
                              }
                            : {}
                        }
                        type="button"
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div className="marketplace-grid">
                    {filteredRegistry.map((item) => {
                      const installed = servers.some((s) => s.name === item.name);
                      return (
                        <article className="marketplace-card" key={item.id}>
                          <div className="marketplace-card-header">
                            <h4>{item.name}</h4>
                            <span className="marketplace-badge category">{item.category}</span>
                          </div>
                          <p>{item.description}</p>
                          <div className="mcp-card-actions">
                            {installed ? (
                              <span className="marketplace-badge installed">已安装</span>
                            ) : (
                              <button className="secondary-button" type="button">
                                安装
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div style={{ padding: 20, textAlign: "center" }}>
                  <EmptyState title="自定义服务器" detail={'点击"新增 MCP"添加自定义服务器配置。'} />
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
}
