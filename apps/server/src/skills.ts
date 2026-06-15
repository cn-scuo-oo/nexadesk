import type { Express } from "express";
import { snapshot, currentSettings } from "./state.js";
import { loadSettings } from "./settings-store.js";
import { buildSkillHub } from "./wesight-capabilities.js";

export function registerSkillsRoutes(app: Express): void {
  app.get("/api/skills", async (_req, res, next) => {
    try {
      const settings = await loadSettings(snapshot.providers);
      snapshot.skills = settings.assistant.skills;
      res.json(snapshot.skills);
    } catch (error) { next(error); }
  });
  app.get("/api/skills/hub", async (_req, res, next) => {
    try {
      res.json({ listings: buildSkillHub(snapshot.skills) });
    } catch (error) { next(error); }
  });
  app.post("/api/skills/scan", async (_req, res, next) => {
    try {
      res.json({ listings: buildSkillHub(snapshot.skills) });
    } catch (error) { next(error); }
  });
}