// @ts-nocheck
import {
  Brain,
  CircleDot,
  Pencil,
  Pin,
  Search,
  Settings,
  Sparkles,
  Terminal,
  Trash2,
  Users,
  Workflow,
  Zap
} from "lucide-react";
import type { AgentProfile, AppSettings, AppSnapshot, SessionSummary } from "@nexadesk/shared";
import type { AppView } from "../lib/app-shell";
import type { ComponentType } from "react";

export interface SidebarProps {
  activeView: AppView;
  activeSession: SessionSummary | null;
  activeAgent: AgentProfile | null;
  activeRuntimeModel: string;
  enabledSkills: number;
  teamAgents: AgentProfile[];
  snapshot: AppSnapshot;
  settings: AppSettings;
  settingsOpen: boolean;
  mode: "live" | "demo";
  sidebarCollapsed: boolean;
  orderedSessions: SessionSummary[];
  sessionMessageCounts: Map<string, number>;
  sessionBatchMode: boolean;
  selectedSessionIds: Set<string>;
  renamingSessionId: string | null;
  renameSessionDraft: string;
  runtimeSettings: any;
  UpdateBadge: ComponentType<{ onClick: () => void }>;
  onOpenView: (view: AppView) => void;
  onOpenSettings: (tab: string) => void;
  onOpenSession: (sessionId: string) => void;
  onToggleSessionPin: (session: SessionSummary) => void;
  onDeleteSession: (sessionId: string) => void;
  onStartRenameSession: (session: SessionSummary) => void;
  onConfirmRenameSession: (sessionId: string) => void;
  onToggleSessionSelection: (sessionId: string) => void;
  onDeleteSelectedSessions: () => void;
  onToggleBatchMode: () => void;
  onSetRenameSessionDraft: (value: string) => void;
  onSetRenamingSessionId: (value: string | null) => void;
  onSetUpdateModalOpen: (value: boolean) => void;
  onToggleSidebarCollapsed: () => void;
  formatRelativeTime: (iso: string) => string;
}

