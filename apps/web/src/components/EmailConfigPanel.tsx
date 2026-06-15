const EMAIL_PROVIDERS = [
  { id: "gmail", name: "Gmail", imap: "imap.gmail.com:993", smtp: "smtp.gmail.com:587" },
  { id: "outlook", name: "Outlook", imap: "outlook.office365.com:993", smtp: "smtp.office365.com:587" },
  { id: "163", name: "163 邮箱", imap: "imap.163.com:993", smtp: "smtp.163.com:465" },
  { id: "qq", name: "QQ 邮箱", imap: "imap.qq.com:993", smtp: "smtp.qq.com:587" }
];

function EmailConfigPanel() {
  const [selectedProvider, setSelectedProvider] = useState("gmail");
  const provider = EMAIL_PROVIDERS.find((p) => p.id === selectedProvider) ?? EMAIL_PROVIDERS[0];
  return (
    <section className="panel-block settings-section">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Email</p>
          <h3>邮件集成</h3>
        </div>
        <Mail size={18} />
      </div>
      <div className="settings-form">
        <div className="email-provider-grid">
          {EMAIL_PROVIDERS.map((p) => (
            <button
              className={selectedProvider === p.id ? "email-provider-chip active" : "email-provider-chip"}
              key={p.id}
              onClick={() => setSelectedProvider(p.id)}
              type="button"
            >
              <strong>{p.name}</strong>
            </button>
          ))}
        </div>
        <label className="field-label">
          <span>IMAP 服务器</span>
          <input defaultValue={provider.imap} />
        </label>
        <label className="field-label">
          <span>SMTP 服务器</span>
          <input defaultValue={provider.smtp} />
        </label>
        <label className="field-label">
          <span>邮箱地址</span>
          <input placeholder="your@email.com" />
        </label>
        <label className="field-label">
          <span>密码</span>
          <input type="password" placeholder="输入密码" />
        </label>
        <div className="mcp-card-actions">
          <button className="secondary-button" type="button">
            测试连接
          </button>
          <button className="primary-button" type="button">
            保存
          </button>
        </div>
      </div>
    </section>
  );