import type { Express } from "express";
import { loadRuntimeState, runtimeStatePath } from "./runtime-state-store.js";
import { homedir } from "node:os";
import path from "node:path";
export function registerDesktopRoutes(app: Express): void {
  app.get("/api/desktop/status", (_req, res) => {
    const home = homedir();
    res.json({
      appName: "NexaDesk", version: "0.1.0", mode: "web",
      apiBase: "http://127.0.0.1:3939",
      dataDir: path.join(home, ".nexadesk"),
      settingsPath: path.join(home, ".nexadesk", "settings.json"),
      secretsPath: path.join(home, ".nexadesk", "secrets.enc"),
      runtimeStatePath: runtimeStatePath(),
      platform: process.platform, arch: process.arch,
      nodeVersion: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      safeStorage: "available" as const, secretsEncrypted: false
    });
  });
}