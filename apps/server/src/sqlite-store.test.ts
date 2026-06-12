import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initDatabase, getRecentMessages, upsertMessage } from "./sqlite-store";

const dataDir = mkdtempSync(join(tmpdir(), "nexadesk-sqlite-store-"));
initDatabase(dataDir);

describe("sqlite store message ordering", () => {
  it("returns the most recent messages in chronological order", () => {
    const sessionId = "session-ordering";
    const messages = Array.from({ length: 6 }, (_, index) => ({
      id: `msg-${index + 1}`,
      sessionId,
      role: "user" as const,
      author: "Tester",
      content: `message-${index + 1}`,
      createdAt: `2026-01-01T00:00:0${index + 1}.000Z`
    }));

    for (const message of messages) {
      upsertMessage(message);
    }

    const recent = getRecentMessages(3);
    expect(recent.map((message) => message.content)).toEqual(["message-4", "message-5", "message-6"]);
  });
});
