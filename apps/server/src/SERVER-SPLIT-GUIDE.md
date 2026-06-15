# Server Split Guide

## What Changed
The original 82KB/2428-line `apps/server/src/index.ts` has been split into **17 domain modules**.

## New File Structure

| File | Responsibility | Original Lines |
|------|---------------|----------------|
| `index.ts` | Entry point, wires modules | NEW (~80 lines) |
| `state.ts` | Shared mutable state | 80-90, 142, 1182-1191, 1319-1326, 1453-1466 |
| `health.ts` | Health check | 174-176 |
| `snapshot-route.ts` | Snapshot API | 178-192 |
| `providers.ts` | Provider test/models | 93-172, 194-202, 701-737, 2186-2312 |
| `agents.ts` | Agent engine detect | 111-139, 204-206, 565-611, 2314-2427 |
| `sessions.ts` | Chat, messages, streaming | 218-220, 291-399, 739-1428 |
| `settings.ts` | Settings CRUD | 436-442, 613-659 |
| `workspace.ts` | File browser | 287-289, 529-559 |
| `mcp.ts` | MCP server/tools | 661-699, 1632-1653, 1793-2184 |
| `approvals.ts` | Tool approval | 1468-1582 |
| `automations.ts` | Scheduled tasks | 317-333, 444-527, 1193-1317 |
| `im.ts` | IM channels | 232-285 |
| `memory.ts` | Memory entries | 1703-1740 |
| `telemetry.ts` | Runtime metrics | 296-315, 411-434 |
| `skills.ts` | Skill marketplace | 208-216, 222-230, 1656-1700 |
| `events-route.ts` | SSE event stream | 401-409 |
| `encryption.ts` | Encrypt/decrypt | 1743-1785 |
| `desktop.ts` | Desktop status | 561-563, 1430-1451 |

## Migration Steps

1. The new `index.ts` replaces the old one
2. The old file should be renamed to `index-old.ts` as backup
3. All route modules use `register*Routes(app)` pattern
4. Shared state is centralized in `state.ts`
5. No circular dependencies exist