# App.tsx Split Guide

## What Changed
The original 300KB/8367-line `App.tsx` has been split into **25+ extracted modules**.

## New File Structure

### lib/ (Constants, Types, Utils)
| File | Lines | Content |
|------|-------|---------|
| `lib/types-and-constants.ts` | 1-195 | Imports, type definitions, global declarations |
| `lib/theme.ts` | 196-323 | Theme system (themes, preview colors, storage) |
| `lib/i18n.ts` | 324-467 | Toast, slash commands, quick actions, i18n strings |
| `lib/agent-teams.ts` | 468-662 | Agent teams types and defaults |
| `lib/utils.ts` | mixed | Utility functions (skill import, formatting, diagnostics) |

### views/ (Main View Components)
| File | Lines | Content |
|------|-------|---------|
| `views/NewTaskView.tsx` | 2945-3086 | New task creation view |
| `views/TaskThreadView.tsx` | 3088-3241 | Chat thread view |
| `views/TaskRunPanel.tsx` | 3242-3563 | Task execution panel |
| `views/TaskSearchView.tsx` | 3565-3714 | Task search/history |
| `views/ScheduledTasksView.tsx` | 3716-4012 | Scheduled automation tasks |
| `views/RuntimeDashboardView.tsx` | 4013-4332 | Runtime monitoring dashboard |
| `views/McpHubView.tsx` | 4407-4910 | MCP tools center |
| `views/MemoryHubView.tsx` | 4911-5220 | Memory management |
| `views/AgentsHubView.tsx` | 5221-5530 | Agent management hub |
| `views/SettingsCenter.tsx` | 5532-6784 | Settings center (largest: 1223 lines) |

### components/ (Reusable Components)
| File | Lines | Content |
|------|-------|---------|
| `components/ProviderStatusPanel.tsx` | 6832-6865 | Provider status display |
| `components/ProviderConfigPanel.tsx` | 6867-7797 | Provider configuration (772 lines) |
| `components/IMSettingsPanel.tsx` | 7959-8098 | IM channel settings |
| `components/EmailConfigPanel.tsx` | 8100-8158 | Email configuration |
| `components/SmallComponents.tsx` | 7826-7957 | WindowTitleBar, PrivacyDialog, DesktopPet, etc. |
| `components/ApprovalComponents.tsx` | 8161-8247 | Approval cards, metrics |
| `components/MessageComponents.tsx` | 8249-8279 | Message bubble, workspace preview |

### components/modals/ (Modal Dialogs)
| File | Lines | Content |
|------|-------|---------|
| `components/modals/SettingsModal.tsx` | 2510-2527 | Settings modal container |
| `components/modals/AgentEditorModal.tsx` | 2529-2735 | Agent editor dialog |
| `components/modals/McpServerEditorModal.tsx` | 2769-2900 | MCP server editor |

## Migration Steps

1. The original `App.tsx` is kept as `App-old.tsx` backup
2. New `App.tsx` should import all extracted modules
3. Each view/component receives props from App state
4. Shared types are in `lib/types-and-constants.ts`

## Size Comparison

| Metric | Before | After |
|--------|--------|-------|
| App.tsx | 300KB / 8367 lines | 300KB (old) + 25 extracted files |
| Largest extracted | N/A | SettingsCenter.tsx (~1223 lines) |
| Average file size | N/A | ~200-300 lines |
| Files count | 1 | 25+ |