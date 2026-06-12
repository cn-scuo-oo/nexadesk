import cors from "cors";
import express from "express";
import { createDefaultSettings, createDemoSnapshot, type AppSettings, type RuntimeTelemetryEntry } from "@nexadesk/shared";
import { addEventClient, publishActivity } from "./events.js";
import { createLocalOnlyCorsOptions } from "./cors-policy.js";
import { registerAppRoutes } from "./routes/app-routes.js";
import { registerAutomationRoutes } from "./routes/automation-routes.js";
import { registerConnectivityRoutes } from "./routes/connectivity-routes.js";
import { registerMaintenanceRoutes } from "./routes/maintenance-routes.js";
import { registerSessionRoutes } from "./routes/session-routes.js";
import { registerWorkspaceRoutes } from "./routes/workspace-routes.js";
import {
  loadRuntimeTelemetry,
  loadRuntimeState,
  runtimeStatePath,
  saveRuntimeState,
  type PendingToolApprovalRecord
} from "./runtime-state-store.js";
import { getProviderApiKey, loadSettings, recoverSettings, saveSettings } from "./settings-store.js";
import { createDesktopStatus } from "./services/desktop-status-service.js";
import { normalizeAutomationJob, runAutomationJob, type AutomationServiceContext } from "./services/automation-service.js";
import { syncSessionAgents } from "./services/snapshot-service.js";
import { getEnv } from "./server-utils.js";
import {
  bootstrapServerRuntime,
  startActivityHeartbeat,
  startAutomationScheduler
} from "./server-lifecycle.js";

const host = getEnv("NEXADESK_HOST", "AION_LITE_HOST") ?? "127.0.0.1";
const port = Number(getEnv("NEXADESK_PORT", "AION_LITE_PORT") ?? 3939);
const snapshot = createDemoSnapshot();
const runtimeTelemetry: RuntimeTelemetryEntry[] = [];
const runningAutomationJobs = new Set<string>();
const pendingToolApprovals = new Map<string, Omit<PendingToolApprovalRecord, "approvalId">>();
const app = express();

let currentSettings: AppSettings = createDefaultSettings(snapshot.providers);

app.use(cors(createLocalOnlyCorsOptions()));
app.use(express.json({ limit: "1mb" }));

const syncCurrentSessionAgents = () => syncSessionAgents(snapshot);

async function saveCurrentSettings(): Promise<void> {
  await saveSettings(currentSettings, snapshot.providers);
}

async function persistRuntimeState(): Promise<void> {
  try {
    await saveRuntimeState(snapshot, pendingToolApprovalRecords(), runtimeTelemetry);
  } catch (error) {
    console.error("Failed to persist runtime state", error);
  }
}

function pendingToolApprovalRecords(): PendingToolApprovalRecord[] {
  return Array.from(pendingToolApprovals.entries()).map(([approvalId, pending]) => ({
    approvalId,
    ...pending
  }));
}

const automationContext: AutomationServiceContext = {
  snapshot,
  runtimeTelemetry,
  pendingToolApprovals,
  loadSettings,
  persistRuntimeState,
  publishActivity,
  syncSessionAgents: syncCurrentSessionAgents,
  runningAutomationJobs
};

registerAppRoutes(app, {
  snapshot,
  runtimeTelemetry,
  loadSettings,
  persistRuntimeState,
  addEventClient,
  createDesktopStatus: () => createDesktopStatus({ host, port, runtimeStatePath })
});
registerConnectivityRoutes(app, {
  snapshot,
  loadSettings,
  saveSettings,
  recoverSettings,
  getProviderApiKey,
  persistRuntimeState,
  publishActivity,
  syncSessionAgents: syncCurrentSessionAgents
});
registerWorkspaceRoutes(app, { snapshot, loadSettings });
registerMaintenanceRoutes(app, {
  getCurrentSettings: () => currentSettings,
  setCurrentSettings: async (nextSettings) => {
    currentSettings = nextSettings;
    await saveCurrentSettings();
  },
  publishActivity
});
registerSessionRoutes(app, automationContext);
registerAutomationRoutes(app, automationContext);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: error instanceof Error ? error.message : "Unexpected server error" });
});

void bootstrapServerRuntime({
  snapshot,
  pendingToolApprovals,
  setRuntimeTelemetry: (entries) => {
    runtimeTelemetry.splice(0, runtimeTelemetry.length, ...entries);
  },
  loadRuntimeState,
  loadRuntimeTelemetry,
  normalizeAutomationJob,
  runningAutomationJobs,
  runAutomationJob: (job, trigger) => runAutomationJob(automationContext, job, trigger)
})
  .then(() => {
    app.listen(port, host, () => {
      console.log(`NexaDesk API listening on http://${host}:${port}`);
    });
    startAutomationScheduler({
      snapshot,
      runningAutomationJobs,
      runAutomationJob: (job, trigger) => runAutomationJob(automationContext, job, trigger)
    });
    startActivityHeartbeat({ snapshot, publishActivity });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
