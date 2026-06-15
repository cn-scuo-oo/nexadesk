import React, { useState, useCallback } from "react";

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

interface ArtifactPreviewPanelProps {
  artifact: Artifact;
  onClose: () => void;
}

export const ArtifactPreviewPanel: React.FC<ArtifactPreviewPanelProps> = ({ artifact, onClose }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(artifact.summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [artifact.summary]);

  const kindIcon: Record<ArtifactKind, string> = {
    diff: "diff",
    report: "report",
    command: "command",
    file: "file"
  };

  const kindColor: Record<ArtifactKind, string> = {
    diff: "#6366f1",
    report: "#2e8b68",
    command: "#f59e0b",
    file: "#3b82f6"
  };

  return (
    <div className="artifact-preview-overlay" onClick={onClose}>
      <div className="artifact-preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="artifact-preview-header">
          <div className="artifact-preview-title-row">
            <span className="artifact-kind-badge" style={{ 
              backgroundColor: kindColor[artifact.kind] + "20",
              color: kindColor[artifact.kind],
              borderColor: kindColor[artifact.kind]
            }}>
              {kindIcon[artifact.kind]} {artifact.kind}
            </span>
            <h3>{artifact.title}</h3>
          </div>
          <div className="artifact-preview-actions">
            <button className="btn btn-sm" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy"}
            </button>
            <button className="btn btn-sm btn-ghost" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="artifact-preview-body">
          {artifact.kind === "diff" ? (
            <pre className="artifact-diff-view">
              <code>{formatDiffContent(artifact.summary)}</code>
            </pre>
          ) : artifact.kind === "command" ? (
            <div className="artifact-command-view">
              <div className="artifact-command-header">Command Output</div>
              <pre className="artifact-command-output">
                <code>{artifact.summary}</code>
              </pre>
            </div>
          ) : artifact.kind === "report" ? (
            <div className="artifact-report-view">
              <div className="artifact-report-content">{artifact.summary}</div>
            </div>
          ) : (
            <pre className="artifact-file-view">
              <code>{artifact.summary}</code>
            </pre>
          )}
        </div>

        <div className="artifact-preview-footer">
          <span className="artifact-meta">Session: {artifact.sessionId.slice(0, 12)}...</span>
          <span className="artifact-meta">Created: {new Date(artifact.createdAt).toLocaleString()}</span>
          <span className="artifact-meta">Status: {artifact.status}</span>
        </div>
      </div>
    </div>
  );
};

function formatDiffContent(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (line.startsWith("+")) return `+ ${line.slice(1)}`;
      if (line.startsWith("-")) return `- ${line.slice(1)}`;
      return `  ${line}`;
    })
    .join("\n");
}

export default ArtifactPreviewPanel;
