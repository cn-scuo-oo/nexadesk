import { spawn } from "node:child_process";

function npmScript(scriptName) {
  if (process.platform === "win32") {
    return ["cmd.exe", ["/d", "/s", "/c", `npm run ${scriptName}`]];
  }
  return ["npm", ["run", scriptName]];
}

const processes = [
  ["server", ...npmScript("dev:server")],
  ["web", ...npmScript("dev:web")]
];

const children = processes.map(([name, command, args]) => {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: "pipe"
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(code);
    }
  });

  return child;
});

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
