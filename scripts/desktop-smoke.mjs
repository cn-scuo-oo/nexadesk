import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import electronPath from "electron";

const apiPort = "49393";
const userDataDir = await mkdtemp(join(tmpdir(), "nexadesk-desktop-smoke-"));

const child = spawn(electronPath, ["."], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NEXADESK_PORT: apiPort,
    NEXADESK_INTERNAL_TEST_RUN: "1",
    NEXADESK_NODE_EXEC_PATH: process.execPath,
    NEXADESK_USER_DATA_DIR: userDataDir,
    NEXADESK_SMOKE_TEST: "1"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
let finished = false;
let forcedExitCode = null;
child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
});
child.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stderr.write(text);
});

const timeout = setTimeout(() => {
  forcedExitCode = 1;
  void (async () => {
    await stopElectron();
    console.error(`Desktop smoke test timed out.\n${output}`);
    await finish(1);
  })();
}, 120_000);

child.on("exit", (code) => {
  clearTimeout(timeout);
  if (forcedExitCode !== null) {
    void finish(forcedExitCode);
    return;
  }
  if (code === 0) {
    console.log(`NexaDesk desktop smoke test passed on port ${apiPort}.`);
    void finish(0);
    return;
  }
  void finish(code ?? 1);
});

const healthCheckPort = apiPort;
const healthCheckUrl = `http://127.0.0.1:${healthCheckPort}/health`;
const pollInterval = 1_000;
const pollTimeout = 90_000;
const pollStart = Date.now();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollHealthCheck() {
  while (!finished && Date.now() - pollStart < pollTimeout) {
    try {
      const res = await fetch(healthCheckUrl);
      if (res.ok) {
        forcedExitCode = 0;
        console.log(`NexaDesk desktop smoke test passed on port ${healthCheckPort}.`);
        await stopElectron();
        await finish(0);
        return;
      }
    } catch {
      // Server is not ready yet.
    }

    await delay(pollInterval);
  }

  if (!finished) {
    forcedExitCode = 1;
    await stopElectron();
    console.error(`Desktop smoke test failed: health endpoint did not respond at ${healthCheckUrl}.\n${output}`);
    await finish(1);
  }
}

function stopElectron() {
  if (child.exitCode !== null) {
    return Promise.resolve();
  }

  const exitPromise = new Promise((resolve) => {
    const exitTimeout = setTimeout(resolve, 5000);
    exitTimeout.unref();
    child.once("exit", () => {
      clearTimeout(exitTimeout);
      resolve();
    });
  });

  if (process.platform === "win32" && child.pid) {
    return new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true
      });
      killer.on("exit", () => {
        void exitPromise.then(resolve);
      });
      killer.on("error", () => {
        child.kill();
        void exitPromise.then(resolve);
      });
    });
  }

  child.kill();
  return exitPromise;
}

async function finish(exitCode) {
  if (finished) {
    return;
  }

  finished = true;
  clearTimeout(timeout);
  await removeUserDataDir();
  process.exitCode = exitCode;
}

async function removeUserDataDir() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) {
      await delay(300);
    }
    try {
      await rm(userDataDir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 4) {
        console.warn(`Failed to remove smoke test user data directory: ${error instanceof Error ? error.message : error}`);
      }
    }
  }
}

void pollHealthCheck();
