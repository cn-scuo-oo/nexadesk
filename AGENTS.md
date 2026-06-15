# NexaDesk Agent System

## Overview
NexaDesk is a multi-agent desktop workbench. Each agent is an AI-powered assistant specialized for different tasks, running on configurable engines (built-in or external CLI runtimes).

## Default Agents

| Agent | ID | Role | Engine |
|-------|-----|------|--------|
| Co-work Assistant | cowork | Task coordination, tool orchestration | nexadesk_builtin |
| Code Assistant | code | Code reading, modification, review | codex_cli |
| Word Assistant | word | Document generation | nexadesk_builtin |
| Excel Assistant | excel | Spreadsheet analysis | nexadesk_builtin |
| PPT Assistant | ppt | Presentation creation | nexadesk_builtin |
| File Organizer | file-organizer | File management | nexadesk_builtin |
| Report Assistant | report | Report writing | nexadesk_builtin |

## Agent Engines

| Engine | Type | Status |
|--------|------|--------|
| nexadesk_builtin | Built-in | Full support |
| codex_cli | External CLI | Implemented |
| claude_code | External CLI | Stub |
| qwen_code | External CLI | Stub |
| deepseek_tui | External CLI | Stub |
| openclaw | Runtime | Stub |
| hermes | Runtime | Stub |
| opencode | External CLI | Stub |

## Permission Model
Each tool call has a risk level (low/medium/high):
- **low**: Auto-approved
- **medium**: Queued for user approval
- **high**: Requires explicit approval

See `packages/shared/src/permission.ts` for types.
