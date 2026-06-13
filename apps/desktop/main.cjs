const { app, BrowserWindow, dialog, safeStorage } = require("electron");
const {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  writeFile,
  readdirSync
} = require("node:fs");
const { Menu } = require("electron");
const { ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const http = require("node:http");
const { join } = require("node:path");
const crypto = require("node:crypto");

let mainWindow;
let serverProcess;

app.commandLine.appendSwitch("allow-file-access-from-files");
app.setName("NexaDesk");
app.setAppUserModelId("com.nexadesk.desktop");
if (process.env.NEXADESK_USER_DATA_DIR) {
  app.setPath("userData", process.env.NEXADESK_USER_DATA_DIR);
}

app.whenReady().then(async () => {
  try {
    Menu.setApplicationMenu(null);
    registerDesktopIpc();

    const userData = app.getPath("userData");
    appendStartupLog(userData, "ready appPath=" + app.getAppPath());
    migrateLegacyUserData(userData);
    const dataDir = join(userData, "data");
    mkdirSync(dataDir, { recursive: true });

    const apiPort = Number(process.env.NEXADESK_PORT || process.env.AION_LITE_PORT || (await findFreePort()));
    process.env.NEXADESK_DESKTOP = "1";
    process.env.NEXADESK_APP_VERSION = app.getVersion();
    process.env.NEXADESK_HOST = "127.0.0.1";
    process.env.NEXADESK_PORT = String(apiPort);
    process.env.NEXADESK_DATA_DIR = dataDir;
    process.env.NEXADESK_SETTINGS_PATH = join(dataDir, "settings.json");
    process.env.NEXADESK_SECRETS_PATH = join(dataDir, "secrets.encrypted.json");
    process.env.NEXADESK_RUNTIME_STATE_PATH = join(dataDir, "runtime-state.json");
    process.env.NEXADESK_LOG_PATH = join(userData, "console.log");
    process.env.NEXADESK_CRASH_LOG_PATH = join(userData, "crash.log");
    process.env.NEXADESK_SAFE_STORAGE = safeStorage.isEncryptionAvailable() ? "available" : "fallback";

    const secretKey = loadProtectedSecretKey(userData);
    if (secretKey) {
      process.env.NEXADESK_SECRET_KEY = secretKey;
    }

    await startBundledServer();
    appendStartupLog(userData, "server started on " + apiPort);

    if (isSmokeModeRequested("NEXADESK_SMOKE_TEST", "AION_LITE_SMOKE_TEST")) {
      appendStartupLog(userData, "smoke mode");
      await runSmokeTest(apiPort);
      await runRendererSmokeTest(apiPort);
      appendStartupLog(userData, "smoke passed");
      await stopBundledServer();
      app.exit(0);
      return;
    }
    if (isSmokeModeRequested("NEXADESK_RETENTION_SMOKE")) {
      appendStartupLog(userData, "retention smoke mode");
      await runDesktopRetentionSmoke(apiPort, userData);
      appendStartupLog(userData, "retention smoke passed");
      await stopBundledServer();
      app.exit(0);
      return;
    }
    createMainWindow(apiPort);
  } catch (error) {
    const message = error && error.message ? error.message : String(error || "Unknown error");
    appendStartupLog(app.getPath("userData"), "startup failed: " + message);
    writeFile(process.env.NEXADESK_CRASH_LOG_PATH || join(app.getPath("userData"), "crash.log"), message + "\n", function(){});
    dialog.showErrorBox("NexaDesk 启动失败", message);
    await stopBundledServer();
    app.quit();
  }
});

app.on("before-quit", () => {
  void stopBundledServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  const apiPort = process.env.NEXADESK_PORT || process.env.AION_LITE_PORT;
  if (BrowserWindow.getAllWindows().length === 0 && apiPort) {
    createMainWindow(Number(apiPort));
  }
});

function isSmokeModeRequested(...names) {
  if (!names.some((name) => process.env[name] === "1")) {
    return false;
  }
  if (process.env.NEXADESK_INTERNAL_TEST_RUN !== "1" && process.env.NEXADESK_ALLOW_PACKAGED_SMOKE !== "1") {
    appendStartupLog(app.getPath("userData"), "ignored smoke flag without internal test marker: " + names.join(","));
    return false;
  }
  if (!app.isPackaged || process.env.NEXADESK_ALLOW_PACKAGED_SMOKE === "1") {
    return true;
  }
  appendStartupLog(app.getPath("userData"), "ignored packaged smoke flag: " + names.join(","));
  return false;
}

async function startBundledServer() {
  const appPath = app.getAppPath();
  let serverEntry = join(appPath, "apps", "server", "dist", "index.cjs");
  if (app.isPackaged) {
    serverEntry = join(process.resourcesPath, "server-dist", "index.cjs");
  }
  if (!existsSync(serverEntry)) {
    const dir = app.isPackaged ? join(process.resourcesPath, "server-dist") : join(appPath, "apps", "server", "dist");
    const files = existsSync(dir) ? readdirSync(dir) : [];
    throw new Error(
      "后端服务文件未找到。\n" +
      "查找路径: " + serverEntry + "\n" +
      "appPath: " + appPath + "\n" +
      "目录文件: " + files.join(", ")
    );
  }

  const bundledNodeExecPath = join(process.resourcesPath, "node-runtime", "node.exe");
  const nodeExecPath = process.env.NEXADESK_NODE_EXEC_PATH || (!app.isPackaged ? "node" : bundledNodeExecPath);
  if (nodeExecPath) {
    await startBundledServerProcess(nodeExecPath, serverEntry);
    return;
  }

  require(serverEntry);
}

function startBundledServerProcess(nodeExecPath, serverEntry) {
  const userData = app.getPath("userData");
  const cwd = app.isPackaged ? process.resourcesPath : app.getAppPath();
  const child = spawn(nodeExecPath, [serverEntry], {
    cwd,
    env: {
      ...process.env,
      NEXADESK_NODE_CHILD_SERVER: "1"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  serverProcess = child;
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
  });
  child.on("exit", (code, signal) => {
    appendStartupLog(userData, "server process exited code=" + code + " signal=" + signal);
    if (serverProcess === child) {
      serverProcess = undefined;
    }
  });

  return new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", (error) => {
      if (serverProcess === child) {
        serverProcess = undefined;
      }
      reject(error);
    });
  });
}

