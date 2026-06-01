import { spawn } from "node:child_process";
import electronPath from "electron";

const apiPort = "49393";
const child = spawn(electronPath, ["."], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NEXADESK_PORT: apiPort,
    NEXADESK_SMOKE_TEST: "1"
  },
  stdio: "inherit"
});

const timeout = setTimeout(() => {
  child.kill();
  console.error("Desktop smoke test timed out.");
  process.exit(1);
}, 45_000);

child.on("exit", (code) => {
  clearTimeout(timeout);
  if (code === 0) {
    console.log(`NexaDesk desktop smoke test passed on port ${apiPort}.`);
    process.exit(0);
  }
  process.exit(code ?? 1);
});

