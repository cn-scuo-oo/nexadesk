import React, { useEffect, useRef, useState, useCallback } from "react";
import mermaid from "mermaid";

// Initialize mermaid with NexaDesk theme settings
mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    primaryColor: "#1f6b50",
    primaryTextColor: "#e4e5e9",
    primaryBorderColor: "#2e8b68",
    lineColor: "#4b5563",
    secondaryColor: "#1a1d27",
    tertiaryColor: "#242830",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: "14px",
  },
  flowchart: { htmlLabels: true, curve: "basis" },
  sequence: { mirrorActors: false, bottomMarginAdj: 1 },
  gantt: { titleTopMargin: 15, barHeight: 20, barGap: 4 },
});

interface MermaidDiagramProps {
  chart: string;
  className?: string;
}

/**
 * NexaDesk Mermaid Diagram Renderer
 * Renders Mermaid diagrams (flowcharts, sequence diagrams, etc.) inline.
 */
export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({
  chart,
  className = "",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const renderDiagram = async () => {
      try {
        // Generate a unique ID for this diagram
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const { svg: renderedSvg } = await mermaid.render(id, chart.trim());

        if (!cancelled) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render diagram");
          setSvg("");
        }
      }
    };

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [chart]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(chart);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [chart]);

  if (error) {
    return (
      <div className={`rounded-lg border border-danger/30 bg-danger/5 p-4 my-4 ${className}`}>
        <p className="text-sm text-danger font-medium mb-1">Diagram Error</p>
        <p className="text-xs text-secondary">{error}</p>
        <pre className="mt-2 text-xs text-secondary overflow-x-auto">{chart}</pre>
      </div>
    );
  }

  return (
    <div className={`relative group rounded-lg border border-current/10 bg-surface/50 p-4 my-4 ${className}`}>
      {/* Toolbar */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleCopy}
          className="p-1.5 rounded text-secondary hover:text-primary hover:bg-primary-muted transition-all text-xs"
          title="Copy mermaid source"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {/* Rendered diagram */}
      <div
        ref={containerRef}
        className="flex justify-center overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
};

/**
 * Helper: Detect if a code block contains Mermaid syntax
 */
export function isMermaidCode(code: string): boolean {
  const trimmed = code.trim().toLowerCase();
  const mermaidKeywords = [
    "graph ",
    "flowchart ",
    "sequenceDiagram",
    "classDiagram",
    "stateDiagram",
    "erDiagram",
    "gantt",
    "pie",
    "gitgraph",
    "journey",
    "mindmap",
    "timeline",
  ];
  return mermaidKeywords.some((kw) => trimmed.startsWith(kw));
}

export default MermaidDiagram;
