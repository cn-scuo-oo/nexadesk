import React, { useState, useEffect, useCallback } from "react";

interface DesktopAutomationPanelProps {
  onClose: () => void;
}

type MouseButton = "left" | "right" | "middle";

export const DesktopAutomationPanel: React.FC<DesktopAutomationPanelProps> = ({ onClose }) => {
  const [status, setStatus] = useState<{ robotjsAvailable: boolean; queueLength: number } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [screenSize, setScreenSize] = useState({ width: 1920, height: 1080 });
  const [result, setResult] = useState<string | null>(null);
  const [moveX, setMoveX] = useState("960");
  const [moveY, setMoveY] = useState("540");
  const [typeText, setTypeText] = useState("");
  const [keyPress, setKeyPress] = useState("");
  const [simulated, setSimulated] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/desktop/automation/status");
      const data = await res.json();
      setStatus(data);
      setSimulated(!data.robotjsAvailable);
    } catch { setStatus(null); }
  }, []);

  const fetchMousePos = useCallback(async () => {
    try {
      const res = await fetch("/api/desktop/mouse");
      const data = await res.json();
      setMousePos({ x: data.x, y: data.y });
    } catch { /* ignore */ }
  }, []);

  const fetchScreenSize = useCallback(async () => {
    try {
      const res = await fetch("/api/desktop/screen");
      const data = await res.json();
      setScreenSize({ width: data.width, height: data.height });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchScreenSize();
  }, []);

  const execAction = useCallback(async (type: string, params: Record<string, any>) => {
    setResult(null);
    try {
      const res = await fetch("/api/desktop/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, params })
      });
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
      if (type === "mouseMove" || type === "mouseClick") fetchMousePos();
      fetchStatus();
    } catch (e: any) {
      setResult(`Error: ${e.message}`);
    }
  }, []);

  return (
    <div className="desktop-automation-panel">
      <div className="automation-header">
        <h3>Desktop Automation {simulated ? "(Simulated)" : ""}</h3>
        {status && <span className="automation-status-badge">Queue: {status.queueLength}</span>}
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      </div>

      <div className="automation-grid">
        <fieldset className="automation-fieldset">
          <legend>Mouse Position</legend>
          <p className="automation-coords">X: {mousePos.x} Y: {mousePos.y}</p>
          <div className="automation-input-row">
            <input type="number" value={moveX} onChange={(e) => setMoveX(e.target.value)} className="input input-sm" placeholder="X" />
            <input type="number" value={moveY} onChange={(e) => setMoveY(e.target.value)} className="input input-sm" placeholder="Y" />
            <button className="btn btn-sm" onClick={() => execAction("mouseMove", { x: Number(moveX), y: Number(moveY) })}>Move</button>
          </div>
          <div className="automation-button-row">
            {(["left", "right", "middle"] as MouseButton[]).map((btn) => (
              <button key={btn} className="btn btn-sm" onClick={() => execAction("mouseClick", { button: btn })}>
                {btn} Click
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="automation-fieldset">
          <legend>Keyboard</legend>
          <div className="automation-input-row">
            <input type="text" value={typeText} onChange={(e) => setTypeText(e.target.value)} className="input" placeholder="Text to type..." />
            <button className="btn btn-sm" onClick={() => { if (typeText) execAction("typeText", { text: typeText }); }}>Type</button>
          </div>
          <div className="automation-input-row">
            <input type="text" value={keyPress} onChange={(e) => setKeyPress(e.target.value)} className="input input-sm" placeholder="Key (enter, escape...)" />
            <button className="btn btn-sm" onClick={() => { if (keyPress) execAction("keyPress", { key: keyPress }); }}>Press</button>
          </div>
          <div className="automation-button-row">
            {["enter", "escape", "tab", "backspace", "delete"].map((key) => (
              <button key={key} className="btn btn-sm" onClick={() => execAction("keyPress", { key })}>
                {key}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="automation-fieldset">
          <legend>Screen</legend>
          <p className="automation-coords">Size: {screenSize.width} × {screenSize.height}</p>
          <button className="btn btn-sm" onClick={fetchMousePos}>Refresh Mouse</button>
          <button className="btn btn-sm" onClick={fetchScreenSize}>Refresh Screen</button>
          <button className="btn btn-sm" onClick={fetchStatus}>Refresh Status</button>
        </fieldset>
      </div>

      {result && (
        <div className="automation-result">
          <pre>{result}</pre>
        </div>
      )}
    </div>
  );
};

export default DesktopAutomationPanel;
