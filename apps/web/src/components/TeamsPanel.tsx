import React, { useState, useEffect, useCallback, useRef } from "react";

interface PeerInfo {
  id: string;
  name: string;
}

interface ChatMessage {
  from: string;
  fromName: string;
  text: string;
  timestamp: string;
}

interface TeamsPanelProps {
  onClose: () => void;
}

export const TeamsPanel: React.FC<TeamsPanelProps> = ({ onClose }) => {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [peerId, setPeerId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [roomName, setRoomName] = useState("");
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [chats, setChats] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [tab, setTab] = useState<"peers" | "chat">("peers");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(() => localStorage.getItem("teams-name") || "User");

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chats]);

  const connect = useCallback(() => {
    if (ws?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const socket = new WebSocket(`${protocol}//${host}/ws/teams`);

    socket.onopen = () => {
      setConnected(true);
      // Join or create team
      const teamId = new URLSearchParams(window.location.search).get("team") || "default";
      socket.send(JSON.stringify({ type: "join", name, teamId, teamName: "Desktop Team" }));
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "joined":
            setPeerId(msg.peerId);
            setRoomId(msg.roomId);
            setPeers(msg.peers || []);
            break;
          case "peer_joined":
            setPeers(msg.peers || []);
            break;
          case "peer_left":
            setPeers(msg.peers || []);
            break;
          case "chat":
            setChats((prev) => [...prev, { from: msg.from, fromName: msg.fromName, text: msg.text, timestamp: msg.timestamp }]);
            break;
        }
      } catch { /* ignore */ }
    };

    socket.onclose = () => {
      setConnected(false);
      setWs(null);
    };

    setWs(socket);
  }, [name]);

  useEffect(() => {
    connect();
    return () => { ws?.close(); };
  }, []);

  const sendChat = useCallback(() => {
    if (!chatInput.trim() || !ws) return;
    ws.send(JSON.stringify({ type: "chat", text: chatInput.trim() }));
    setChatInput("");
  }, [chatInput, ws]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
  };

  return (
    <div className="teams-panel">
      <div className="teams-header">
        <div className="teams-title-row">
          <h3>Desktop Teams {connected ? "🟢" : "🔴"}</h3>
          <span className="teams-peer-count">{peers.length} peer{peers.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="teams-name-row">
          <input type="text" value={name} onChange={(e) => { setName(e.target.value); localStorage.setItem("teams-name", e.target.value); }}
            className="input input-sm" placeholder="Your name" />
          <button className="btn btn-sm" onClick={connect} disabled={connected}>Reconnect</button>
        </div>
      </div>

      <div className="teams-tabs">
        <button className={`teams-tab ${tab === "peers" ? "active" : ""}`} onClick={() => setTab("peers")}>
          Peers ({peers.length})
        </button>
        <button className={`teams-tab ${tab === "chat" ? "active" : ""}`} onClick={() => setTab("chat")}>
          Chat ({chats.length})
        </button>
      </div>

      <div className="teams-body">
        {tab === "peers" ? (
          <div className="teams-peer-list">
            {peers.length === 0 ? (
              <div className="teams-empty">No peers connected. Share this team ID: <code>{roomId}</code></div>
            ) : (
              peers.map((peer) => (
                <div key={peer.id} className={`teams-peer-row ${peer.id === peerId ? "me" : ""}`}>
                  <div className="teams-peer-avatar">{peer.name[0]?.toUpperCase() || "?"}</div>
                  <div className="teams-peer-info">
                    <strong>{peer.name}</strong>
                    <span>{peer.id === peerId ? "(you)" : "connected"}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="teams-chat-area">
            <div className="teams-chat-messages">
              {chats.length === 0 ? (
                <div className="teams-chat-empty">No messages yet. Send a chat to your team.</div>
              ) : (
                chats.map((chat, idx) => (
                  <div key={idx} className={`teams-chat-bubble ${chat.from === peerId ? "mine" : ""}`}>
                    <div className="teams-chat-author">{chat.fromName}</div>
                    <div className="teams-chat-text">{chat.text}</div>
                    <div className="teams-chat-time">{new Date(chat.timestamp).toLocaleTimeString()}</div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="teams-chat-input-row">
              <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown} placeholder="Type a message..." className="input" disabled={!connected} />
              <button className="btn btn-primary btn-sm" onClick={sendChat} disabled={!connected || !chatInput.trim()}>Send</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamsPanel;