export function Sidebar({
  activeView,
  activeSession,
  activeAgent,
  activeRuntimeModel,
  enabledSkills,
  teamAgents,
  snapshot,
  settings,
  settingsOpen,
  mode,
  sidebarCollapsed,
  orderedSessions,
  sessionMessageCounts,
  sessionBatchMode,
  selectedSessionIds,
  renamingSessionId,
  renameSessionDraft,
  runtimeSettings,
  UpdateBadge,
  onOpenView,
  onOpenSettings,
  onOpenSession,
  onToggleSessionPin,
  onDeleteSession,
  onStartRenameSession,
  onConfirmRenameSession,
  onToggleSessionSelection,
  onDeleteSelectedSessions,
  onToggleBatchMode,
  onSetRenameSessionDraft,
  onSetRenamingSessionId,
  onSetUpdateModalOpen,
  onToggleSidebarCollapsed,
  formatRelativeTime
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="product-title">
        <p className="eyebrow">智能体工作台</p>
        <h1>NexaDesk</h1>
        <span>AI Agentic Workspace</span>
      </div>

      <section className="sidebar-section">
        <div className="section-heading">
          <span>导航</span>
        </div>
        <nav className="nav-list workspace-nav-list" aria-label="Workspace sections">
          <button
            className={
              activeView === "new" || activeView === "thread" ? "nav-item nav-button active" : "nav-item nav-button"
            }
            onClick={() => onOpenView("new")}
            type="button"
          >
            <Sparkles size={17} />
            <span>
              <strong>新建任务</strong>
              <small>开始一次协作</small>
            </span>
          </button>
          <button
            className={activeView === "search" ? "nav-item nav-button active" : "nav-item nav-button"}
            onClick={() => onOpenView("search")}
            type="button"
          >
            <Search size={17} />
            <span>
              <strong>搜索任务</strong>
              <small>会话与文件</small>
            </span>
          </button>
          <button
            className={activeView === "scheduled" ? "nav-item nav-button active" : "nav-item nav-button"}
            onClick={() => onOpenView("scheduled")}
            type="button"
          >
            <CircleDot size={17} />
            <span>
              <strong>定时任务</strong>
            </span>
          </button>
          <button
            className={activeView === "runtime" ? "nav-item nav-button active" : "nav-item nav-button"}
            onClick={() => onOpenView("runtime")}
            type="button"
          >
            <Zap size={17} />
            <span>
              <strong>运行监控</strong>
            </span>
          </button>
          <button
            className={activeView === "skills" ? "nav-item nav-button active" : "nav-item nav-button"}
            onClick={() => onOpenView("skills")}
            type="button"
          >
            <Workflow size={17} />
            <span>
              <strong>技能</strong>
            </span>
            <b>{enabledSkills}</b>
          </button>
          <button
            className={activeView === "mcp" ? "nav-item nav-button active" : "nav-item nav-button"}
            onClick={() => onOpenView("mcp")}
            type="button"
          >
            <Terminal size={17} />
            <span>
              <strong>MCP</strong>
            </span>
          </button>
          <button
            className={activeView === "agents" ? "nav-item nav-button active" : "nav-item nav-button"}
            onClick={() => onOpenView("agents")}
            type="button"
          >
            <Users size={17} />
            <span>
              <strong>我的 Agent</strong>
              <small>助手与团队</small>
            </span>
            <b>{snapshot.agents.filter((agent) => agent.enabled).length}</b>
          </button>
          <button
            className={activeView === "memory" ? "nav-item nav-button active" : "nav-item nav-button"}
            onClick={() => onOpenView("memory")}
            type="button"
          >
            <Brain size={17} />
            <span>
              <strong>记忆</strong>
              <small>项目 · 会话 · 长期</small>
            </span>
            <b>{(settings.memoryEntries ?? []).length}</b>
          </button>
        </nav>
      </section>

      <button className="sidebar-branch-card" onClick={() => onOpenSettings("assistants")} type="button">
        <span className="branch-icon">main</span>
        <span>
          <strong>{activeAgent?.name ?? "Cowork 助手"}</strong>
          <small>
            {teamAgents.length} 个助手 · {activeRuntimeModel || "未选择模型"}
          </small>
        </span>
      </button>

      <section className="sidebar-section history-section grow">
        <div className="section-heading">
          <span>任务记录</span>
          <div className="section-heading-actions">
            <button className="mini-button" onClick={() => onOpenView("search")} type="button">
              搜索
            </button>
            <button className="mini-button" onClick={onToggleBatchMode} type="button">
              {sessionBatchMode ? "取消" : "批量"}
            </button>
          </div>
        </div>
        {sessionBatchMode ? (
          <div className="session-batch-bar">
            <span>已选 {selectedSessionIds.size}</span>
            <button
              className="mini-button danger-mini-button"
              disabled={selectedSessionIds.size === 0}
              onClick={onDeleteSelectedSessions}
              type="button"
            >
              删除
            </button>
          </div>
        ) : null}
        <div className="session-history-list">
          {orderedSessions.map((session) => (
            <button
              className={
                session.id === activeSession?.id && activeView === "thread"
                  ? "session-history-card active"
                  : "session-history-card"
              }
              key={session.id}
              onClick={() =>
                sessionBatchMode ? onToggleSessionSelection(session.id) : onOpenSession(session.id)
              }
              type="button"
            >
              {sessionBatchMode ? (
                <input
                  aria-label={`选择 ${session.title}`}
                  checked={selectedSessionIds.has(session.id)}
                  onChange={() => onToggleSessionSelection(session.id)}
                  onClick={(event) => event.stopPropagation()}
                  type="checkbox"
                />
              ) : (
                <span className={session.pinned ? "history-status-dot pinned" : "history-status-dot"} />
              )}
              {renamingSessionId === session.id ? (
                <span className="session-rename-inline" onClick={(event) => event.stopPropagation()}>
                  <input
                    value={renameSessionDraft}
                    onChange={(event) => onSetRenameSessionDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        onConfirmRenameSession(session.id);
                      }
                      if (event.key === "Escape") {
                        onSetRenamingSessionId(null);
                        onSetRenameSessionDraft("");
                      }
                    }}
                    autoFocus
                  />
                  <button
                    className="mini-button"
                    onClick={() => onConfirmRenameSession(session.id)}
                    type="button"
                  >
                    保存
                  </button>
                </span>
              ) : (
                <span>
                  <strong>{session.title}</strong>
                  <small>
                    {formatRelativeTime(session.updatedAt)} · {sessionMessageCounts.get(session.id) ?? 0} 条消息 ·{" "}
                    {runtimeSettings.workspace.defaultWorkspace || session.workspace}
                  </small>
                </span>
              )}
              <span className="session-card-actions" onClick={(event) => event.stopPropagation()}>
                <button
                  className={session.pinned ? "icon-button active-icon-button" : "icon-button"}
                  onClick={() => onToggleSessionPin(session)}
                  type="button"
                  aria-label="置顶任务"
                >
                  <Pin size={13} />
                </button>
                <button
                  className="icon-button"
                  onClick={() => onStartRenameSession(session)}
                  type="button"
                  aria-label="重命名任务"
                >
                  <Pencil size={13} />
                </button>
                <button
                  className="icon-button danger-icon-button"
                  onClick={() => onDeleteSession(session.id)}
                  type="button"
                  aria-label="删除任务"
                >
                  <Trash2 size={13} />
                </button>
              </span>
            </button>
          ))}
          <article className="session-history-card muted-history-card">
            <span className="history-status-dot muted" />
            <span>
              <strong>桌面发布 QA</strong>
              <small>安装包、保留数据、私有分发</small>
            </span>
            <b>计划</b>
          </article>
        </div>
      </section>

      <div className="sidebar-user-bar">
        <UpdateBadge onClick={() => onSetUpdateModalOpen(true)} />
        <button className="sidebar-user-button" onClick={() => onOpenSettings("desktop")} type="button">
          <span className="sidebar-user-avatar">N</span>
          <span>
            <strong>NexaDesk</strong>
            <small>{mode === "live" ? "本地 API 已连接" : "演示模式"}</small>
          </span>
        </button>
        <button
          className={settingsOpen ? "sidebar-settings-button active" : "sidebar-settings-button"}
          onClick={() => onOpenSettings("providers")}
          type="button"
        >
          <Settings size={16} />
          设置
        </button>
      </div>
    </aside>
  );
}
