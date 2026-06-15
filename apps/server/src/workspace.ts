import type { Express } from "express";
import { snapshot } from "./state.js";
import { loadSettings } from "./settings-store.js";
import { listWorkspaceDirectory, readWorkspaceFilePreview, searchWorkspaceFiles } from "./agent-tools.js";
import { buildWorkspaceArtifacts } from "./wesight-capabilities.js";

export function registerWorkspaceRoutes(app: Express): void {
app.get("/api/workspace/artifacts", (_req, res) => {
  res.json({ artifacts: buildWorkspaceArtifacts(snapshot.messages) });
});
app.get("/api/workspace/list", async (req, res, next) => {
  try {
    const settings = await loadSettings(snapshot.providers);
    const path = typeof req.query.path === "string" ? req.query.path : ".";
    res.json(await listWorkspaceDirectory(settings.workspace, path));
  } catch (error) {
    next(error);
  }
});

app.get("/api/workspace/file", async (req, res, next) => {
  try {
    const settings = await loadSettings(snapshot.providers);
    const path = typeof req.query.path === "string" ? req.query.path : "";
    res.json(await readWorkspaceFilePreview(settings.workspace, path));
  } catch (error) {
    next(error);
  }
});

app.get("/api/workspace/search", async (req, res, next) => {
  try {
    const settings = await loadSettings(snapshot.providers);
    const query = typeof req.query.query === "string" ? req.query.query : "";
    const path = typeof req.query.path === "string" ? req.query.path : ".";
    const mode = req.query.mode === "content" ? "content" : "name";
    res.json(await searchWorkspaceFiles({ workspace: settings.workspace, query, mode, inputPath: path }));
  } catch (error) {
    next(error);
  }
});
}