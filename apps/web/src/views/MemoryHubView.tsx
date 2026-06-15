function MemoryHubView({
  memoryEntries,
  sessionSummaries,
  memorySettings,
  onOpenSettings,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry
}: {
  memoryEntries: MemoryEntry[];
  sessionSummaries: SessionSummary[];
  memorySettings: AppSettings["memory"];
  onOpenSettings: () => void;
  onAddEntry: (entry: MemoryEntry) => void;
  onUpdateEntry: (entryId: string, patch: Partial<MemoryEntry>) => void;
  onDeleteEntry: (entryId: string) => void;
}) {
  const [activeSection, setActiveSection] = useState<"project" | "session" | "long_term">("project");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftTags, setDraftTags] = useState("");

  const kindLabels: Record<MemoryEntryKind, string> = {
    project: "项目记忆",
    session: "会话摘要",
    long_term: "长期记忆"
  };
  const kindIcons: Record<MemoryEntryKind, typeof Brain> = {
    project: Database,
    session: FileText,
    long_term: Brain
  };

  const filteredEntries = memoryEntries.filter((e) => {
    if (e.kind !== activeSection) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.title.toLowerCase().includes(q) ||
      e.content.toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  const filteredSummaries =
    activeSection === "session"
      ? sessionSummaries.filter(
          (s) =>
            !searchQuery ||
            s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.summary.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : [];

  function handleStartEdit(entry: MemoryEntry) {
    setEditingId(entry.id);
    setDraftTitle(entry.title);
    setDraftContent(entry.content);
    setDraftTags(entry.tags.join(", "));
  }

  function handleSaveEdit() {
    if (!editingId) return;
    onUpdateEntry(editingId, {
      title: draftTitle,
      content: draftContent,
      tags: draftTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    });
    setEditingId(null);
  }

  function handleCreateEntry() {
    const now = new Date().toISOString();
    onAddEntry({
      id: `mem-${Date.now()}`,
      kind: activeSection,
      title: draftTitle || "新记忆条目",
      content: draftContent || "",
      tags: draftTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      createdAt: now,
      updatedAt: now,
      source: "手动创建"
    });
    setDraftTitle("");
    setDraftContent("");
    setDraftTags("");
  }

  function formatDuration(ms?: number) {
    if (!ms) return "—";
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins} 分钟`;
    return `${Math.round(mins / 60)} 小时`;
  }

  const Icon = kindIcons[activeSection];

  return (
    <section className="workspace module-workspace memory-workspace">
      <ModuleHeader
        eyebrow="Memory"
        title="记忆管理"
        detail="浏览和管理项目记忆、会话摘要与长期记忆。"
        actionLabel="记忆设置"
        onAction={onOpenSettings}
      />
      <div className="memory-layout">
        <section className="panel-block memory-sidebar-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Categories</p>
              <h3>记忆分类</h3>
            </div>
            <Brain size={18} />
          </div>
          <div className="memory-category-list">
            {(["project", "session", "long_term"] as const).map((kind) => {
              const KIcon = kindIcons[kind];
              const count =
                kind === "session" ? sessionSummaries.length : memoryEntries.filter((e) => e.kind === kind).length;
              return (
                <button
                  className={activeSection === kind ? "memory-category-row active" : "memory-category-row"}
                  key={kind}
                  onClick={() => {
                    setActiveSection(kind);
                    setEditingId(null);
                  }}
                  type="button"
                >
                  <KIcon size={16} />
                  <span>
                    <strong>{kindLabels[kind]}</strong>
                    <small>
                      {kind === "project"
                        ? "项目偏好、路径、技术栈"
                        : kind === "session"
                          ? "对话摘要与关键结论"
                          : "长期积累的用户画像与模式"}
                    </small>
                  </span>
                  <b>{count}</b>
                </button>
              );
            })}
          </div>

          <div className="memory-stats-card">
            <div className="memory-stat">
              <strong>{memorySettings.projectMemory ? "开" : "关"}</strong>
              <span>项目记忆</span>
            </div>
            <div className="memory-stat">
              <strong>{memorySettings.conversationMemory ? "开" : "关"}</strong>
              <span>会话记忆</span>
            </div>
            <div className="memory-stat">
              <strong>{memorySettings.longTermMemory ? "开" : "关"}</strong>
              <span>长期记忆</span>
            </div>
            <div className="memory-stat">
              <strong>{memorySettings.retentionDays}天</strong>
              <span>保留期限</span>
            </div>
          </div>
        </section>

        <section className="panel-block memory-main-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">{kindLabels[activeSection]}</p>
              <h3>{activeSection === "session" ? "会话摘要" : kindLabels[activeSection]}</h3>
            </div>
            <Icon size={18} />
          </div>

          <div className="memory-toolbar">
            <label className="memory-search-label">
              <Search size={14} />
              <input placeholder="搜索记忆..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </label>
          </div>

          {activeSection !== "session" ? (
            <div className="memory-entry-list">
              <div className="memory-create-row">
                <input placeholder="标题" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
                <textarea
                  placeholder="内容"
                  rows={2}
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                />
                <input
                  placeholder="标签（逗号分隔）"
                  value={draftTags}
                  onChange={(e) => setDraftTags(e.target.value)}
                />
                <button className="secondary-button" onClick={handleCreateEntry} type="button">
                  添加记忆
                </button>
              </div>

              {filteredEntries.length === 0 ? (
                <EmptyState title="暂无记忆" detail={`还没有${kindLabels[activeSection]}条目，在上方创建一个。`} />
              ) : (
                filteredEntries.map((entry) => (
                  <article className={entry.pinned ? "memory-entry-card pinned" : "memory-entry-card"} key={entry.id}>
                    {editingId === entry.id ? (
                      <div className="memory-edit-form">
                        <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
                        <textarea value={draftContent} onChange={(e) => setDraftContent(e.target.value)} rows={3} />
                        <input value={draftTags} onChange={(e) => setDraftTags(e.target.value)} placeholder="标签" />
                        <div className="mcp-card-actions">
                          <button className="secondary-button" onClick={handleSaveEdit} type="button">
                            保存
                          </button>
                          <button className="secondary-button" onClick={() => setEditingId(null)} type="button">
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="memory-entry-header">
                          <strong>{entry.title}</strong>
                          <div className="memory-entry-actions">
                            <button
                              className="icon-button"
                              onClick={() => onUpdateEntry(entry.id, { pinned: !entry.pinned })}
                              title={entry.pinned ? "取消置顶" : "置顶"}
                              type="button"
                            >
                              <Pin size={13} />
                            </button>
                            <button
                              className="icon-button"
                              onClick={() => handleStartEdit(entry)}
                              title="编辑"
                              type="button"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              className="icon-button"
                              onClick={() => onDeleteEntry(entry.id)}
                              title="删除"
                              type="button"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        <p className="memory-entry-content">{entry.content}</p>
                        <div className="memory-entry-footer">
                          <div className="memory-tag-row">
                            {entry.tags.map((tag) => (
                              <span className="memory-tag" key={tag}>
                                <Tag size={10} />
                                {tag}
                              </span>
                            ))}
                          </div>
                          <small>
                            {entry.source ?? "手动"} · {new Date(entry.updatedAt).toLocaleDateString("zh-CN")}
                          </small>
                        </div>
                      </>
                    )}
                  </article>
                ))
              )}
            </div>
          ) : (
            <div className="memory-entry-list">
              {filteredSummaries.length === 0 ? (
                <EmptyState title="暂无摘要" detail="会话结束后会自动生成摘要。" />
              ) : (
                filteredSummaries.map((summary) => (
                  <article className="memory-entry-card" key={summary.id}>
                    <div className="memory-entry-header">
                      <strong>{summary.title}</strong>
                      <small>{new Date(summary.createdAt).toLocaleDateString("zh-CN")}</small>
                    </div>
                    <p className="memory-entry-content">{summary.summary}</p>
                    <div className="memory-entry-footer">
                      <span className="memory-summary-meta">
                        {summary.messageCount} 条消息 · {formatDuration(summary.durationMs)}
                        {summary.agentId ? ` · ${summary.agentId}` : ""}
                      </span>
                    </div>
                  </article>
                ))
              )}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
