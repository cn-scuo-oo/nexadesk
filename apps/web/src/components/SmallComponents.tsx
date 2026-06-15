function WindowTitleBar({ title }: { title: string }) {
  return (
    <div className="window-title-bar">
      <div />
      <span className="window-title-bar-center">{title}</span>
      <div className="window-title-bar-actions">
        <button className="window-title-bar-btn" type="button">
          -
        </button>
        <button className="window-title-bar-btn" type="button">
          []
        </button>
        <button className="window-title-bar-btn close" type="button">
          x
        </button>
      </div>
    </div>
  );
}

function PrivacyDialog({ onAccept, onReject }: { onAccept: () => void; onReject: () => void }) {
  return (
    <div className="privacy-dialog-backdrop">
      <div className="privacy-dialog">
        <h2>欢迎使用 NexaDesk</h2>
        <p>
          NexaDesk 是一款本地优先的 AI
          智能体工作台。您的对话数据默认保存在本地设备上。使用前请阅读并同意我们的服务条款和隐私政策。
        </p>
        <div className="privacy-dialog-actions">
          <button className="secondary-button" onClick={onReject} type="button">
            不同意
          </button>
          <button className="primary-button" onClick={onAccept} type="button">
            同意并继续
          </button>
        </div>
      </div>
    </div>
  );
}

function UpdateBadge({ onClick }: { onClick: () => void }) {
  return (
    <button className="update-badge" onClick={onClick} type="button">
      <span className="update-dot" />
      NexaDesk
    </button>
  );
}

function UpdateModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="privacy-dialog-backdrop" onClick={onClose}>
      <div className="privacy-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>应用更新</h2>
        <p>当前已是最新版本。</p>
        <div className="privacy-dialog-actions">
          <button className="primary-button" onClick={onClose} type="button">
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

function ActivitySidebar({ activities, onClose }: { activities: ActivityEvent[]; onClose: () => void }) {
  return (
    <aside className="activity-sidebar">
      <div className="activity-sidebar-header">
        <h4>活动流</h4>
        <button className="icon-button" onClick={onClose} type="button">
          <X size={14} />
        </button>
      </div>
      <div className="activity-list">
        {activities.map((event) => (
          <div className="activity-item" key={event.id}>
            <span className={`activity-dot ${event.level}`} />
            <span className="activity-item-title">{event.title}</span>
            <p className="activity-item-detail">{event.detail}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

function DesktopPet({ onClose }: { onClose: () => void }) {
  return (
    <div className="desktop-pet-window">
      <div className="pet-sprite">{"\u{1F916}"}</div>
    </div>
  );
}

function EngineSelectorBar({
  engines,
  activeEngineId,
  onSelect
}: {
  engines: AgentEngineSettings[];
  activeEngineId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="engine-selector-bar">
      {engines
        .filter((e) => e.enabled || e.installed)
        .map((engine) => (
          <button
            className={activeEngineId === engine.id ? "engine-chip active" : "engine-chip"}
            key={engine.id}
            onClick={() => onSelect(engine.id)}
            type="button"
          >
            <span className={`engine-chip-dot ${engine.setupStatus}`} />
            {engine.name}
          </button>
        ))}
    </div>
  );
}

const IM_PLATFORMS = [
  { id: "feishu", name: "飞书", emoji: "\u{1F426}", category: "中国" },
  { id: "dingtalk", name: "钉钉", emoji: "\u{1F48E}", category: "中国" },
  { id: "qq", name: "QQ", emoji: "\u{1F427}", category: "中国" },
  { id: "telegram", name: "Telegram", emoji: "\u{2708}\uFE0F", category: "国际" },
  { id: "discord", name: "Discord", emoji: "\u{1F3AE}", category: "国际" }
];