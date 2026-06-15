import React, { useEffect, useRef, useState, useCallback } from "react";

interface SlashCommand {
  id: string;
  label: string;
  description: string;
  category?: string;
  action: string;
}

const COMMANDS: SlashCommand[] = [
  { id: "help", label: "/help", description: "Show available commands", category: "General", action: "help" },
  { id: "clear", label: "/clear", description: "Clear conversation", category: "General", action: "clear" },
  { id: "summarize", label: "/summarize", description: "Summarize the conversation", category: "Tools", action: "summarize" },
  { id: "code", label: "/code", description: "Switch to code mode", category: "Mode", action: "code" },
  { id: "write", label: "/write", description: "Switch to writing mode", category: "Mode", action: "write" },
  { id: "search", label: "/search", description: "Search workspace files", category: "Workspace", action: "search" },
  { id: "read", label: "/read", description: "Read a file from workspace", category: "Workspace", action: "read" },
  { id: "run", label: "/run", description: "Run a shell command", category: "Tools", action: "run" },
  { id: "image", label: "/image", description: "Generate an image", category: "Tools", action: "image" },
  { id: "mcp", label: "/mcp", description: "Query MCP tools", category: "MCP", action: "mcp" },
  { id: "agent", label: "/agent", description: "Switch active agent", category: "Agent", action: "agent" },
  { id: "settings", label: "/settings", description: "Open settings panel", category: "General", action: "settings" },
  { id: "export", label: "/export", description: "Export conversation", category: "Tools", action: "export" },
];

interface SlashCommandPanelProps {
  filter: string;
  highlightIndex: number;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

export const SlashCommandPanel: React.FC<SlashCommandPanelProps> = ({
  filter,
  highlightIndex,
  onSelect,
  onClose
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  const filtered = filter
    ? COMMANDS.filter((cmd) => cmd.id.startsWith(filter.toLowerCase()))
    : COMMANDS;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (filtered.length === 0) {
    return (
      <div className="slash-panel" ref={panelRef}>
        <div className="slash-empty">No commands match "{filter}"</div>
      </div>
    );
  }

  // Group by category
  const categories = new Map<string, SlashCommand[]>();
  filtered.forEach((cmd) => {
    const cat = cmd.category || "Other";
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(cmd);
  });

  let globalIdx = 0;
  const items: { cmd: SlashCommand; idx: number }[] = [];
  for (const [, cmds] of categories) {
    for (const cmd of cmds) {
      items.push({ cmd, idx: globalIdx++ });
    }
  }

  return (
    <div className="slash-panel" ref={panelRef}>
      {Array.from(categories.entries()).map(([cat, cmds]) => (
        <div key={cat} className="slash-category">
          <div className="slash-category-label">{cat}</div>
          {cmds.map((cmd) => {
            const idx = items.find((i) => i.cmd.id === cmd.id)!.idx;
            return (
              <div
                key={cmd.id}
                className={slash-item }
                onClick={() => onSelect(cmd)}
                onMouseEnter={() => {}}
              >
                <span className="slash-command">{cmd.label}</span>
                <span className="slash-description">{cmd.description}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default SlashCommandPanel;