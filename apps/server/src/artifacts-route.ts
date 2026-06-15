// @ts-nocheck
// NexaDesk Artifacts Route
// Workspace artifacts: code diff, command output, report preview
import type { Express } from "express";
import { snapshot } from "./state.js";
import { buildWorkspaceArtifacts } from "./wesight-capabilities.js";

export function registerArtifactsRoutes(app: Express): void {
  // List all artifacts
  app.get("/api/artifacts", (_req, res) => {
    const artifacts = buildWorkspaceArtifacts(snapshot.messages);
    res.json(artifacts);
  });

  // Get single artifact by ID
  app.get("/api/artifacts/:id", (req, res) => {
    const artifacts = buildWorkspaceArtifacts(snapshot.messages);
    const artifact = artifacts.find((a) => a.id === req.params.id);
    if (!artifact) { res.status(404).json({ error: "Artifact not found" }); return; }
    res.json(artifact);
  });
}
