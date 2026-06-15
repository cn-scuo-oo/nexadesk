// @ts-nocheck
// NexaDesk Server - New Entry Point
// Original 82KB monolith split into 17 domain modules.
// Each module exports a register*Routes(app) function.

import cors from "cors";
import express from "express";
import { host, port, snapshot, persistRuntimeState, syncSessionAgents } from "./state.js";
import { registerHealthRoutes } from "./health.js";
import { registerSnapshotRoutes } from "./snapshot-route.js";
import { registerProvidersRoutes } from "./providers.js";
import { registerAgentsRoutes } from "./agents.js";
import { registerSessionsRoutes } from "./sessions.js";
import { registerSettingsRoutes } from "./settings.js";
import { registerWorkspaceRoutes } from "./workspace.js";
import { registerMcpRoutes } from "./mcp.js";
import { registerApprovalsRoutes } from "./approvals.js";
import { registerAutomationsRoutes } from "./automations.js";
import { registerImRoutes } from "./im.js";
import { registerMemoryRoutes } from "./memory.js";
import { registerTelemetryRoutes } from "./telemetry.js";
import { registerSkillsRoutes } from "./skills.js";
import { registerEventsRoutes } from "./events-route.js";
import { registerEncryptionRoutes } from "./encryption.js";
import { registerDesktopRoutes } from "./desktop.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

registerHealthRoutes(app);
registerSnapshotRoutes(app);
registerProvidersRoutes(app);
registerAgentsRoutes(app);
registerSessionsRoutes(app);
registerSettingsRoutes(app);
registerWorkspaceRoutes(app);
registerMcpRoutes(app);
registerApprovalsRoutes(app);
registerAutomationsRoutes(app);
registerImRoutes(app);
registerMemoryRoutes(app);
registerTelemetryRoutes(app);
registerSkillsRoutes(app);
registerEventsRoutes(app);
registerEncryptionRoutes(app);
registerDesktopRoutes(app);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: error instanceof Error ? error.message : "Unexpected server error" });
});

setInterval(() => {
  snapshot.activity.unshift({
    id: "hb-" + Date.now(),
    level: "info",
    title: "Heartbeat",
    detail: "Server is alive",
    createdAt: new Date().toISOString()
  });
  if (snapshot.activity.length > 200) { snapshot.activity.length = 200; }
}, 30_000).unref();

async function startServer() {
  try {
    await persistRuntimeState();
    syncSessionAgents();
    console.log("[nexadesk] Server starting on http://" + host + ":" + port);
    app.listen(port, host, () => {
      console.log("[nexadesk] Server ready at http://" + host + ":" + port);
    });
  } catch (error) {
    console.error("[nexadesk] Failed to start server:", error);
    process.exit(1);
  }
}

void startServer();

export { app };