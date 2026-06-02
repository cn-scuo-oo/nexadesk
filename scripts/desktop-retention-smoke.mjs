import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import electronPath from "electron";

const userDataDir = await mkdtemp(join(tmpdir(), "nexadesk-desktop-retention-"));

try {
  await runDesktopPass({ port: "49394", expectExisting: false });
  await runDesktopPass({ port: "49395", expectExisting: true });
  console.log("NexaDesk desktop retention smoke test passed.");
} finally {
  await removeUserDataDir();
}

function runDesktopPass({ port, expectExisting }) {
  return new Promise((resolve, reject) => {
    const child = spawn(electronPath, ["."], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NEXADESK_PORT: port,
        NEXADESK_INTERNAL_TEST_RUN: "1",
        NEXADESK_USER_DATA_DIR: userDataDir,
        NEXADESK_RETENTION_SMOKE: "1",
        ...(expectExisting ? { NEXADESK_RETENTION_EXPECT_EXISTING: "1" } : {})
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Desktop retention smoke timed out on port ${port}.\n${output}`));
    }, 90_000);

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        process.stdout.write(output);
        resolve();
        return;
      }
      reject(new Error(`Desktop retention smoke failed on port ${port} with code ${code}.\n${output}`));
    });
  });
}

async function removeUserDataDir() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(userDataDir, { recursive: true, force: true });
      return;
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (attempt === 4) {
        console.warn(`Desktop retention smoke could not remove temporary user data: ${error.message}`);
      }
    }
  }
}
