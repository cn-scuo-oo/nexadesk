function RuntimeDashboardView({
  activeApprovals,
  activeRuntimeModel,
  activeRuntimeProvider,
  configuredProviders,
  enabledSkills,
  runtimeStats,
  telemetry,
  runningAgents,
  totalAgents,
  onRefreshTelemetry
}: {
  activeApprovals: number;
  activeRuntimeModel: string;
  activeRuntimeProvider?: ProviderSettings;
  configuredProviders: number;
  enabledSkills: number;
  runtimeStats: RuntimeDashboardStats;
  telemetry: RuntimeTelemetryEntry[];
  runningAgents: number;
  totalAgents: number;
  onRefreshTelemetry: () => void;
}) {
  const [selectedTelemetryId, setSelectedTelemetryId] = useState<string | null>(telemetry[0]?.id ?? null);
  useEffect(() => {
    if (!selectedTelemetryId || !telemetry.some((entry) => entry.id === selectedTelemetryId)) {
      setSelectedTelemetryId(telemetry[0]?.id ?? null);
    }
  }, [selectedTelemetryId, telemetry]);
  const selectedTelemetry = telemetry.find((entry) => entry.id === selectedTelemetryId) ?? telemetry[0];

  return (
    <section className="workspace module-workspace runtime-dashboard-workspace">
      <ModuleHeader
        eyebrow="Runtime"
        title="AI Runtime Dashboard"
        detail="模型、Agent、技能、审批和执行趋势集中在独立运行监控台。"
      />
      <div className="runtime-dashboard-shell">
        <section className="runtime-dashboard-main">
          <div className="dashboard-filter-row">
            <select>
              <option>近 24 小时</option>
              <option>近 7 天</option>
              <option>近 30 天</option>
              <option>全部</option>
            </select>
            <select>
              <option>全部引擎</option>
              <option>NexaDesk Built-in</option>
              <option>Codex CLI</option>
              <option>Claude Code</option>
            </select>
            <select>
              <option>全部模型</option>
              <option>{activeRuntimeModel || "未选择"}</option>
            </select>
            <select>
              <option>全部状态</option>
              <option>已完成</option>
              <option>错误</option>
              <option>运行中</option>
            </select>
            <button className="mini-button" onClick={onRefreshTelemetry} type="button">
              刷新
            </button>
          </div>

          <div className="dashboard-kpi-grid">
            <div className="kpi-card">
              <strong>{runtimeStats.totalCalls}</strong>
              <span>总调用</span>
              <small>{runtimeStats.telemetrySourceLabel}</small>
            </div>
            <div className="kpi-card">
              <strong>{runtimeStats.successRateLabel}</strong>
              <span>成功率</span>
              <small>按模型流工具状态</small>
            </div>
            <div className="kpi-card">
              <strong>{runtimeStats.averageCompletionLabel}</strong>
              <span>平均完成</span>
              <small>P95 可能更高</small>
            </div>
            <div className="kpi-card">
              <strong>{runtimeStats.averageFirstTokenLabel}</strong>
              <span>平均首字</span>
              <small>TTFT</small>
            </div>
            <div className="kpi-card">
              <strong>{runtimeStats.outputTpsLabel}</strong>
              <span>输出 TPS</span>
              <small>token/s</small>
            </div>
            <div className="kpi-card">
              <strong>{runtimeStats.modelTpsLabel}</strong>
              <span>Model TPS</span>
              <small>总 token/s</small>
            </div>
            <div className="kpi-card">
              <strong>{formatCompactNumber(runtimeStats.totalTokens)}</strong>
              <span>Token 总量</span>
              <small>input + output</small>
            </div>
            <div className="kpi-card">
              <strong>{formatCompactNumber(runtimeStats.contextTokens)}</strong>
              <span>上下文 Token</span>
              <small>当前会话</small>
            </div>
            <div className="kpi-card">
              <strong>{activeRuntimeProvider?.connected ? "在线" : "离线"}</strong>
              <span>Provider</span>
              <small>{activeRuntimeProvider?.name ?? "未选择"}</small>
            </div>
          </div>

          <div className="dashboard-chart-grid">
            <div className="chart-card">
              <h4>调用趋势</h4>
              <div className="runtime-chart-visual" aria-label="调用趋势图">
                {runtimeStats.trendBars.map((height, index) => (
                  <span key={index} style={{ "--bar-height": `${height}%` } as CSSProperties} />
                ))}
              </div>
            </div>
            <div className="chart-card">
              <h4>Token 分布</h4>
              <div className="runtime-chart-visual" aria-label="Token 分布图">
                {runtimeStats.trendBars.map((height, index) => (
                  <span
                    key={index}
                    style={
                      {
                        "--bar-height": `${Math.min(100, height * 1.2)}%`,
                        background: "var(--theme-primary)"
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
            </div>
            <div className="chart-card">
              <h4>延迟趋势</h4>
              <div className="runtime-chart-visual" aria-label="延迟趋势图">
                {runtimeStats.trendBars.map((height, index) => (
                  <span
                    key={index}
                    style={
                      {
                        "--bar-height": `${Math.max(10, 100 - height)}%`,
                        background: "var(--theme-accent)"
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
            </div>
            <div className="chart-card">
              <h4>引擎分布</h4>
              <div style={{ display: "flex", alignItems: "end", gap: 6, height: 100, padding: "10px 0" }}>
                <div style={{ flex: 1, display: "grid", gap: 4, textAlign: "center" }}>
                  <div
                    style={{
                      height: `${Math.max(20, (runningAgents / Math.max(totalAgents, 1)) * 100)}%`,
                      background: "var(--green)",
                      borderRadius: 4
                    }}
                  />
                  <small style={{ fontSize: 10, color: "var(--muted-text)" }}>内置</small>
                </div>
                <div style={{ flex: 1, display: "grid", gap: 4, textAlign: "center" }}>
                  <div style={{ height: "40%", background: "var(--theme-accent)", borderRadius: 4 }} />
                  <small style={{ fontSize: 10, color: "var(--muted-text)" }}>CLI</small>
                </div>
                <div style={{ flex: 1, display: "grid", gap: 4, textAlign: "center" }}>
                  <div
                    style={{
                      height: "25%",
                      background: "var(--theme-primary-muted)",
                      borderRadius: 4,
                      border: "1px solid var(--green)"
                    }}
                  />
                  <small style={{ fontSize: 10, color: "var(--muted-text)" }}>Runtime</small>
                </div>
              </div>
            </div>
          </div>

          <section className="panel-block runtime-call-detail-panel">
            <div className="panel-heading compact">
              <div>
                <p className="eyebrow">Calls</p>
                <h3>调用详情</h3>
              </div>
              <b className="status ready">{telemetry.length}</b>
            </div>
            <div className="runtime-call-layout">
              <div className="runtime-call-list">
                {telemetry.length === 0 ? (
                  <EmptyState title="暂无调用明细" detail="发送消息或运行自动化后会记录模型调用、Token 和耗时。" />
                ) : (
                  telemetry.map((entry) => (
                    <button
                      className={selectedTelemetry?.id === entry.id ? "runtime-call-row active" : "runtime-call-row"}
                      key={entry.id}
                      onClick={() => setSelectedTelemetryId(entry.id)}
                      type="button"
                    >
                      <span className={`tool-call-dot ${entry.status}`} />
                      <span>
                        <strong>{entry.model}</strong>
                        <small>
                          {entry.providerName} · {formatRelativeTime(entry.startedAt)}
                        </small>
                      </span>
                      <b>{runtimeStatusLabel(entry.status)}</b>
                    </button>
                  ))
                )}
              </div>
              <div className="runtime-call-inspector">
                {selectedTelemetry ? (
                  <>
                    <div className="runtime-call-inspector-head">
                      <div>
                        <p className="eyebrow">Selected Call</p>
                        <h3>{selectedTelemetry.model}</h3>
                        <span>{selectedTelemetry.providerName}</span>
                      </div>
                      <span className={selectedTelemetry.status === "failed" ? "status muted-status" : "status ready"}>
                        {runtimeStatusLabel(selectedTelemetry.status)}
                      </span>
                    </div>
                    <div className="runtime-call-metrics">
                      <Metric label="Input Token" value={formatCompactNumber(selectedTelemetry.inputTokens)} />
                      <Metric label="Output Token" value={formatCompactNumber(selectedTelemetry.outputTokens)} />
                      <Metric label="Total Token" value={formatCompactNumber(selectedTelemetry.totalTokens)} />
                      <Metric label="TTFT" value={formatDuration(selectedTelemetry.firstTokenMs)} />
                      <Metric label="耗时" value={formatDuration(selectedTelemetry.durationMs)} />
                      <Metric label="TPS" value={formatRuntimeEntryTps(selectedTelemetry)} />
                    </div>
                    <div className="runtime-call-meta">
                      <span>
                        Started <b>{formatTime(selectedTelemetry.startedAt)}</b>
                      </span>
                      <span>
                        Completed{" "}
                        <b>{selectedTelemetry.completedAt ? formatTime(selectedTelemetry.completedAt) : "未完成"}</b>
                      </span>
                      <span>
                        Session <b>{selectedTelemetry.sessionId}</b>
                      </span>
                    </div>
                    {selectedTelemetry.messagePreview ? (
                      <p className="runtime-call-preview">{selectedTelemetry.messagePreview}</p>
                    ) : null}
                    {selectedTelemetry.error ? (
                      <p className="runtime-call-error">错误：{selectedTelemetry.error}</p>
                    ) : null}
                  </>
                ) : (
                  <EmptyState title="选择调用" detail="从左侧选择一次模型调用查看详情。" />
                )}
              </div>
            </div>
          </section>
        </section>

        <aside className="runtime-side-stack">
          <section className="panel-block runtime-health-card">
            <div className="panel-heading compact">
              <div>
                <p className="eyebrow">Model</p>
                <h3>当前模型服务</h3>
              </div>
              <Bot size={18} />
            </div>
            <div className="runtime-health-list">
              <span>
                Provider <b>{activeRuntimeProvider?.name ?? "未选择"}</b>
              </span>
              <span>
                Model <b>{activeRuntimeModel || "未选择"}</b>
              </span>
              <span>
                服务数 <b>{configuredProviders}</b>
              </span>
            </div>
          </section>

          <section className="panel-block runtime-health-card">
            <div className="panel-heading compact">
              <div>
                <p className="eyebrow">Agents</p>
                <h3>运行队列</h3>
              </div>
              <Users size={18} />
            </div>
            <div className="runtime-health-list">
              <span>
                运行助手{" "}
                <b>
                  {runningAgents}/{totalAgents}
                </b>
              </span>
              <span>
                启用技能 <b>{enabledSkills}</b>
              </span>
              <span>
                待审批 <b>{activeApprovals}</b>
              </span>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
