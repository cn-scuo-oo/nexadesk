import type { Express } from "express";
import { snapshot } from "./state.js";
import { loadSettings } from "./settings-store.js";
import { syncSessionAgents } from "./state.js";
import { buildSkillHub, createDefaultImChannels, buildWorkspaceArtifacts } from "./wesight-capabilities.js";
export function registerSnapshotRoutes(app: Express): void {
  app.get("/api/snapshot", async (_req, res, next) => {
    try {
      const settings = await loadSettings(snapshot.providers);
      snapshot.providers = settings.providers;
      snapshot.agents = settings.assistant.agents;
      snapshot.skills = settings.assistant.skills;
      syncSessionAgents();
      snapshot.skillHub = buildSkillHub(snapshot.skills);
      snapshot.imChannels = createDefaultImChannels(snapshot.agents);
      snapshot.artifacts = buildWorkspaceArtifacts(snapshot.messages);
      res.json(snapshot);
    } catch (error) { next(error); }
  });
}