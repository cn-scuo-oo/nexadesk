// @ts-nocheck
// NexaDesk Desktop Automation - Agent control of mouse/keyboard
// Uses robotjs for native desktop automation
// Falls back gracefully if robotjs is not installed
import type { Express } from "express";

let robotjs: any = null;
try {
  robotjs = require("robotjs");
} catch {
  // robotjs not installed - automation will be simulated
}

interface AutomationAction {
  type: "mouseMove" | "mouseClick" | "mouseDrag" | "keyPress" | "typeText" | "scroll" | "screenshot";
  params: Record<string, any>;
}

// Action queue for sequential execution
const actionQueue: AutomationAction[] = [];
let isExecuting = false;

async function executeAction(action: AutomationAction): Promise<any> {
  if (!robotjs) {
    // Simulate without robotjs
    return { simulated: true, type: action.type, params: action.params };
  }

  try {
    switch (action.type) {
      case "mouseMove": {
        robotjs.moveMouse(action.params.x, action.params.y);
        return { ok: true, x: action.params.x, y: action.params.y };
      }
      case "mouseClick": {
        const btn = action.params.button || "left";
        robotjs.mouseClick(btn);
        return { ok: true, button: btn };
      }
      case "mouseDrag": {
        robotjs.dragMouse(action.params.x, action.params.y);
        return { ok: true, to: { x: action.params.x, y: action.params.y } };
      }
      case "keyPress": {
        robotjs.keyTap(action.params.key, action.params.modifiers || []);
        return { ok: true, key: action.params.key };
      }
      case "typeText": {
        robotjs.typeString(action.params.text);
        return { ok: true, chars: action.params.text.length };
      }
      case "scroll": {
        robotjs.scrollMouse(action.params.x, action.params.y);
        return { ok: true, x: action.params.x, y: action.params.y };
      }
      case "screenshot": {
        const screen = robotjs.screenSize();
        const img = robotjs.screen.capture(0, 0, screen.width, screen.height);
        return {
          ok: true,
          width: img.width,
          height: img.height,
          bytes: img.image.length,
          image: img.image
        };
      }
      default:
        return { error: `Unknown action type: ${action.type}` };
    }
  } catch (error: any) {
    return { error: error.message };
  }
}

async function processQueue(): Promise<void> {
  if (isExecuting || actionQueue.length === 0) return;
  isExecuting = true;

  while (actionQueue.length > 0) {
    const action = actionQueue.shift()!;
    await executeAction(action);
  }

  isExecuting = false;
}

export function registerDesktopAutomationRoutes(app: Express): void {
  // Get screen size
  app.get("/api/desktop/screen", (_req, res) => {
    if (robotjs) {
      const screen = robotjs.screenSize();
      res.json({ ok: true, width: screen.width, height: screen.height });
    } else {
      res.json({ ok: true, simulated: true, width: 1920, height: 1080 });
    }
  });

  // Get mouse position
  app.get("/api/desktop/mouse", (_req, res) => {
    if (robotjs) {
      const pos = robotjs.getMousePos();
      res.json({ ok: true, x: pos.x, y: pos.y });
    } else {
      res.json({ ok: true, simulated: true, x: 960, y: 540 });
    }
  });

  // Execute a desktop automation action
  app.post("/api/desktop/automation", async (req, res) => {
    const { type, params } = req.body;
    if (!type) { res.status(400).json({ error: "Missing action type" }); return; }

    const result = await executeAction({ type, params: params || {} });
    res.json(result);
  });

  // Queue multiple actions (macro)
  app.post("/api/desktop/automation/queue", async (req, res) => {
    const { actions } = req.body;
    if (!Array.isArray(actions) || actions.length === 0) {
      res.status(400).json({ error: "Missing or empty actions array" });
      return;
    }

    actions.forEach((a: AutomationAction) => actionQueue.push(a));
    void processQueue();
    res.json({ ok: true, queued: actions.length });
  });

  // Check robotjs availability
  app.get("/api/desktop/automation/status", (_req, res) => {
    res.json({
      ok: true,
      robotjsAvailable: !!robotjs,
      queueLength: actionQueue.length,
      executing: isExecuting
    });
  });
}