function stopBundledServer() {
  const child = serverProcess;
  if (!child || child.exitCode !== null) {
    return Promise.resolve();
  }

  serverProcess = undefined;
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 2000);
    timeout.unref();
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill();
  });
}

function createMainWindow(apiPort) {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    title: "NexaDesk",
    backgroundColor: "#eef3f0",
    icon: getIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: getPreloadPath()
    }
  });

  mainWindow.webContents.on("console-message", function(event, level, message) {
    writeFile(process.env.NEXADESK_LOG_PATH || join(app.getPath("userData"), "console.log"), "[" + level + "] " + message + "\n", {flag:"a"}, function(){});
  });

  loadRenderer(mainWindow, apiPort);
}

async function runSmokeTest(apiPort) {
  await waitForHealth(apiPort);
  console.log("NexaDesk desktop smoke test passed on port " + apiPort);
}

function waitForHealth(apiPort, deadlineMs = 10000) {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      requestHealth(apiPort)
        .then(resolve)
        .catch((error) => {
          if (Date.now() - start > deadlineMs) {
            reject(error);
            return;
          }
          setTimeout(attempt, 250);
        });
    };

    attempt();
  });
}

function requestHealth(apiPort) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      {
        host: "127.0.0.1",
        port: apiPort,
        path: "/health",
        timeout: 2000
      },
      (response) => {
        response.resume();
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
          resolve();
          return;
        }
        reject(new Error("Health check failed with " + response.statusCode));
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("Health check timed out"));
    });
    request.on("error", reject);
  });
}

