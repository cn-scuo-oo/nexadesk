<p align="center">
  <img src="https://github.com/cn-scuo-oo/nexadesk/raw/main/build-resources/icon.png" alt="NexaDesk" width="120" height="120" />
</p>

<h1 align="center">NexaDesk</h1>

<p align="center">
  <strong>涓嬩竴浠ｅ鏅鸿兘浣撴闈㈠伐浣滃彴 路 Next-Gen Multi-Agent Desktop Workbench</strong>
</p>

<p align="center">
  <a href="https://github.com/cn-scuo-oo/nexadesk/releases">
    <img src="https://img.shields.io/github/v/release/cn-scuo-oo/nexadesk?style=flat-square&label=Release&color=1f6b50" />
  </a>
  <a href="https://github.com/cn-scuo-oo/nexadesk/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/cn-scuo-oo/nexadesk/ci.yml?style=flat-square&label=CI&color=2e8b68" />
  </a>
  <a href="https://github.com/cn-scuo-oo/nexadesk/actions/workflows/release.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/cn-scuo-oo/nexadesk/release.yml?style=flat-square&label=Release&color=4b5563" />
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/License-UNLICENSED-red?style=flat-square" />
  </a>
  <br/>
  <img src="https://img.shields.io/badge/Node-22-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/React-19-blueviolet?style=flat-square" />
  <img src="https://img.shields.io/badge/Tailwind-3-38bdf8?style=flat-square" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178c6?style=flat-square" />
  <img src="https://img.shields.io/badge/Electron-42-47848f?style=flat-square" />
</p>

---

## 鎴浘 / Screenshots

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
<tr>
  <td align="center"><strong>Settings Center</strong></td>
  <td align="center"><strong>MCP Hub</strong></td>
  <td align="center"><strong>Memory</strong></td>
</tr>
<tr>
  <td><img src="https://via.placeholder.com/400x250/1a1d27/2e8b68?text=Settings" width="400" /></td>
  <td><img src="https://via.placeholder.com/400x250/1a1d27/2e8b68?text=MCP+Hub" width="400" /></td>
  <td><img src="https://via.placeholder.com/400x250/1a1d27/2e8b68?text=Memory" width="400" /></td>
</tr>
</table>

> 馃摳 鎴浘灏嗗湪棣栨姝ｅ紡鍙戝竷鍚庢浛鎹负鐪熷疄鐣岄潰鎴浘銆?
---

## 鐗规€?/ Features

- 馃 **澶氭櫤鑳戒綋绯荤粺** 鈥?Cowork銆佷唬鐮併€佹枃妗ｇ瓑澶氱 Agent锛屾敮鎸佸唴缃拰澶栭儴 CLI 寮曟搸
- 馃 **澶氭ā鍨嬫彁渚涘晢** 鈥?Ollama銆丱penAI銆丏eepSeek銆丟oogle Gemini銆丟itHub Copilot 绛?- 馃洜锔?**MCP 鍗忚鏀寔** 鈥?鍙戠幇銆佹祴璇曘€佺鐞?AI 宸ュ叿鏈嶅姟鍣?- 馃挰 **Markdown 娓叉煋** 鈥?璇硶楂樹寒 + Mermaid 鍥捐〃 + KaTeX 鏁板鍏紡
- 馃搳 **杩愯鏃朵华琛ㄧ洏** 鈥?瀹炴椂鐩戞帶寤惰繜銆乀oken銆乀PS
- 馃敀 **瀹℃壒闃熷垪** 鈥?鎸夐闄╃骇鍒嚜鍔?鎵嬪姩瀹℃壒
- 鈴?**鑷姩鍖栦换鍔?* 鈥?瀹氭椂鎵ц Agent 浠诲姟
- 馃З **鎶€鑳?/ Hub** 鈥?鍙垏鎹㈡妧鑳芥ā鍧?- 馃寪 **IM 闆嗘垚** 鈥?椋炰功/閽夐拤 Webhook 妗ユ帴
- 馃梻锔?**宸ヤ綔鍖烘祻瑙?* 鈥?鏂囦欢娴忚銆佹悳绱€侀瑙?- 馃寵 **浜殫涓婚** 鈥?澶氫富棰樺垏鎹?
---

## 蹇€熷紑濮?/ Quick Start

### 鍓嶇疆瑕佹眰
- Node.js >= 22
- pnpm 鎴?npm

### 瀹夎 & 杩愯

\\\ash
# 鍏嬮殕浠撳簱
git clone https://github.com/cn-scuo-oo/nexadesk.git
cd nexadesk

# 瀹夎渚濊禆
npm install

# 寮€鍙戞ā寮忓惎鍔紙Server + Web锛?npm run dev

# 鏋勫缓妗岄潰搴旂敤
npm run build:desktop

# 杩愯娴嬭瘯
npm run test
\\\

### One-Click CLI 瀹夎

\\\powershell
# Windows
iwr -useb https://raw.githubusercontent.com/cn-scuo-oo/nexadesk/main/install.ps1 | iex
\\\

\\\ash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/cn-scuo-oo/nexadesk/main/install.sh | sh
\\\

---

## 椤圭洰缁撴瀯 / Project Structure

\\\
nexadesk/
鈹溾攢鈹€ apps/
鈹?  鈹溾攢鈹€ web/          # React 19 + Vite 鍓嶇
鈹?  鈹溾攢鈹€ server/       # Express 鍚庣
鈹?  鈹斺攢鈹€ desktop/      # Electron 澹?鈹溾攢鈹€ packages/
鈹?  鈹斺攢鈹€ shared/       # 鍏变韩绫诲瀷鍜岄粯璁ゅ€?鈹溾攢鈹€ scripts/          # 鏋勫缓鍜屽伐鍏疯剼鏈?鈹溾攢鈹€ build-resources/  # 鍥炬爣銆佺鍚嶃€佸畨瑁呰祫婧?鈹斺攢鈹€ docs/             # 鏂囨。
\\\

---

## 鎶€鏈爤 / Tech Stack

| 灞?| 鎶€鏈?|
|----|------|
| 鍓嶇 | React 19, TypeScript 5.8, Vite 7, Tailwind CSS 3 |
| 鍚庣 | Express 5, tsx, Zod |
| 妗岄潰 | Electron 42, electron-builder |
| 鍥捐〃 | Recharts, Mermaid |
| Markdown | react-markdown, react-syntax-highlighter, KaTeX |
| UI | Headless UI, Heroicons, Lucide |
| 鐘舵€?| Redux Toolkit |

---

## 鏂囨。 / Docs

- [AGENTS.md](./AGENTS.md) 鈥?Agent 绯荤粺鏋舵瀯
- [CLAUDE.md](./CLAUDE.md) 鈥?寮€鍙戞寚鍗?- [IDENTITY.md](./IDENTITY.md) 鈥?鍝佺墝鏍囪瘑
- [CHANGELOG.md](./CHANGELOG.md) 鈥?鍙樻洿鏃ュ織

---

<p align="center">
  <sub>Built with 鉂わ笍 by the NexaDesk Team</sub>
  <br/>
  <sub>漏 2026 NexaDesk Contributors. All rights reserved.</sub>
</p>