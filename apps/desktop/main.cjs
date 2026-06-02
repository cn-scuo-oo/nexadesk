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
const { createServer } = require("node:net");
const http = require("node:http");
const { join } = require("node:path");
const crypto = require("node:crypto");

let mainWindow;

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
      app.exit(0);
      return;
    }
    if (isSmokeModeRequested("NEXADESK_RETENTION_SMOKE")) {
      appendStartupLog(userData, "retention smoke mode");
      await runDesktopRetentionSmoke(apiPort, userData);
      appendStartupLog(userData, "retention smoke passed");
      app.exit(0);
      return;
    }
    createMainWindow(apiPort);
  } catch (error) {
    const message = error && error.message ? error.message : String(error || "Unknown error");
    appendStartupLog(app.getPath("userData"), "startup failed: " + message);
    writeFile(process.env.NEXADESK_CRASH_LOG_PATH || join(app.getPath("userData"), "crash.log"), message + "\n", function(){});
    dialog.showErrorBox("NexaDesk 启动失败", message);
    app.quit();
  }
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
  // Try unpacked path first, fall back to asar-compatible path
  let serverEntry = join(appPath, "apps", "server", "dist", "index.cjs");
  if (!existsSync(serverEntry)) {
    serverEntry = join(appPath, "app.asar", "apps", "server", "dist", "index.cjs");
  }
  if (!existsSync(serverEntry)) {
    const dir = join(appPath, "apps", "server", "dist");
    const files = existsSync(dir) ? readdirSync(dir) : [];
    throw new Error(
      "后端服务文件未找到。\n" +
      "查找路径: " + serverEntry + "\n" +
      "appPath: " + appPath + "\n" +
      "目录文件: " + files.join(", ")
    );
  }
  require(serverEntry);
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

  const workbenchText = await renderAndReadText(apiPort);
  if (!workbenchText.includes("NexaDesk") && !workbenchText.includes("智能体工作台")) {
    throw new Error("Renderer smoke test failed: workbench UI text was not rendered.");
  }
  if (!workbenchText.includes("开始协作") || !workbenchText.includes("分配任务或提出问题") || !workbenchText.includes("制作幻灯片")) {
    throw new Error("Renderer smoke test failed: new task home was not rendered.");
  }
  if (!workbenchText.includes("main") || !workbenchText.includes("任务记录") || !workbenchText.includes("设置")) {
    throw new Error("Renderer smoke test failed: WeSight-style sidebar run target and task history were not rendered.");
  }
  if (!workbenchText.includes("批量") || !workbenchText.includes("Renderer smoke task")) {
    throw new Error("Renderer smoke test failed: session management controls were not rendered.");
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

  const threadText = await renderAndReadText(apiPort, "thread");
  if (!threadText.includes("任务工作台") || !threadText.includes("Run Inspector") || !threadText.includes("分配任务或继续提问") || !threadText.includes("工具活动") || !threadText.includes("代码变更") || !threadText.includes("实时写入")) {
    throw new Error("Renderer smoke test failed: task thread did not render the WeSight-style session view.");
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
  if (
    !threadDrawerLayout.hasContextDrawer ||
    !threadDrawerLayout.text.includes("任务执行状态") ||
    !threadDrawerLayout.text.includes("审批队列") ||
    !threadDrawerLayout.text.includes("工作区上下文")
  ) {
    throw new Error("Renderer smoke test failed: context drawer did not render runtime, approval, and workspace panels.");
  }

  const runtimeText = await renderAndReadText(apiPort, "runtime");
  if (!runtimeText.includes("AI Runtime Dashboard") || !runtimeText.includes("调用趋势") || !runtimeText.includes("成功率") || !runtimeText.includes("平均首字")) {
    throw new Error("Renderer smoke test failed: runtime dashboard was not rendered as a separate view.");
  }
  const runtimeLayout = await renderAndEvaluate(
    apiPort,
    "runtime",
    "(() => ({ hasDashboardShell: Boolean(document.querySelector('.runtime-dashboard-shell')), hasMetricGrid: Boolean(document.querySelector('.runtime-dashboard-metrics')), hasChart: Boolean(document.querySelector('.runtime-chart-visual')), hasSideStack: Boolean(document.querySelector('.runtime-side-stack')) }))()"
  );
  if (!runtimeLayout.hasDashboardShell || !runtimeLayout.hasMetricGrid || !runtimeLayout.hasChart || !runtimeLayout.hasSideStack) {
    throw new Error("Renderer smoke test failed: runtime dashboard layout controls were not rendered.");
  }

  const searchText = await renderAndReadText(apiPort, "search");
  if (!searchText.includes("任务记录") || !searchText.includes("Task Detail") || !searchText.includes("进入任务") || !searchText.includes("最近上下文")) {
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

  const scheduledText = await renderAndReadText(apiPort, "scheduled");
  if (!scheduledText.includes("新建定时任务") || !scheduledText.includes("自动化队列")) {
    throw new Error("Renderer smoke test failed: scheduled task workspace was not rendered as a separate view.");
  }

  const skillsText = await renderAndReadText(apiPort, "skills");
  if (!skillsText.includes("已安装") || !skillsText.includes("技能市场") || !skillsText.includes("添加自定义技能") || (!skillsText.includes("启用") && !skillsText.includes("停用"))) {
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

  const mcpText = await renderAndReadText(apiPort, "mcp");
  if (!mcpText.includes("工具网关") || !mcpText.includes("MCP 工具服务器") || !mcpText.includes("新增 MCP") || !mcpText.includes("测试连接") || !mcpText.includes("刷新工具")) {
    throw new Error("Renderer smoke test failed: MCP workspace was not rendered as a separate view.");
  }

  const agentsText = await renderAndReadText(apiPort, "agents");
  if (!agentsText.includes("我的 Agent") || !agentsText.includes("新建 Agent") || !agentsText.includes("编辑")) {
    throw new Error("Renderer smoke test failed: agents view was not rendered as a separate view.");
  }

  const settingsText = await renderAndReadText(apiPort, "settings");
  if (
    !settingsText.includes("NexaDesk") ||
    !settingsText.includes("模型与运行") ||
    !settingsText.includes("助手与工具") ||
    !settingsText.includes("保存更改") ||
    !settingsText.includes("模型服务") ||
    !settingsText.includes("Agent 引擎")
  ) {
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

  await loadRenderer(smokeWindow, apiPort, hash);
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

