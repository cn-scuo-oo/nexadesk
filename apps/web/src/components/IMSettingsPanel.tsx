function IMSettingsPanel({
  channels
}: {
  channels?: import("./lib/types").ImAgentChannel[];
}) {
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Build platform entries: real channels when available, fallback to static list
  const channelMap = new Map((channels ?? []).map((ch) => [ch.kind, ch]));
  const platforms = IM_PLATFORMS.map((p) => {
    const ch = channelMap.get(p.id as import("./lib/types").ImChannelKind);
    return {
      ...p,
      channel: ch ?? null,
      statusText: ch
        ? ch.status === "ready" ? "已连接" : ch.status === "needs_setup" ? "待配置" : "已禁用"
        : p.category === "筹备中" ? "筹备中" : "未连接",
      statusClass: ch
        ? ch.status === "ready" ? "connected" : ch.status === "needs_setup" ? "pending" : "offline"
        : p.category === "筹备中" ? "pending" : "offline"
    };
  });

  const selected = platforms.find((p) => p.id === selectedPlatform);

  const handleTestConnection = async () => {
    if (!selected?.channel) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/im/channels/${selected.channel.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId })
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ success: false, message: "连接测试失败，请检查网络" });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!selected?.channel) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/im/channels/${selected.channel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true, appId, appSecret })
      });
      if (res.ok) {
        setTestResult({ success: true, message: "配置已保存" });
      }
    } catch {
      setTestResult({ success: false, message: "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel-block settings-section">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">IM Integration</p>
          <h3>即时通讯集成</h3>
        </div>
        <Mail size={18} />
      </div>
      <div className="settings-form">
        <div className="im-platform-grid">
          {platforms.map((platform) => (
            <article
              className={selectedPlatform === platform.id ? `im-platform-card ${platform.statusClass}` : `im-platform-card ${platform.statusClass}`}
              key={platform.id}
              onClick={() => setSelectedPlatform(platform.id)}
            >
              <span className="im-platform-icon">{platform.emoji}</span>
              <strong>{platform.name}</strong>
              <small>{platform.statusText} · 点击配置</small>
              {platform.channel?.webhookConfigured && <small className="im-webhook-badge">Webhook ✓</small>}
            </article>
          ))}
        </div>
        {selected && (
          <div
            style={{
              padding: 12,
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              background: "var(--surface-soft)"
            }}
          >
            <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: "0 0 8px" }}>
              {selected.name} 配置
            </h4>
            {selected.channel && (
              <div style={{ marginBottom: 8, fontSize: 12, color: "var(--muted)" }}>
                <p>状态: {selected.statusText}</p>
                {selected.channel.agentId && <p>绑定 Agent: {selected.channel.agentId}</p>}
                {selected.channel.lastEventAt && (
                  <p>最近事件: {new Date(selected.channel.lastEventAt).toLocaleString("zh-CN")}</p>
                )}
              </div>
            )}
            <label className="field-label">
              <span>App ID</span>
              <input placeholder="输入 App ID" value={appId} onChange={(e) => setAppId(e.target.value)} />
            </label>
            <label className="field-label">
              <span>App Secret</span>
              <input type="password" placeholder="输入 App Secret" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} />
            </label>
            {testResult && (
              <div style={{ fontSize: 12, color: testResult.success ? "#166534" : "#b91c1c", marginTop: 4, padding: "4px 8px", borderRadius: 6, background: testResult.success ? "#dcfce7" : "#fde8e8" }}>
                {testResult.message}
              </div>
            )}
            <div className="mcp-card-actions" style={{ marginTop: 8 }}>
              <button className="secondary-button" type="button" onClick={handleTestConnection} disabled={testing}>
                {testing ? "测试中..." : "测试连接"}
              </button>
              <button className="primary-button" type="button" onClick={handleSave} disabled={saving}>
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}