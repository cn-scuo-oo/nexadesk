<p align="center">
  <img src="https://github.com/cn-scuo-oo/nexadesk/raw/main/build-resources/icon.png" alt="NexaDesk" width="120" height="120" />
</p>

<h1 align="center">NexaDesk</h1>

<p align="center">
  <strong>下一代多智能体桌面工作台 · Next-Gen Multi-Agent Desktop Workbench</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/cn-scuo-oo/nexadesk?style=flat-square&label=Release&color=1f6b50" />
  <img src="https://img.shields.io/github/actions/workflow/status/cn-scuo-oo/nexadesk/ci.yml?style=flat-square&label=CI&color=2e8b68" />
  <img src="https://img.shields.io/github/actions/workflow/status/cn-scuo-oo/nexadesk/release.yml?style=flat-square&label=Release&color=4b5563" />
  <img src="https://img.shields.io/badge/License-UNLICENSED-red?style=flat-square" />
  <br/>
  <img src="https://img.shields.io/badge/Node-22-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/React-19-blueviolet?style=flat-square" />
  <img src="https://img.shields.io/badge/Tailwind-3-38bdf8?style=flat-square" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178c6?style=flat-square" />
  <img src="https://img.shields.io/badge/Electron-42-47848f?style=flat-square" />
</p>

---

## Screenshots

<table>
<tr>
  <td align="center"><strong>Chat View</strong></td>
  <td align="center"><strong>Runtime Dashboard</strong></td>
  <td align="center"><strong>Agent Hub</strong></td>
</tr>
<tr>
  <td><img src="https://via.placeholder.com/400x250/1a1d27/2e8b68?text=Chat+View" width="400" /></td>
  <td><img src="https://via.placeholder.com/400x250/1a1d27/2e8b68?text=Runtime+Dashboard" width="400" /></td>
  <td><img src="https://via.placeholder.com/400x250/1a1d27/2e8b68?text=Agent+Hub" width="400" /></td>
</tr>
</table>

> Screenshots will be replaced with real UI screenshots after first public release.

---

## Features

- 🤖 **Multi-Agent System** - Cowork, code, document agents with built-in + external CLI engines
- 🧠 **Multi-Provider** - Ollama, OpenAI, DeepSeek, Google Gemini, GitHub Copilot, OpenRouter, etc.
- 🛠️ **MCP Protocol** - Discover, test, and manage AI tool servers
- 💬 **Markdown Rendering** - Syntax highlighting + Mermaid diagrams + KaTeX math
- 📊 **Runtime Dashboard** - Real-time latency, token, TPS monitoring
- 🔒 **Approval Queue** - Risk-based auto/manual approval
- ⏰ **Automation Scheduler** - Cron-based scheduled agent tasks
- 🧩 **Skills Hub** - Switchable skill modules with marketplace
- 🌐 **IM Integration** - Feishu/DingTalk webhook bridge
- 🗂️ **Workspace Browser** - File browsing, search, preview
- 🌙 **Theme System** - Multiple themes with dark/light support

---

## Quick Start

### Prerequisites
- Node.js >= 22
- npm or pnpm

### Install & Run

```bash
git clone https://github.com/cn-scuo-oo/nexadesk.git
cd nexadesk
npm install
npm run dev
```

### One-Click CLI Install

```powershell
# Windows
iwr -useb https://raw.githubusercontent.com/cn-scuo-oo/nexadesk/main/install.ps1 | iex
```

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/cn-scuo-oo/nexadesk/main/install.sh | sh
```

---

## Project Structure

```
nexadesk/
├── apps/
│   ├── web/          # React 19 + Vite frontend
│   ├── server/       # Express backend
│   └── desktop/      # Electron shell
├── packages/
│   └── shared/       # Shared types and defaults
├── scripts/          # Build and tooling scripts
├── build-resources/  # Icons, signing, installer resources
└── docs/             # Documentation
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript 5.8, Vite 7, Tailwind CSS 3 |
| Backend | Express 5, tsx, Zod |
| Desktop | Electron 42, electron-builder |
| Charts | Recharts, Mermaid |
| Markdown | react-markdown, react-syntax-highlighter, KaTeX |
| UI | Headless UI, Heroicons, Lucide |
| State | Redux Toolkit |

---

## Docs

- [AGENTS.md](./AGENTS.md) - Agent system architecture
- [CLAUDE.md](./CLAUDE.md) - Development guide
- [IDENTITY.md](./IDENTITY.md) - Brand identity
- [CHANGELOG.md](./CHANGELOG.md) - Changelog

---

<p align="center">
  <sub>Built with ❤️ by the NexaDesk Team</sub>
  <br/>
  <sub>© 2026 NexaDesk Contributors. All rights reserved.</sub>
</p>