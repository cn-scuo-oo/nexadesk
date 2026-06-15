# Changelog

All notable changes to NexaDesk are documented here.

## [Unreleased]

### Added
- **Multi-Agent System**: Built-in + external CLI engine support
- **Agent Engine Adapters**: Codex CLI integration; Claude Code, OpenClaw, Hermes stubs
- **Model Providers**: 12 providers including OpenAI, DeepSeek, Google Gemini, GitHub Copilot, etc.
- **MCP Protocol**: Server discovery, testing, tool management, marketplace
- **Markdown Rendering**: react-markdown with GFM, KaTeX math, Mermaid diagrams, Prism highlighting
- **Runtime Dashboard**: Real-time telemetry, TPS metrics, provider/model tracking
- **Slash Commands**: 13 built-in commands with categorized panel UI
- **Desktop Studio**: Canvas view with layout templates and widget library
- **IM Bridge**: Feishu and DingTalk webhook integration
- **Approval Queue**: Risk-based auto/manual approval with history
- **Automation Scheduler**: Cron-based scheduled agent tasks
- **Workspace File Browser**: Directory listing, file preview, search
- **Memory Management**: Session summaries, long-term memory, retention config
- **Skills Hub**: 13 built-in skills with marketplace support
- **Teams Collaboration**: WebSocket-based desktop pairing and real-time chat
- **Desktop Automation**: Mouse/keyboard control via robotjs API
- **CI/CD Pipeline**: GitHub Actions for quality checks and automated releases
- **Husky + Commitlint**: Pre-commit hooks and commit message conventions
- **Code Signing**: Authenticode signing script for Windows builds
- **One-Click Installer**: Cross-platform CLI install scripts (Windows/macOS/Linux)

### Changed
- Refactored packages/shared/src/index.ts (39KB -> 14 domain modules)
- Refactored apps/server/src/index.ts (82KB -> 18 route modules)
- Refactored apps/web/src/App.tsx (300KB -> 25+ extracted files)
- Shared package: migrated to compiled .js output for Node.js ESM resolution

### Fixed
- Missing ProviderSecretUpdate import in settings.ts
- Duplicate function declarations in sessions.ts
- Module-level route registrations in mcp.ts
- Incorrect parameter passing in state.ts persistRuntimeState

[Unreleased]: https://github.com/cn-scuo-oo/nexadesk/compare/initial...HEAD
