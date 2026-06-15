import type { Express } from "express";
import { addEventClient } from "./events.js";
export function registerEventsRoutes(app: Express): void {
  app.get("/api/events", (req, res) => {
    req.socket.setTimeout(0);
    res.writeHead(200, {
      "Cache-Control": "no-cache", Connection: "keep-alive",
      "Content-Type": "text/event-stream"
    });
    addEventClient(res);
  });
}