// @ts-nocheck
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

const platformHandlers: Record<string, ImPlatformConfig> = {};

export function registerImPlatform(kind: string, config: ImPlatformConfig): void {
  platformHandlers[kind] = config;
}

async function handleFeishuWebhook(body: any): Promise<ImIncomingMessage | null> {
  try {
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

async function handleDingTalkWebhook(body: any): Promise<ImIncomingMessage | null> {
  try {
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
  return "[" + msg.platform + "/" + msg.userName + "] Message received: " + msg.content;
}

export function registerImBridgeRoutes(app: Express): void {
  app.post("/api/im/feishu/webhook", async (req, res) => {
    const msg = await handleFeishuWebhook(req.body);
    if (msg) {
      const reply = await processImMessage(msg);
      await sendImMessage("feishu", msg.channelId, reply);
      if (req.body?.challenge) {
        res.json({ challenge: req.body.challenge });
        return;
      }
      res.json({ code: 0, message: "ok" });
    } else {
      res.status(400).json({ error: "Invalid webhook payload" });
    }
  });

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

  app.post("/api/im/send", async (req, res) => {
    const { platform, channelId, content, messageType } = req.body;
    if (!platform || !channelId || !content) {
      res.status(400).json({ error: "Missing required fields: platform, channelId, content" });
      return;
    }
    const ok = await sendImMessage(platform, channelId, content, messageType || "markdown");
    res.json({ ok });
  });

  app.get("/api/im/bridge/health", (_req, res) => {
    const platforms = Object.entries(platformHandlers).map(([kind, cfg]) => ({
      kind,
      name: cfg.name,
      configured: !!cfg.webhookUrl
    }));
    res.json({ ok: true, platforms });
  });
}
