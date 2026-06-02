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
  stdio: "inherit"
});

const timeout = setTimeout(() => {
  child.kill();
  console.error("Desktop smoke test timed out.");
  void finish(1);
}, 45_000);

child.on("exit", (code) => {
  clearTimeout(timeout);
  if (code === 0) {
    console.log(`NexaDesk desktop smoke test passed on port ${apiPort}.`);
    void finish(0);
    return;
  }
  void finish(code ?? 1);
});

async function finish(code) {
  await rm(userDataDir, { recursive: true, force: true });
  process.exit(code);
}