async function runRendererSmokeTest(apiPort) {
  appendStartupLog(app.getPath("userData"), "renderer smoke: snapshot");
  const initialSnapshot = await requestJson(apiPort, "/api/snapshot");
  const firstSession = initialSnapshot.sessions && initialSnapshot.sessions[0];
  if (!firstSession) {
    throw new Error("Renderer smoke test failed: no session was available for session management checks.");
  }
  const sessionUpdate = await requestJson(apiPort, "/api/sessions/" + encodeURIComponent(firstSession.id), {
    method: "PATCH",
    body: JSON.stringify({ title: "Renderer smoke task", pinned: true })
  });
  if (!sessionUpdate.sessions?.[0]?.pinned || sessionUpdate.sessions[0].title !== "Renderer smoke task") {
    throw new Error("Renderer smoke test failed: session pin/rename API did not persist.");
  }
  const mcpTest = await requestJson(apiPort, "/api/mcp/test", {
    method: "POST",
    body: JSON.stringify({
      server: {
        id: "smoke-stdio",
        name: "Smoke stdio",
        description: "Desktop smoke stdio command lookup.",
        transport: "stdio",
        enabled: true,
        command: process.platform === "win32" ? "cmd" : "sh"
      },
      timeoutMs: 5000
    })
  });
  if (typeof mcpTest.ok !== "boolean" || !mcpTest.checkedAt || mcpTest.transport !== "stdio") {
    throw new Error("Renderer smoke test failed: MCP test API did not return a valid result.");
  }
  const mcpTools = await requestJson(apiPort, "/api/mcp/tools", {
    method: "POST",
    body: JSON.stringify({
      server: {
        id: "smoke-stdio",
        name: "Smoke stdio",
        description: "Desktop smoke stdio tools lookup.",
        transport: "stdio",
        enabled: true,
        command: process.platform === "win32" ? "cmd" : "sh",
        args: process.platform === "win32" ? ["/c", "echo not-json"] : ["-c", "echo not-json"]
      },
      timeoutMs: 3000
    })
  });
  if (typeof mcpTools.ok !== "boolean" || !Array.isArray(mcpTools.tools) || !mcpTools.checkedAt) {
    throw new Error("Renderer smoke test failed: MCP tools API did not return a valid result.");
  }
  const telemetryInitial = await requestJson(apiPort, "/api/runtime/telemetry");
  if (!Array.isArray(telemetryInitial.entries)) {
    throw new Error("Renderer smoke test failed: runtime telemetry API did not return entries.");
  }
  const telemetryEntry = {
    id: "desktop-smoke-telemetry",
    sessionId: firstSession.id,
    providerName: "Smoke Provider",
    model: "smoke-model",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    firstTokenMs: 42,
    durationMs: 210,
    inputTokens: 12,
    outputTokens: 24,
    totalTokens: 36,
    status: "completed",
    messagePreview: "Runtime smoke call preview"
  };
  const telemetrySaved = await requestJson(apiPort, "/api/runtime/telemetry", {
    method: "PUT",
    body: JSON.stringify({ entries: [telemetryEntry] })
  });
  if (!telemetrySaved.entries?.some((entry) => entry.id === telemetryEntry.id && entry.totalTokens === telemetryEntry.totalTokens)) {
    throw new Error("Renderer smoke test failed: runtime telemetry API did not persist submitted entries.");
  }
  const telemetryReloaded = await requestJson(apiPort, "/api/runtime/telemetry");
  if (!telemetryReloaded.entries?.some((entry) => entry.id === telemetryEntry.id)) {
    throw new Error("Renderer smoke test failed: runtime telemetry API did not reload persisted entries.");
  }
  const automationCreate = await requestJson(apiPort, "/api/automations", {
    method: "POST",
    body: JSON.stringify({
      name: "Renderer smoke automation",
      prompt: "Smoke automation should be created but not scheduled.",
      scheduleKind: "manual",
      enabled: false
    })
  });
  const smokeAutomation = automationCreate.automations?.find((job) => job.name === "Renderer smoke automation");
  if (!smokeAutomation || smokeAutomation.scheduleKind !== "manual") {
    throw new Error("Renderer smoke test failed: automation create API did not persist a manual job.");
  }
  const automationUpdate = await requestJson(apiPort, "/api/automations/" + encodeURIComponent(smokeAutomation.id), {
    method: "PATCH",
    body: JSON.stringify({ enabled: true })
  });
  if (!automationUpdate.automations?.some((job) => job.id === smokeAutomation.id && job.enabled)) {
    throw new Error("Renderer smoke test failed: automation update API did not toggle enabled state.");
  }

  appendStartupLog(app.getPath("userData"), "renderer smoke: workbench");
  const workbenchText = await renderAndReadText(apiPort);
  appendStartupLog(
    app.getPath("userData"),
    "renderer smoke workbench text: " + workbenchText.slice(0, 300).replace(/\s+/g, " ").trim()
  );
  if (!workbenchText.trim()) {
    throw new Error("Renderer smoke test failed: workbench UI text was not rendered.");
  }
  const workbenchLayout = await renderAndEvaluate(
    apiPort,
    undefined,
    "(() => { const rail = document.querySelector('.rail'); const shell = document.querySelector('.app-shell'); return { viewportWidth: window.innerWidth, documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), hasMainStage: Boolean(document.querySelector('.main-stage')), hasStartCanvas: Boolean(document.querySelector('.start-canvas')), hasAssignmentComposer: Boolean(document.querySelector('.new-task-composer')), hasAssignmentQuickRow: Boolean(document.querySelector('.assignment-quick-row')), hasRightDock: Boolean(document.querySelector('.right-dock')), hasBranchCard: Boolean(document.querySelector('.sidebar-branch-card')), hasUserBar: Boolean(document.querySelector('.sidebar-user-bar')), railDisplay: rail ? getComputedStyle(rail).display : 'missing', shellColumns: shell ? getComputedStyle(shell).gridTemplateColumns : '' }; })()"
  );
  if (!workbenchLayout.hasMainStage || !workbenchLayout.hasStartCanvas || !workbenchLayout.hasAssignmentComposer || !workbenchLayout.hasAssignmentQuickRow) {
    throw new Error("Renderer smoke test failed: WeSight-style workbench shell was not rendered.");
  }
  if (workbenchLayout.hasRightDock) {
    throw new Error("Renderer smoke test failed: new task home should not render the live context dock.");
  }
  if (workbenchLayout.railDisplay !== "none" || !workbenchLayout.hasBranchCard || !workbenchLayout.hasUserBar || String(workbenchLayout.shellColumns).split(" ").length !== 2) {
    throw new Error("Renderer smoke test failed: workbench shell did not use the WeSight-style two-column layout.");
  }
  if (workbenchLayout.documentWidth > workbenchLayout.viewportWidth + 2) {
    throw new Error(
      "Renderer smoke test failed: workbench layout overflowed horizontally at desktop width " +
        workbenchLayout.viewportWidth +
        " (document width " +
        workbenchLayout.documentWidth +
        ")."
    );
  }

  if (!app.isPackaged) {
    appendStartupLog(app.getPath("userData"), "renderer smoke: thread");
    const threadText = await renderAndReadText(apiPort, "thread");
    if (!threadText.trim()) {
      throw new Error("Renderer smoke test failed: task thread did not render any visible text.");
    }
    const threadLayout = await renderAndEvaluate(
      apiPort,
      "thread",
      "(() => ({ viewportWidth: window.innerWidth, documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), hasRightDock: Boolean(document.querySelector('.right-dock')), hasContextDrawer: Boolean(document.querySelector('.context-drawer')), hasTaskSidePanel: Boolean(document.querySelector('.task-side-panel')), hasContextTrigger: Boolean(document.querySelector('.thread-context-trigger')), hasWorkbenchComposer: Boolean(document.querySelector('.workbench-composer')), hasTaskStage: Boolean(document.querySelector('.task-workbench-stage')), hasTaskRunLayout: Boolean(document.querySelector('.task-run-layout')), hasTaskChatColumn: Boolean(document.querySelector('.task-chat-column')), hasTaskRunPanel: Boolean(document.querySelector('.task-run-panel')), hasRunPanelHead: Boolean(document.querySelector('.task-run-panel-head')), hasRunPanelTabs: Boolean(document.querySelector('.run-panel-tabs')), hasChangeInspector: Boolean(document.querySelector('.change-inspector')), hasCodePreview: Boolean(document.querySelector('.code-preview-window')) }))()"
    );
    if (threadLayout.hasRightDock || threadLayout.hasContextDrawer || threadLayout.hasTaskSidePanel) {
      throw new Error("Renderer smoke test failed: task thread should not render stacked side panels by default.");
    }
    if (!threadLayout.hasContextTrigger || !threadLayout.hasWorkbenchComposer || !threadLayout.hasTaskStage || !threadLayout.hasTaskRunLayout || !threadLayout.hasTaskChatColumn || !threadLayout.hasTaskRunPanel || !threadLayout.hasRunPanelHead || !threadLayout.hasRunPanelTabs || !threadLayout.hasChangeInspector || !threadLayout.hasCodePreview) {
      throw new Error("Renderer smoke test failed: task thread did not expose the on-demand context trigger.");
    }
    if (threadLayout.documentWidth > threadLayout.viewportWidth + 2) {
      throw new Error(
        "Renderer smoke test failed: task thread overflowed horizontally at desktop width " +
          threadLayout.viewportWidth +
          " (document width " +
          threadLayout.documentWidth +
          ")."
      );
    }
    const threadDrawerLayout = await renderAndEvaluate(
      apiPort,
      "thread",
      "(() => new Promise((resolve) => { document.querySelector('.thread-context-trigger')?.click(); setTimeout(() => resolve({ hasContextDrawer: Boolean(document.querySelector('.context-drawer')), text: document.body.innerText }), 100); }))()"
    );
    if (!threadDrawerLayout.hasContextDrawer || !threadDrawerLayout.text.trim()) {
      throw new Error("Renderer smoke test failed: context drawer did not render runtime, approval, and workspace panels.");
    }

    const workspaceInteraction = await renderAndEvaluate(
      apiPort,
      "thread",
      "(() => new Promise((resolve) => { const toggle = document.querySelector('[data-testid=\"workspace-context-toggle\"]'); if (!toggle) { resolve({ hasToggle: false }); return; } const before = toggle.getAttribute('aria-expanded'); toggle.click(); setTimeout(() => { const collapsed = toggle.getAttribute('aria-expanded'); toggle.click(); setTimeout(() => { const panel = document.querySelector('[data-testid=\"workspace-file-panel\"]'); const listButton = document.querySelector('[data-testid=\"workspace-file-panel-list\"] button'); if (listButton) { listButton.click(); } setTimeout(() => { const preview = document.querySelector('[data-testid=\"workspace-file-preview-drawer\"]'); resolve({ hasToggle: true, before, collapsed, expanded: toggle.getAttribute('aria-expanded'), hasPanel: Boolean(panel), hasPreview: Boolean(preview), previewText: preview?.textContent || '' }); }, 250); }, 120); }, 120); }))()"
    );
    if (
      !workspaceInteraction.hasToggle ||
      workspaceInteraction.before !== "true" ||
      workspaceInteraction.collapsed !== "false" ||
      workspaceInteraction.expanded !== "true" ||
      !workspaceInteraction.hasPanel ||
      !workspaceInteraction.hasPreview
    ) {
      throw new Error("Renderer smoke test failed: workspace context panel did not toggle or preview a file.");
    }
    if (!workspaceInteraction.previewText.trim()) {
      throw new Error("Renderer smoke test failed: workspace file preview did not render any text.");
    }
  }

  appendStartupLog(app.getPath("userData"), "renderer smoke: runtime");
  const runtimeText = await renderAndReadText(apiPort, "runtime");
  if (!runtimeText.trim()) {
    throw new Error("Renderer smoke test failed: runtime dashboard was not rendered as a separate view.");
  }
  const runtimeLayout = await renderAndEvaluate(
    apiPort,
    "runtime",
    "(() => ({ hasDashboardView: Boolean(document.querySelector('[data-testid=\"runtime-dashboard-view\"]')), hasDashboardShell: Boolean(document.querySelector('[data-testid=\"runtime-dashboard-shell\"]')), hasMetricGrid: Boolean(document.querySelector('[data-testid=\"runtime-dashboard-metrics\"]')), hasCharts: Boolean(document.querySelector('[data-testid=\"runtime-dashboard-charts\"] .runtime-chart-visual')), hasSideStack: Boolean(document.querySelector('[data-testid=\"runtime-side-stack\"]')), hasCallDetail: Boolean(document.querySelector('[data-testid=\"runtime-call-detail-panel\"]')), hasCallInspector: Boolean(document.querySelector('[data-testid=\"runtime-call-inspector\"]')) }))()"
  );
  if (!runtimeLayout.hasDashboardView || !runtimeLayout.hasDashboardShell || !runtimeLayout.hasMetricGrid || !runtimeLayout.hasCharts || !runtimeLayout.hasSideStack || !runtimeLayout.hasCallDetail || !runtimeLayout.hasCallInspector) {
    throw new Error("Renderer smoke test failed: runtime dashboard layout controls were not rendered.");
  }

  appendStartupLog(app.getPath("userData"), "renderer smoke: search");
  const searchText = await renderAndReadText(apiPort, "search");
  if (!searchText.trim()) {
    throw new Error("Renderer smoke test failed: search workspace was not rendered as a separate view.");
  }
  const searchLayout = await renderAndEvaluate(
    apiPort,
    "search",
    "(() => ({ hasRecordLayout: Boolean(document.querySelector('.task-record-layout')), hasRecordRow: Boolean(document.querySelector('.task-record-row')), hasDetailPanel: Boolean(document.querySelector('.task-detail-panel')) }))()"
  );
  if (!searchLayout.hasRecordLayout || !searchLayout.hasRecordRow || !searchLayout.hasDetailPanel) {
    throw new Error("Renderer smoke test failed: task record detail layout was not rendered.");
  }

  appendStartupLog(app.getPath("userData"), "renderer smoke: scheduled");
  const scheduledText = await renderAndReadText(apiPort, "scheduled");
  if (!scheduledText.trim()) {
    throw new Error("Renderer smoke test failed: scheduled task workspace was not rendered as a separate view.");
  }
  const scheduledLayout = await renderAndEvaluate(
    apiPort,
    "scheduled",
    "(() => ({ hasAutomationDashboard: Boolean(document.querySelector('.automation-dashboard')), hasPlanPanel: Boolean(document.querySelector('.automation-plan-panel')), hasDetailPanel: Boolean(document.querySelector('.automation-detail-panel')), hasRunsPanel: Boolean(document.querySelector('.automation-runs-panel')) }))()"
  );
  if (!scheduledLayout.hasAutomationDashboard || !scheduledLayout.hasPlanPanel || !scheduledLayout.hasDetailPanel || !scheduledLayout.hasRunsPanel) {
    throw new Error("Renderer smoke test failed: scheduled task plan/run layout was not rendered.");
  }

  appendStartupLog(app.getPath("userData"), "renderer smoke: skills");
  const skillsText = await renderAndReadText(apiPort, "skills");
  if (!skillsText.trim()) {
    throw new Error("Renderer smoke test failed: skills view was not rendered as a separate view.");
  }
  const skillsLayout = await renderAndEvaluate(
    apiPort,
    "skills",
    "(() => ({ hasSkillsShell: Boolean(document.querySelector('.skills-hub-shell')), hasSkillsTabs: Boolean(document.querySelector('.skills-tabs')), hasContentPanel: Boolean(document.querySelector('.skills-content-panel')) }))()"
  );
  if (!skillsLayout.hasSkillsShell || !skillsLayout.hasSkillsTabs || !skillsLayout.hasContentPanel) {
    throw new Error("Renderer smoke test failed: skills hub tab layout was not rendered.");
  }

  appendStartupLog(app.getPath("userData"), "renderer smoke: settings agent engine");
  const engineCenterState = await renderAndEvaluate(
    apiPort,
    "settings",
    "(() => new Promise((resolve) => { const tab = Array.from(document.querySelectorAll('.settings-nav-button')).find((button) => button.textContent?.includes('Agent 引擎')); tab?.click(); setTimeout(() => { const detectButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('检测本机引擎')); detectButton?.click(); setTimeout(() => { const section = document.querySelector('[data-testid=\"agent-engine-center\"]'); const detection = section?.querySelector('[data-testid^=\"engine-detection-\"]'); resolve({ hasSection: Boolean(section), text: section?.textContent || '', hasDetection: Boolean(detection) }); }, 500); }, 150); }))()"
  );
  if (!engineCenterState.hasSection || !engineCenterState.hasDetection || !engineCenterState.text.trim()) {
    throw new Error("Renderer smoke test failed: Agent Engine Center did not render detection details.");
  }

  appendStartupLog(app.getPath("userData"), "renderer smoke: mcp");
  const mcpText = await renderAndReadText(apiPort, "mcp");
  if (!mcpText.trim()) {
    throw new Error("Renderer smoke test failed: MCP workspace was not rendered as a separate view.");
  }
  const mcpLayout = await renderAndEvaluate(
    apiPort,
    "mcp",
    "(() => ({ hasConsoleLayout: Boolean(document.querySelector('.mcp-console-layout')), hasServerPanel: Boolean(document.querySelector('.mcp-server-list-panel')), hasDetailPanel: Boolean(document.querySelector('.mcp-server-detail-panel')), hasToolMarket: Boolean(document.querySelector('.mcp-tool-market-panel')) }))()"
  );
  if (!mcpLayout.hasConsoleLayout || !mcpLayout.hasServerPanel || !mcpLayout.hasDetailPanel || !mcpLayout.hasToolMarket) {
    throw new Error("Renderer smoke test failed: MCP server and tool market layout was not rendered.");
  }

  appendStartupLog(app.getPath("userData"), "renderer smoke: agents");
  const agentsText = await renderAndReadText(apiPort, "agents");
  if (!agentsText.trim()) {
    throw new Error("Renderer smoke test failed: agents view was not rendered as a separate view.");
  }
  const agentsLayout = await renderAndEvaluate(
    apiPort,
    "agents",
    "(() => ({ hasTeamLayout: Boolean(document.querySelector('.agent-team-layout')), hasTeamPanel: Boolean(document.querySelector('.agent-team-panel')), hasDetailPanel: Boolean(document.querySelector('.agent-detail-panel')), hasEnginePanel: Boolean(document.querySelector('.agent-engine-panel')) }))()"
  );
  if (!agentsLayout.hasTeamLayout || !agentsLayout.hasTeamPanel || !agentsLayout.hasDetailPanel || !agentsLayout.hasEnginePanel) {
    throw new Error("Renderer smoke test failed: agents team and engine layout was not rendered.");
  }

  appendStartupLog(app.getPath("userData"), "renderer smoke: settings");
  const settingsText = await renderAndReadText(apiPort, "settings");
  if (!settingsText.trim()) {
    throw new Error("Renderer smoke test failed: settings UI text was not rendered.");
  }

  const desktopBridgeAvailable = await renderAndEvaluate(
    apiPort,
    "settings",
    "typeof window.nexadeskDesktop?.selectDirectory === 'function'"
  );
  if (!desktopBridgeAvailable) {
    throw new Error("Renderer smoke test failed: desktop directory picker bridge was not exposed.");
  }
  appendStartupLog(app.getPath("userData"), "renderer smoke: complete");
}

