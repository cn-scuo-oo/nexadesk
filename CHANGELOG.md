# Changelog

All notable changes to NexaDesk will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Multi-Agent System**: Built-in + external CLI engine support
- **Agent Engine Adapters**: Codex CLI integration; Claude Code, OpenClaw, Hermes stubs
- **Model Providers**: Ollama, OpenAI, DeepSeek, Google Gemini, GitHub Copilot, OpenRouter, 闃块噷浜戠櫨鐐? 纭呭熀娴佸姩, 鏈堜箣鏆楅潰 Kimi, 鏅鸿氨 GLM, Anthropic
- **MCP Protocol**: Server discovery, testing, tool management, marketplace
- **Markdown Rendering**: react-markdown with GFM, KaTeX math, Mermaid diagrams, Prism syntax highlighting
- **Runtime Dashboard**: Real-time telemetry, TPS metrics, provider/model tracking
- **Slash Commands**: 13 built-in commands with categorized panel UI
- **Desktop Studio**: Canvas view with layout templates and widget library
- **IM Bridge**: Feishu (椋炰功) and DingTalk (閽夐拤) webhook integration
- **IM Channel Management**: Enable/disable channels, test notifications
- **Approval Queue**: Risk-based auto/manual approval with history
- **Automation Scheduler**: Cron-based scheduled agent tasks
- **Workspace File Browser**: Directory listing, file preview, search
- **Memory Management**: Session summaries, long-term memory, retention config
- **Skills Hub**: Built-in 13 skills with import/scan support
- **Theme System**: Multiple theme modes with dark/light support
- **Desktop Pet**: Companion overlay widget
- **Privacy Dialog**: First-run privacy acknowledgement

### Changed
- **Refactored** packages/shared/src/index.ts (39KB 鈫?14 domain modules)
- **Refactored** pps/server/src/index.ts (82KB 鈫?18 route modules)
- **Refactored** pps/web/src/App.tsx (300KB 鈫?25+ extracted files)
- Shared package: migrated to compiled .js output for Node.js ESM resolution
- Vite config: added esolve.alias for workspace module resolution

### Fixed
- Missing ProviderSecretUpdate import in settings.ts
- Duplicate function declarations in sessions.ts
- PowerShell heredoc syntax corruption in server/index.ts
- Module-level route registrations in mcp.ts
- Incorrect parameter passing in state.ts persistRuntimeState

## [0.1.0] - Initial Development Build

### Added
- Project scaffolding (npm workspaces, TypeScript, Vite, Electron)
- Basic Express server with CORS and JSON API
- React frontend with Tailwind CSS and dark theme
- Agent chat interface with streaming responses
- Provider configuration and model selection
- Settings persistence and recovery
- Runtime telemetry collection and display
- Activity event stream (SSE)
- Basic encryption/decryption utilities
- Desktop status endpoint
- Heartbeat monitoring

[Unreleased]: https://github.com/cn-scuo-oo/nexadesk/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/cn-scuo-oo/nexadesk/releases/tag/v0.1.0