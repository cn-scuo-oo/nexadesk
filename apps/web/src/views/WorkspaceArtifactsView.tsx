import React, { useState, useEffect, useCallback } from "react";
import { ArtifactPreviewPanel } from "../components/ArtifactPreviewPanel";

type ArtifactKind = "diff" | "report" | "command" | "file";

interface Artifact {
  id: string;
  sessionId: string;
  title: string;
  kind: ArtifactKind;
  summary: string;
  createdAt: string;
  status: "ready" | "pending" | "failed";
}

export function WorkspaceArtifactsView() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [kindFilter, setKindFilter] = useState<ArtifactKind | "all">("all");
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    fetchArtifacts();
  }, []);

  const fetchArtifacts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/artifacts");
      const data = await res.json();
      setArtifacts(data);
    } catch {
      setArtifacts([]);
    }
    setLoading(false);
  }, []);

  const filteredArtifacts = artifacts.filter((a) => {
    if (kindFilter !== "all" && a.kind !== kindFilter) return false;
    if (searchText && !a.title.toLowerCase().includes(searchText.toLowerCase()) &&
        !a.summary.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  const kindBadge = (kind: ArtifactKind) => {
    const colors: Record<ArtifactKind, { bg: string; text: string }> = {
      diff: { bg: "#6366f120", text: "#6366f1" },
      report: { bg: "#2e8b6820", text: "#2e8b68" },
      command: { bg: "#f59e0b20", text: "#f59e0b" },
      file: { bg: "#3b82f620", text: "#3b82f6" }
    };
    const c = colors[kind];
    return <span className="artifact-kind-chip" style={{ backgroundColor: c.bg, color: c.text }}>{kind}</span>;
  };

  const kindCount = (kind: ArtifactKind | "all") =>
    kind === "all" ? artifacts.length : artifacts.filter((a) => a.kind === kind).length;

  return (
    <section className="workspace module-workspace artifacts-workspace">
      <div className="artifacts-layout">
        <aside className="panel-block artifacts-sidebar">
          <div className="module-header">
            <p className="eyebrow">Workspace</p>
            <h2>Artifacts</h2>
          </div>
          <div className="artifact-filter-list">
            {(["all", "diff", "report", "command", "file"] as const).map((kind) => (
              <div
                key={kind}
                className={`artifact-filter-item ${kindFilter === kind ? "active" : ""}`}
                onClick={() => setKindFilter(kind)}
              >
                <span>{kind === "all" ? "All" : kind}</span>
                <span className="artifact-count-badge">{kindCount(kind)}</span>
              </div>
            ))}
          </div>
          <div className="artifact-filter-search">
            <input
              type="text"
              placeholder="Search artifacts..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="input"
            />
          </div>
          <button className="btn btn-primary btn-sm" onClick={fetchArtifacts} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </aside>

        <section className="panel-block artifacts-main-panel">
          {loading ? (
            <div className="artifact-loading">Loading artifacts...</div>
          ) : filteredArtifacts.length === 0 ? (
            <div className="artifact-empty-state">
              <div className="artifact-empty-icon">&#9733;</div>
              <h3>No artifacts yet</h3>
              <p>Artifacts appear here when agents produce code diffs, reports, or command output.</p>
            </div>
          ) : (
            <div className="artifact-card-list">
              {filteredArtifacts.map((artifact) => (
                <article
                  key={artifact.id}
                  className="artifact-card"
                  onClick={() => setSelectedArtifact(artifact)}
                >
                  <div className="artifact-card-header">
                    {kindBadge(artifact.kind)}
                    <span className="artifact-status-dot" data-status={artifact.status} />
                  </div>
                  <h4 className="artifact-card-title">{artifact.title}</h4>
                  <p className="artifact-card-summary">{artifact.summary.slice(0, 160)}...</p>
                  <div className="artifact-card-footer">
                    <span className="artifact-date">{new Date(artifact.createdAt).toLocaleDateString()}</span>
                    <span className="artifact-session">{artifact.sessionId.slice(0, 8)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {selectedArtifact && (
          <ArtifactPreviewPanel
            artifact={selectedArtifact}
            onClose={() => setSelectedArtifact(null)}
          />
        )}
      </div>
    </section>
  );
}

export default WorkspaceArtifactsView;