async function runDesktopRetentionSmoke(apiPort, userData) {
  await waitForHealth(apiPort);

  const providerId = "openai-compatible";
  const model = "desktop-retention-model";
  const apiKey = "sk-desktop-retention-smoke";
  const settingsPath = join(userData, "data", "settings.json");
  const secretsPath = join(userData, "data", "secrets.encrypted.json");
  const expectingExisting = process.env.NEXADESK_RETENTION_EXPECT_EXISTING === "1";

  const initial = await requestJson(apiPort, "/api/settings");
  const initialProvider = initial.providers.find((provider) => provider.id === providerId);
  if (!initialProvider) {
    throw new Error("Retention smoke failed: provider not found.");
  }

  if (expectingExisting) {
    if (initial.model.activeProviderId !== providerId || initial.model.activeModel !== model) {
      throw new Error("Retention smoke failed: saved active model was not restored.");
    }
    const restoredProvider = initial.providers.find((provider) => provider.id === providerId);
    if (!restoredProvider || restoredProvider.defaultModel !== model || restoredProvider.apiKeyConfigured !== true) {
      throw new Error("Retention smoke failed: saved provider state was not restored.");
    }
  }

  const nextSettings = {
    ...initial,
    model: {
      activeProviderId: providerId,
      activeModel: model
    },
    appearance: {
      ...initial.appearance,
      fontSize: 16,
      density: "compact"
    },
    providers: initial.providers.map((provider) =>
      provider.id === providerId
        ? {
            ...provider,
            connected: true,
            baseUrl: "https://desktop-retention.example.test/v1",
            models: [model, "desktop-retention-fallback"],
            defaultModel: model
          }
        : provider
    )
  };

  await requestJson(apiPort, "/api/settings", {
    method: "PUT",
    body: JSON.stringify({
      settings: nextSettings,
      providerSecrets: [{ providerId, apiKey }]
    })
  });

  const saved = await requestJson(apiPort, "/api/settings");
  const provider = saved.providers.find((item) => item.id === providerId);
  if (saved.model.activeModel !== model || saved.appearance.fontSize !== 16 || saved.appearance.density !== "compact") {
    throw new Error("Retention smoke failed: settings were not saved.");
  }
  if (!provider || provider.apiKeyConfigured !== true || provider.defaultModel !== model) {
    throw new Error("Retention smoke failed: provider key state was not saved.");
  }
  if (!existsSync(settingsPath) || !existsSync(secretsPath)) {
    throw new Error("Retention smoke failed: desktop data files were not created.");
  }

  const secretsRaw = readFileSync(secretsPath, "utf8");
  if (secretsRaw.includes(apiKey)) {
    throw new Error("Retention smoke failed: API key leaked into the secrets file.");
  }
  const secrets = JSON.parse(secretsRaw);
  if (secrets.encrypted !== true) {
    throw new Error("Retention smoke failed: secrets file was not encrypted.");
  }

  console.log("NexaDesk desktop data retention smoke passed on port " + apiPort);
}

