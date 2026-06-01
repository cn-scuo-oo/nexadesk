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
const { createServer } = require("node:net");
const http = require("node:http");
const { join } = require("node:path");
const crypto = require("node:crypto");

let mainWindow;

app.commandLine.appendSwitch("allow-file-access-from-files");
app.setName("NexaDesk");
app.setAppUserModelId("com.nexadesk.desktop");

app.whenReady().then(async () => {
  try {
    Menu.setApplicationMenu(null);

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

    if (process.env.NEXADESK_SMOKE_TEST === "1" || process.env.AION_LITE_SMOKE_TEST === "1") {
      appendStartupLog(userData, "smoke mode");
      await runSmokeTest(apiPort);
      await runRendererSmokeTest(apiPort);
      appendStartupLog(userData, "smoke passed");
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
      nodeIntegration: false
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
  const workbenchText = await renderAndReadText(apiPort);
  if (!workbenchText.includes("NexaDesk") && !workbenchText.includes("智能体工作台")) {
    throw new Error("Renderer smoke test failed: workbench UI text was not rendered.");
  }

  const settingsText = await renderAndReadText(apiPort, "settings");
  if (!settingsText.includes("应用设置") || !settingsText.includes("模型服务")) {
    throw new Error("Renderer smoke test failed: settings UI text was not rendered.");
  }
}

async function renderAndReadText(apiPort, hash) {
  const smokeWindow = new BrowserWindow({
    show: false,
    width: 1360,
    height: 860,
    icon: getIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await loadRenderer(smokeWindow, apiPort, hash);
  await new Promise((resolve) => setTimeout(resolve, 800));
  const text = await smokeWindow.webContents.executeJavaScript("document.body.innerText");
  smokeWindow.close();
  return text;
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

