import React from "react";

interface DesktopStudioViewProps {
  onOpenSettings?: (tab?: string) => void;
}

export function DesktopStudioView({ onOpenSettings }: DesktopStudioViewProps) {
  return (
    <section className="workspace module-workspace studio-workspace">
      <div className="studio-layout">
        <div className="panel-block studio-canvas-panel">
          <div className="module-header">
            <p className="eyebrow">Desktop Studio</p>
            <h2>Studio Canvas</h2>
          </div>
          <div className="studio-empty-state">
            <div className="studio-empty-icon">&#9670;</div>
            <h3>Desktop Studio</h3>
            <p>Design and customize your NexaDesk workspace layout. Drag and drop panels, resize views, and save your ideal desktop configuration.</p>
            <div className="studio-feature-list">
              <div className="studio-feature-item">
                <strong>Panel Layout</strong>
                <span>Arrange agent panels, file browser, and runtime monitor</span>
              </div>
              <div className="studio-feature-item">
                <strong>Quick Actions</strong>
                <span>Create shortcuts to frequently used tools and agents</span>
              </div>
              <div className="studio-feature-item">
                <strong>Widget Library</strong>
                <span>Add system monitors, search bars, and custom widgets</span>
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => onOpenSettings?.("appearance")}>
              Configure Appearance
            </button>
          </div>
        </div>
        <aside className="panel-block studio-sidebar">
          <div className="studio-sidebar-section">
            <h4>Layout Templates</h4>
            <div className="studio-template-list">
              {["Default", "Developer", "Writer", "Minimal"].map((tpl) => (
                <div key={tpl} className="studio-template-card">
                  <div className="studio-template-preview">{tpl[0]}</div>
                  <span>{tpl}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="studio-sidebar-section">
            <h4>Widgets</h4>
            <div className="studio-widget-list">
              {[
                { id: "terminal", label: "Terminal" },
                { id: "clock", label: "Clock" },
                { id: "system", label: "System Monitor" },
                { id: "notes", label: "Quick Notes" }
              ].map((w) => (
                <div key={w.id} className="studio-widget-item">
                  <span>{w.label}</span>
                  <button className="btn btn-sm">+ Add</button>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

export default DesktopStudioView;