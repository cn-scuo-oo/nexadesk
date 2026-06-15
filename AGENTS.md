# NexaDesk Agent System

## Overview
NexaDesk is a multi-agent desktop workbench. Each agent is an AI-powered assistant specialized for different tasks, running on configurable engines (built-in or external CLI runtimes).

## Agent Architecture

`
User Input 鈫?Router 鈫?Agent Engine 鈫?Tools 鈫?Response
                鈫?          Approval Gateway (risk-based)
`

## Default Agents

| Agent | ID | Role | Engine |
|-------|-----|------|--------|
| Cowork 鍔╂墜 | cowork | Task coordination, tool orchestration | nexadesk_builtin |
| 浠ｇ爜鍔╂墜 | code | Code reading, modification, review | codex_cli |
| Word 鍔╂墜 | word | Document generation | nexadesk_builtin |
| Excel 鍔╂墜 | excel | Spreadsheet analysis | nexadesk_builtin |
| PPT 鍔╂墜 | ppt | Presentation creation | nexadesk_builtin |
| 鏂囦欢鏁寸悊鍔╂墜 | file-organizer | File management | nexadesk_builtin |
| 鎶ュ憡鍔╂墜 | report | Report writing | nexadesk_builtin |

## Agent Engines

| Engine | Type | Adapter Status |
|--------|------|----------------|
| nexadesk_builtin | Built-in | 鉁?Full support |
| codex_cli | External CLI | 鉁?Implemented |
| claude_code | External CLI | 鈴?Stub |
| qwen_code | External CLI | 鈴?Stub |
| deepseek_tui | External CLI | 鈴?Stub |
| openclaw | Runtime | 鈴?Stub |
| hermes | Runtime | 鈴?Stub |
| opencode | External CLI | 鈴?Stub |

## Adding a New Agent
1. Add entry in createDefaultAgents() in packages/shared/src/defaults.ts
2. Agent will appear in Agents Hub after settings reload
3. For custom engines, implement adapter in pps/server/src/external-agent-runtime.ts

## Permission Model
Each tool call has a risk level (low/medium/high):
- **low**: Auto-approved
- **medium**: Queued for user approval
- **high**: Requires explicit approval with reason

See packages/shared/src/permission.ts for types.