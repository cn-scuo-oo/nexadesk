# NexaDesk Built-in Agent Engine - Integration Guide

## Overview

The Agent Engine provides a built-in AI agent that can:
- Have conversations with users
- Automatically call tools (read files, run commands, search, etc.)
- Execute tool calls in a loop until the task is complete
- Show real-time streaming responses via SSE

## Files Added

| File | Purpose |
|------|---------|
| `apps/server/src/agent-engine.ts` | Core Agent Loop (LLM → tools → results → loop) |
| `apps/server/src/agent-routes.ts` | SSE API endpoint + route registration |
| `apps/web/src/components/AgentChat.tsx` | Streaming chat UI with tool call visualization |
| `apps/web/src/lib/agent-client.ts` | Client-side SSE streaming utility |

## Integration Steps

### Step 1: Register Routes in Server (index.ts)

Add these 2 lines to `apps/server/src/index.ts`:

```typescript
// Add near the top with other imports:
import { registerAgentRoutes } from "./agent-routes.js";

// Add after other route registrations (e.g., after app.use(cors())):
registerAgentRoutes(app);
```

### Step 2: Add AgentChat View in Frontend (App.tsx)

In `apps/web/src/App.tsx`, add the import:

```typescript
import { AgentChat } from "./components/AgentChat";
```

Then in the view rendering section, add a case for the agent view:

```typescript
// In the main content area, add:
{currentView === "agent" && (
  <AgentChat
    serverUrl="http://localhost:3000"
    workspace={settings.workspace}
    provider={activeProvider}
    model={settings.model.activeModel}
    apiKey={activeApiKey}
  />
)}
```

### Step 3: Add Navigation Entry

In the sidebar/navigation section of App.tsx, add an agent entry:

```typescript
{ id: "agent", label: "Agent Chat", icon: <Bot size={18} /> }
```

## API Endpoints

### POST /api/agent/chat

Streams agent responses via Server-Sent Events (SSE).

**Request Body:**
```json
{
  "provider": { "id": "...", "baseUrl": "...", "apiMode": "chat_completions" },
  "model": "gpt-4o",
  "apiKey": "sk-...",
  "messages": [{ "role": "user", "content": "Hello" }],
  "workspace": { "defaultWorkspace": "/path/to/workspace", "allowedRoots": ["/path"] }
}
```

**Response:** `text/event-stream`

**Event Types:**
- `text_delta` - Incremental text from the LLM
- `tool_start` - A tool call is starting
- `tool_result` - A tool call completed
- `approval_needed` - A high-risk tool needs user approval
- `error` - An error occurred
- `done` - Agent loop finished

## Tool Risk Levels

| Risk | Tools | Behavior |
|------|-------|----------|
| low | list_dir, read_file, search | Auto-execute |
| medium | write_file | Requires approval |
| high | run_command, browser, image_generate | Requires approval |
