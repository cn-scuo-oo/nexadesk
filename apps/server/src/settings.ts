import type { Express } from "express";
import { snapshot, currentSettings, setCurrentSettings, syncSessionAgents, persistRuntimeState } from "./state.js";
import { loadSettings, saveSettings, recoverSettings } from "./settings-store.js";
import { publishActivity } from "./events.js";
import type { SaveSettingsRequest, RecoverSettingsRequest } from "@nexadesk/shared";

export function registerSettingsRoutes(app: Express): void {
app.get("/api/settings", async (_req, res, next) => {
  try {
    res.json(await loadSettings(snapshot.providers));
  } catch (error) {
    next(error);
  }
});
app.put("/api/settings", async (req, res, next) => {
  try {
    const body = req.body as SaveSettingsRequest;
    if (!body?.settings || !Array.isArray(body.settings.providers)) {
      res.status(400).json({ error: "Invalid settings payload" });
      return;
    }

    const settings = await saveSettings(body.settings, snapshot.providers, body.providerSecrets);
    currentSettings = settings;
    snapshot.providers = settings.providers;
    snapshot.agents = settings.assistant.agents;
    snapshot.skills = settings.assistant.skills;
    syncSessionAgents();
    const activity = publishActivity({
      level: "info",
      title: "Settings saved",
      detail: "Model, interface, workspace, permission, and app settings were persisted locally."
    });
    snapshot.activity.unshift(activity);
    await persistRuntimeState();
    res.json({ settings, activity });
  } catch (error) {
    next(error);
  }
});

app.post("/api/settings/recover", async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as RecoverSettingsRequest;
    const result = await recoverSettings(snapshot.providers, { resetSecrets: Boolean(body.resetSecrets) });
    snapshot.providers = result.settings.providers;
    snapshot.agents = result.settings.assistant.agents;
    snapshot.skills = result.settings.assistant.skills;
    syncSessionAgents();
    const activity = publishActivity({
      level: result.warning ? "warning" : "info",
      title: "设置已恢复",
      detail: result.warning ?? `已重建默认设置，备份文件 ${result.backupPaths.length} 个。`
    });
    snapshot.activity.unshift(activity);
    await persistRuntimeState();
    res.json({ ...result, activity });
  } catch (error) {
    next(error);
  }
});
}