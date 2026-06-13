import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const executable = resolve("release", "win-unpacked", process.platform === "win32" ? "NexaDesk.exe" : "NexaDesk");
const userDataDir = await mkdtemp(join(tmpdir(), "nexadesk-packaged-smoke-"));
const apiPort = String(await findFreePort());
let smokePassed = false;

if (!existsSync(executable)) {
  console.error(`Packaged smoke test could not find ${executable}. Run npm run dist:win first.`);
  process.exit(1);
}

try {
  await runPackagedSmoke();
  smokePassed = true;
  console.log(`NexaDesk packaged smoke test passed using ${executable}.`);
} finally {
  if (smokePassed) {
    await removeUserDataDir();
  } else {
    printSmokeDiagnostics();
  }
}

function runPackagedSmoke() {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, [], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NEXADESK_PORT: apiPort,
        NEXADESK_INTERNAL_TEST_RUN: "1",
        NEXADESK_ALLOW_PACKAGED_SMOKE: "1",
        NEXADESK_USER_DATA_DIR: userDataDir,
        NEXADESK_SMOKE_TEST: "1"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let output = "";
    let settled = false;
    const settle = (callback) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });

    const timeout = setTimeout(() => {
      void stopPackagedApp(child).finally(() => {
        settle(() => reject(new Error(`Packaged smoke test timed out on port ${apiPort}.\n${output}`)));
      });
    }, 300_000);

    child.on("error", (error) => {
      settle(() => reject(error));
    });

    child.on("exit", (code) => {
      settle(() => {
        if (code === 0) {
          process.stdout.write(output);
          resolvePromise();
          return;
        }
        reject(new Error(`Packaged smoke test failed with code ${code}.\n${output}`));
      });
    });
  });
}

function stopPackagedApp(child) {
  if (!child.pid || child.exitCode !== null) {
    return Promise.resolve();
  }
  if (process.platform !== "win32") {
    child.kill("SIGKILL");
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
    const timeout = setTimeout(resolve, 5000);
    killer.once("error", () => {
      clearTimeout(timeout);
      resolve();
    });
    killer.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (!port) {
          reject(new Error("Packaged smoke could not reserve a free port."));
          return;
        }
        resolve(port);
      });
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
        console.warn(`Packaged smoke could not remove temporary user data: ${error.message}`);
      }
    }
  }
}

function printSmokeDiagnostics() {
  console.warn(`Packaged smoke kept temporary user data at ${userDataDir}`);
  for (const fileName of ["startup.log", "crash.log", "console.log"]) {
    const filePath = join(userDataDir, fileName);
    if (!existsSync(filePath)) {
      continue;
    }
    console.warn(`\n--- ${fileName} ---`);
    console.warn(readFileSync(filePath, "utf8"));
  }
}
