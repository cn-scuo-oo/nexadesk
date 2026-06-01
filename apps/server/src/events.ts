import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { ActivityEvent } from "@nexadesk/shared";

const clients = new Set<Response>();

export function addEventClient(res: Response) {
  clients.add(res);
  res.write(": connected\n\n");

  res.on("close", () => {
    clients.delete(res);
  });
}

export function publishActivity(input: Omit<ActivityEvent, "id" | "createdAt">) {
  const event: ActivityEvent = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...input
  };

  const payload = `event: activity\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }

  return event;
}


