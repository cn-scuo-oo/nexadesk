// @ts-nocheck
// NexaDesk IM Bridge - Webhook integration for Feishu, DingTalk, etc.
// Handles incoming messages and relay to agent engine, outgoing responses.
import type { Express } from "express";
import { randomUUID } from "node:crypto";

interface ImPlatformConfig {
  kind: string;
  name: string;
  webhookUrl?: string;
  webhookSecret?: string;
  apiBase?: string;
  botToken?: string;
}

interface ImIncomingMessage {
  platform: string;
  channelId: string;
  userId: string;
  userName: string;
  content: string;
  messageId: string;
  timestamp: string;
}

interface ImOutgoingMessage {
  platform: string;
  channelId: string;
  content: string;
  messageType: "text" | "markdown" | "image";
}

// Registered IM platform handlers
const platformHandlers: Record<string, ImPlatformConfig> = {};

export function registerImPlatform(kind: string, config: ImPlatformConfig): void {
  platformHandlers[kind] = config;
}

// Feishu webhook handler
async function handleFeishuWebhook(body: any): Promise<ImIncomingMessage | null> {
  try {
    // Feishu webhook event format:
    // { header: { event_id, event_type, ... }, event: { sender, message, ... } }
    if (body?.header?.event_type === "im.message.receive_v1") {
      const event = body.event;
      return {
        platform: "feishu",
        channelId: event.message.chat_id,
        userId: event.sender.sender_id.user_id,
        userName: event.sender.sender_id.user_id,
        content: event.message.content ? JSON.parse(event.message.content).text : "",
        messageId: event.message.message_id,
        timestamp: new Date().toISOString()
      };
    }
  } catch {}
  return null;
}

// DingTalk webhook handler
async function handleDingTalkWebhook(body: any): Promise<ImIncomingMessage | null> {
  try {
    // DingTalk webhook event format
    if (body?.msgtype === "text") {
      return {
        platform: "dingtalk",
        channelId: body.conversationId || "",
        userId: body.senderId || "",
        userName: body.senderNick || "",
        content: body.text?.content || "",
        messageId: body.messageId || randomUUID(),
        timestamp: new Date().toISOString()
      };
    }
  } catch {}
  return null;
}

async function sendImMessage(platform: string, channelId: string, content: string, messageType: "text" | "markdown" = "markdown"): Promise<boolean> {
  const config = platformHandlers[platform];
  if (!config?.webhookUrl) return false;

  try {
    const payload = platform === "feishu"
      ? { msg_type: "interactive", receive_id: channelId, content: JSON.stringify({ zh_cn: { title: "NexaDesk", content } }) }
      : platform === "dingtalk"
        ? { msgtype: "markdown", markdown: { title: "NexaDesk", text: content } }
        : { text: content };

    const { default: fetch } = await import("node-fetch");
    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function processImMessage(msg: ImIncomingMessage): Promise<string> {
  // Route message to agent engine
  // For now, return a simple echo
  return [/] 宸叉敹鍒版秷鎭細;
}

export function registerImBridgeRoutes(app: Express): void {
  // Feishu webhook endpoint
  app.post("/api/im/feishu/webhook", async (req, res) => {
    const msg = await handleFeishuWebhook(req.body);
    if (msg) {
      const reply = await processImMessage(msg);
      await sendImMessage("feishu", msg.channelId, reply);
      // Feishu requires challenge response for URL verification
      if (req.body?.challenge) {
        res.json({ challenge: req.body.challenge });
        return;
      }
      res.json({ code: 0, message: "ok" });
    } else {
      res.status(400).json({ error: "Invalid webhook payload" });
    }
  });

  // DingTalk webhook endpoint
  app.post("/api/im/dingtalk/webhook", async (req, res) => {
    const msg = await handleDingTalkWebhook(req.body);
    if (msg) {
      const reply = await processImMessage(msg);
      await sendImMessage("dingtalk", msg.channelId, reply);
      res.json({ errcode: 0, errmsg: "ok" });
    } else {
      res.status(400).json({ error: "Invalid webhook payload" });
    }
  });

  // Generic IM send endpoint (for agent to send messages to IM platforms)
  app.post("/api/im/send", async (req, res) => {
    const { platform, channelId, content, messageType } = req.body;
    if (!platform || !channelId || !content) {
      res.status(400).json({ error: "Missing required fields: platform, channelId, content" });
      return;
    }
    const ok = await sendImMessage(platform, channelId, content, messageType || "markdown");
    res.json({ ok });
  });

  // Health check for IM bridge
  app.get("/api/im/bridge/health", (_req, res) => {
    const platforms = Object.entries(platformHandlers).map(([kind, cfg]) => ({
      kind,
      name: cfg.name,
      configured: !!cfg.webhookUrl
    }));
    res.json({ ok: true, platforms });
  });
}