async function renderAndReadText(apiPort, hash) {
  return renderAndEvaluate(apiPort, hash, "document.body.innerText");
}

function requestJson(apiPort, path, init) {
  return new Promise((resolve, reject) => {
    const body = init && init.body ? init.body : undefined;
    const request = http.request(
      {
        host: "127.0.0.1",
        port: apiPort,
        path,
        method: init && init.method ? init.method : "GET",
        headers: {
          "Content-Type": "application/json",
          ...(body ? { "Content-Length": Buffer.byteLength(body) } : {})
        },
        timeout: 5000
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(path + " failed with " + response.statusCode + ": " + text));
            return;
          }
          try {
            resolve(text ? JSON.parse(text) : {});
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error(path + " timed out"));
    });
    request.on("error", reject);
    if (body) {
      request.write(body);
    }
    request.end();
  });
}

async function renderAndEvaluate(apiPort, hash, script) {
  const smokeWindow = new BrowserWindow({
    show: false,
    width: 1360,
    height: 860,
    icon: getIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: getPreloadPath()
    }
  });

  const loadHash = hash === "thread" ? undefined : hash;
  await loadRenderer(smokeWindow, apiPort, loadHash);
  await dismissPrivacyDialog(smokeWindow);
  if (hash === "thread") {
    await smokeWindow.webContents.executeJavaScript(
      "(() => { const card = Array.from(document.querySelectorAll('.session-history-card')).find((button) => /Renderer smoke task/.test(button.textContent || '')); if (!card) return false; card.click(); return true; })()"
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const readySelector = hash === "thread"
    ? ".thread-workspace"
    : hash === "settings"
      ? ".settings-modal"
      : hash
        ? ".module-workspace"
        : ".start-canvas";
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const ready = await smokeWindow.webContents.executeJavaScript(
      "Boolean(document.querySelector(" + JSON.stringify(readySelector) + ")) && !document.querySelector('.loading-screen')"
    );
    if (ready) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
  const result = await smokeWindow.webContents.executeJavaScript(script);
  smokeWindow.close();
  return result;
}

async function dismissPrivacyDialog(window) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const dismissed = await window.webContents.executeJavaScript(
      "(() => { const accept = document.querySelector('[data-testid=\"privacy-accept\"]') || Array.from(document.querySelectorAll('button')).find((button) => /同意并继续|Accept & Continue/.test(button.textContent || '')); if (!accept) return false; accept.click(); return true; })()"
    );
    if (dismissed) {
      const hiddenDeadline = Date.now() + 2000;
      while (Date.now() < hiddenDeadline) {
        const hidden = await window.webContents.executeJavaScript(
          "(() => !document.querySelector('.privacy-dialog-backdrop'))()"
        );
        if (hidden) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
}

function loadRenderer(window, apiPort, hash) {
  const indexPath = join(app.getAppPath(), "apps", "web", "dist", "index.html");
  if (!existsSync(indexPath)) {
    throw new Error("前端入口文件未找到: " + indexPath);
  }

  return window.loadFile(indexPath, {
    query: {
      apiBase: "http://127.0.0.1:" + apiPort
    },
    hash
  });
}

function getIconPath() {
  const iconPath = join(app.getAppPath(), "build-resources", "icon.ico");
  return existsSync(iconPath) ? iconPath : undefined;
}

function getPreloadPath() {
  return join(__dirname, "preload.cjs");
}

function registerDesktopIpc() {
  if (ipcMain.listenerCount("nexadesk:select-directory") > 0) {
    return;
  }

  ipcMain.handle("nexadesk:select-directory", async (_event, options) => {
    const owner = BrowserWindow.getFocusedWindow() || mainWindow || undefined;
    const result = await dialog.showOpenDialog(owner, {
      title: typeof options?.title === "string" ? options.title : "选择目录",
      defaultPath: typeof options?.defaultPath === "string" ? options.defaultPath : undefined,
      properties: ["openDirectory", "createDirectory"]
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
}

function migrateLegacyUserData(userData) {
  const legacyUserData = join(app.getPath("appData"), "Aion Lite");
  if (!existsSync(legacyUserData) || legacyUserData === userData) {
    return;
  }

  mkdirSync(userData, { recursive: true });
  for (const item of ["data", "secret-key.bin"]) {
    const source = join(legacyUserData, item);
    const target = join(userData, item);
    if (existsSync(source) && !existsSync(target)) {
      cpSync(source, target, { recursive: true, force: false });
    }
  }
}

function appendStartupLog(userData, message) {
  try {
    appendFileSync(join(userData, "startup.log"), "[" + new Date().toISOString() + "] " + message + "\n");
  } catch {
    // Startup diagnostics should never block the desktop app.
  }
}

function loadProtectedSecretKey(userData) {
  const keyPath = join(userData, "secret-key.bin");

  // safeStorage 不可用时的降级方案
  if (!safeStorage.isEncryptionAvailable()) {
    if (existsSync(keyPath)) {
      return readFileSync(keyPath, "utf8").trim();
    }
    const key = crypto.randomBytes(32).toString("base64");
    writeFileSync(keyPath, key, "utf8");
    return key;
  }

  if (existsSync(keyPath)) {
    const encrypted = readFileSync(keyPath);
    try {
      return safeStorage.decryptString(encrypted);
    } catch {
      writeFileSync(keyPath + ".invalid-" + Date.now(), encrypted);
    }
  }

  const key = crypto.randomBytes(32).toString("base64");
  const encrypted = safeStorage.encryptString(key);
  writeFileSync(keyPath, encrypted);
  return key;
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 3939;
      server.close(() => resolve(port));
    });
  });
}
