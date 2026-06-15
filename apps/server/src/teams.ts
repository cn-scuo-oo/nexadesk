// @ts-nocheck
import type { Express } from "express";
import { createServer } from "http";
import { randomUUID } from "node:crypto";

interface TeamPeer {
  id: string;
  name: string;
  ws: any;
  teamId: string;
  joinedAt: string;
}

interface TeamRoom {
  id: string;
  name: string;
  peers: TeamPeer[];
  createdAt: string;
}

const rooms = new Map<string, TeamRoom>();
let wss: any = null;

export function initTeamsWebSocket(httpServer: ReturnType<typeof createServer>): void {
  try {
    const { WebSocketServer, WebSocket } = require("ws");
    wss = new WebSocketServer({ server: httpServer, path: "/ws/teams" });
    wss.on("connection", (ws: any, req: any) => {
      const peerId = randomUUID();
      let currentRoom: string | null = null;
      let peerName = "Anonymous";

      ws.on("message", (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString());
          switch (msg.type) {
            case "join": {
              peerName = msg.name || "Anonymous";
              const roomId = msg.teamId || "default";
              currentRoom = roomId;
              if (!rooms.has(roomId)) {
                rooms.set(roomId, { id: roomId, name: msg.teamName || "Team Room", peers: [], createdAt: new Date().toISOString() });
              }
              const room = rooms.get(roomId)!;
              room.peers = room.peers.filter((p: TeamPeer) => p.ws.readyState === WebSocket.OPEN);
              room.peers.push({ id: peerId, name: peerName, ws, teamId: roomId, joinedAt: new Date().toISOString() });
              broadcast(roomId, { type: "peer_joined", peerId, name: peerName, peers: room.peers.map((p: TeamPeer) => ({ id: p.id, name: p.name })) });
              ws.send(JSON.stringify({ type: "joined", peerId, roomId, peers: room.peers.map((p: TeamPeer) => ({ id: p.id, name: p.name })) }));
              break;
            }
            case "chat": {
              if (currentRoom) broadcast(currentRoom, { type: "chat", from: peerId, fromName: peerName, text: msg.text, timestamp: new Date().toISOString() });
              break;
            }
            case "cursor": {
              if (currentRoom) broadcast(currentRoom, { type: "cursor", from: peerId, fromName: peerName, x: msg.x, y: msg.y });
              break;
            }
            case "action": {
              if (currentRoom) broadcast(currentRoom, { type: "action", from: peerId, fromName: peerName, action: msg.action, payload: msg.payload });
              break;
            }
            case "signal": {
              if (currentRoom) { broadcast(currentRoom, { type: "signal", from: peerId, fromName: peerName, signal: msg.signal }, peerId); }
              break;
            }
          }
        } catch {}
      });

      ws.on("close", () => {
        if (currentRoom && rooms.has(currentRoom)) {
          const room = rooms.get(currentRoom)!;
          room.peers = room.peers.filter((p: TeamPeer) => p.id !== peerId);
          broadcast(currentRoom, { type: "peer_left", peerId, peers: room.peers.map((p: TeamPeer) => ({ id: p.id, name: p.name })) });
          if (room.peers.length === 0) rooms.delete(currentRoom);
        }
      });
    });
  } catch(e) { console.warn("[teams] WebSocket not available:", (e as Error).message); }
}

function broadcast(roomId: string, message: object, excludeId?: string): void {
  const { WebSocket } = require("ws");
  const room = rooms.get(roomId);
  if (!room) return;
  const data = JSON.stringify(message);
  room.peers.forEach((peer: TeamPeer) => {
    if (peer.ws.readyState === WebSocket.OPEN && peer.id !== excludeId) {
      peer.ws.send(data);
    }
  });
}

export function registerTeamsRoutes(app: Express): void {
  app.get("/api/teams", (_req, res) => {
    const teamList = Array.from(rooms.entries()).map(([id, room]) => ({
      id, name: room.name, peerCount: room.peers.length,
      peers: room.peers.map((p: TeamPeer) => ({ id: p.id, name: p.name })),
      createdAt: room.createdAt
    }));
    res.json(teamList);
  });

  app.post("/api/teams", (req, res) => {
    const id = randomUUID();
    rooms.set(id, { id, name: req.body.name || "New Team", peers: [], createdAt: new Date().toISOString() });
    res.json({ id, name: req.body.name || "New Team", inviteCode: id });
  });

  app.get("/api/teams/:id", (req, res) => {
    const room = rooms.get(req.params.id);
    if (!room) { res.status(404).json({ error: "Team not found" }); return; }
    res.json({ id: room.id, name: room.name, peerCount: room.peers.length,
      peers: room.peers.map((p: TeamPeer) => ({ id: p.id, name: p.name })), createdAt: room.createdAt });
  });
}
