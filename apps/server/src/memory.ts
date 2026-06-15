import type { Express } from "express";
import { randomUUID } from "node:crypto";
import { currentSettings, setCurrentSettings, saveCurrentSettings } from "./state.js";
import type { MemoryEntry } from "@nexadesk/shared";

export function registerMemoryRoutes(app: Express): void {
  app.get("/api/memory", (_req, res) => {
    res.json({
      entries: currentSettings.memoryEntries ?? [],
      summaries: currentSettings.sessionSummaries ?? [],
      settings: currentSettings.memory
    });
  });

  app.post("/api/memory/entries", async (req, res, next) => {
    try {
      const entry = req.body;
      const entries = [
        ...(currentSettings.memoryEntries ?? []),
        {
          ...entry,
          id: entry.id || `mem-${Date.now()}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
      currentSettings = { ...currentSettings, memoryEntries: entries, updatedAt: new Date().toISOString() };
      await saveCurrentSettings();
      res.json({ ok: true, entry });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/memory/entries/:entryId", async (req, res, next) => {
    try {
      const entries = (currentSettings.memoryEntries ?? []).filter((e) => e.id !== req.params.entryId);
      currentSettings = { ...currentSettings, memoryEntries: entries, updatedAt: new Date().toISOString() };
      await saveCurrentSettings();
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });
}