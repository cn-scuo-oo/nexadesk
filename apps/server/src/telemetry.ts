import type { Express } from "express";
import { z } from "zod";
import { runtimeTelemetry, setRuntimeTelemetry, persistRuntimeState } from "./state.js";

export function registerTelemetryRoutes(app: Express): void {
  app.get("/api/runtime/telemetry", (_req, res) => { res.json({ entries: runtimeTelemetry }); });
  app.put("/api/runtime/telemetry", async (req, res, next) => {
    try {
      const { entries } = req.body;
      if (Array.isArray(entries)) { setRuntimeTelemetry(entries.slice(0, 100)); }
      await persistRuntimeState();
      res.json({ entries: runtimeTelemetry });
    } catch (error) { next(error); }
  });
}