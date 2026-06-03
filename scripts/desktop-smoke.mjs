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
    NEXADESK_USER_DATA_DIR: userDataDir,
    NEXADESK_SMOKE_TEST: "1"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
let finished = false;
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
  child.kill();
  console.error(`Desktop smoke test timed out.\n${output}`);
  void finish(1);
}, 120_000);

child.on("exit", (code) => {
  clearTimeout(timeout);
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

async function pollHealthCheck() {
  while (!finished && Date.now() - pollStart < pollTimeout) {
    try {
      const res = await fetch(healthCheckUrl);
      if (res.ok) {
        console.log(`NexaDesk desktop smoke test passed on port ${healthCheckPort}.`);
        child.kill();
        void finish(0);
        return;
      }
    } catch {
      // server not ready yet
  