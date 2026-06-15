// @ts-nocheck
// NexaDesk Teams - WebSocket-based desktop pairing & real-time collaboration
import type { Express } from "express";
import { createServer } from "http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

interface TeamPeer {
  id: string;
  name: string;
  ws: WebSocket;
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
let wss: WebSocketServer | null = null;

export function initTeamsWebSocket(httpServer: ReturnType<typeof createServer>): void {
  wss = new WebSocketServer({ server: httpServer, path: "/ws/teams" });

  wss.on("connection", (ws, req) => {
    const peerId = randomUUID();
    let currentRoom: string | null = null;
    let peerName = "Anonymous";

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.type) {
          case "join": {
            peerName = msg.name || "Anonymous";
            const roomId = msg.teamId || "default";
            currentRoom = roomId;

            if (!rooms.has(roomId)) {
              rooms.set(roomId, {
                id: roomId,
                name: msg.teamName || "Team Room",
                peers: [],
                createdAt: new Date().toISOString()
              });
            }

            const room = rooms.get(roomId)!;
            room.peers = room.peers.filter((p) => {
              if (p.ws.readyState !== WebSocket.OPEN) return false;
              return true;
            });

            const peer: TeamPeer = { id: peerId, name: peerName, ws, teamId: roomId, joinedAt: new Date().toISOString() };
            room.peers.push(peer);

            // Notify all peers in room
            broadcast(roomId, {
              type: "peer_joined",
              peerId,
              name: peerName,
              peers: room.peers.map((p) => ({ id: p.id, name: p.name }))
            });

            ws.send(JSON.stringify({
              type: "joined",
              peerId,
              roomId,
              peers: room.peers.map((p) => ({ id: p.id, name: p.name }))
            }));
            break;
          }

          case "signal": {
            // WebRTC signaling relay
            if (currentRoom) {
              broadcast(currentRoom, {
                type: "signal",
                from: peerId,
                fromName: peerName,
                signal: msg.signal
              }, peerId);
            }
            break;
          }

          case "chat": {
            if (currentRoom) {
              broadcast(currentRoom, {
                type: "chat",
                from: peerId,
                fromName: peerName,
                text: msg.text,
                timestamp: new Date().toISOString()
              });
            }
            break;
          }

          case "cursor": {
            if (currentRoom) {
              broadcast(currentRoom, {
                type: "cursor",
                from: peerId,
                fromName: peerName,
                x: msg.x,
                y: msg.y
              });
            }
            break;
          }

          case "action": {
            // Forward agent action to paired desktop
            if (currentRoom) {
              broadcast(currentRoom, {
                type: "action",
                from: peerId,
                fromName: peerName,
                action: msg.action,
                payload: msg.payload
              });
            }
            break;
          }
        }
      } catch { /* ignore malformed messages */ }
    });

    ws.on("close", () => {
      if (currentRoom && rooms.has(currentRoom)) {
        const room = rooms.get(currentRoom)!;
        room.peers = room.peers.filter((p) => p.id !== peerId);
        broadcast(currentRoom, {
          type: "peer_left",
          peerId,
          peers: room.peers.map((p) => ({ id: p.id, name: p.name }))
        });
        if (room.peers.length === 0) rooms.delete(currentRoom);
      }
    });
  });
}

function broadcast(roomId: string, message: object, excludeId?: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  const data = JSON.stringify(message);
  room.peers.forEach((peer) => {
    if (peer.ws.readyState === WebSocket.OPEN && peer.id !== excludeId) {
      peer.ws.send(data);
    }
  });
}

export function registerTeamsRoutes(app: Express): void {
  // List active teams
  app.get("/api/teams", (_req, res) => {
    const teamList = Array.from(rooms.entries()).map(([id, room]) => ({
      id,
      name: room.name,
      peerCount: room.peers.length,
      peers: room.peers.map((p) => ({ id: p.id, name: p.name })),
      createdAt: room.createdAt
    }));
    res.json(teamList);
  });

  // Create a team
  app.post("/api/teams", (req, res) => {
    const { name } = req.body;
    const id = randomUUID();
    rooms.set(id, { id, name: name || "New Team", peers: [], createdAt: new Date().toISOString() });
    res.json({ id, name: name || "New Team", inviteCode: id });
  });

  // Get team info
  app.get("/api/teams/:id", (req, res) => {
    const room = rooms.get(req.params.id);
    if (!room) { res.status(404).json({ error: "Team not found" }); return; }
    res.json({
      id: room.id,
      name: room.name,
      peerCount: room.peers.length,
      peers: room.peers.map((p) => ({ id: p.id, name: p.name })),
      createdAt: room.createdAt
    });
  });
}
