import type { DesktopStatus } from "@nexadesk/shared";
import { getEnv } from "../server-utils.js";

type DesktopStatusOptions = {
  host: string;
  port: number;
  runtimeStatePath: string;
};

export function createDesktopStatus({ host, port, runtimeStatePath }: DesktopStatusOptions): DesktopStatus {
  return {
    appName: "NexaDesk",
    version: getEnv("NEXADESK_APP_VERSION", "AION_LITE_APP_VERSION") ?? "0.1.0",
    mode: getEnv("NEXADESK_DESKTOP", "AION_LITE_DESKTOP") === "1" ? "desktop" : "web",
    apiBase: `http://${host}:${port}`,
    dataDir: getEnv("NEXADESK_DATA_DIR", "AION_LITE_DATA_DIR"),
    settingsPath: getEnv("NEXADESK_SETTINGS_PATH", "AION_LITE_SETTINGS_PATH"),
    secretsPath: getEnv("NEXADESK_SECRETS_PATH", "AION_LITE_SECRETS_PATH"),
    runtimeStatePath,
    logPath: getEnv("NEXADESK_LOG_PATH", "AION_LITE_LOG_PATH"),
    crashLogPath: getEnv("NEXADESK_CRASH_LOG_PATH", "AION_LITE_CRASH_LOG_PATH"),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.versions.node,
    electronVersion: process.versions.electron,
    uptimeSeconds: Math.round(process.uptime()),
    safeStorage:
      (getEnv("NEXADESK_SAFE_STORAGE", "AION_LITE_SAFE_STORAGE") as DesktopStatus["safeStorage"]) ?? "unavailable",
    secretsEncrypted: Boolean(getEnv("NEXADESK_SECRET_KEY", "AION_LITE_SECRET_KEY"))
  };
}
