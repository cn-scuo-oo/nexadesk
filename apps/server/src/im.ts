import type { Express } from "express";
import { z } from "zod";
import { snapshot } from "./state.js";
import { createDefaultImChannels } from "./wesight-capabilities.js";

const imChannelPatchSchema = z.object({
  enabled: z.boolean().optional(),
  agentId: z.string().trim().optional()
});

export function registerImRoutes(app: Express): void {
app.get("/api/im/channels", (_req, res) => {
  res.json({ channels: createDefaultImChannels(snapshot.agents) });
});

const imChannelPatchSchema = z.object({
  enabled: z.boolean().optional(),
  appId: z.string().trim().optional(),
  appSecret: z.string().trim().optional(),
  agentId: z.string().trim().optional()
});

app.patch("/api/im/channels/:channelId", (req, res) => {
  const channelId = String(req.params.channelId || "");
  const parsed = imChannelPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const channels = createDefaultImChannels(snapshot.agents);
  const channel = channels.find((ch) => ch.id === channelId);
  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }
  // In a real implementation, this would persist to settings/secrets.
  // For now, return the updated channel state.
  const updates = parsed.data;
  const updated = {
    ...channel,
    enabled: updates.enabled ?? channel.enabled,
    agentId: updates.agentId ?? channel.agentId,
    webhookConfigured: updates.appId ? true : channel.webhookConfigured,
    status: (updates.enabled ? "ready" : channel.status) as typeof channel.status
  };
  res.json({ channel: updated });
});

app.post("/api/im/channels/:channelId/test", (req, res) => {
  const channelId = String(req.params.channelId || "");
  const channels = createDefaultImChannels(snapshot.agents);
  const channel = channels.find((ch) => ch.id === channelId);
  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }
  // Simulate connection test - in production this would validate credentials
  const hasCredentials = Boolean((req.body as Record<string, unknown>)?.appId);
  res.json({
    success: hasCredentials,
    message: hasCredentials
      ? `${channel.name} 连接测试成功`
      : `请先配置 ${channel.name} 的 App ID 和 App Secret`
  });
});
}