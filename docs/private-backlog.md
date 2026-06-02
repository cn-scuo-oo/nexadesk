# Private Backlog

This backlog is for the private GitHub incubation stage. It is intentionally practical: each item should become a private GitHub Issue when work starts.

## Immediate Private Repo Tasks

- Confirm the repository is private on GitHub.
- Confirm Private CI runs after every push.
- Add branch protection after CI is stable.
- Decide whether installers are kept only locally or uploaded as private workflow artifacts later.

## Product Hardening

- Verify installed app shortcuts, Start Menu entry, uninstall entry, icon, and app title.
- Test Provider save/load across restart for OpenAI-compatible, Ollama, DeepSeek, Qwen/DashScope, SiliconFlow, Moonshot, Zhipu, OpenRouter, NewAPI, and Anthropic.
- Add explicit clear API key and delete custom Provider actions. Done in Phase 6 first pass.
- Add Provider copy plus non-secret settings import/export. Done in Phase 6 first pass.
- Add corrupted settings recovery UI instead of only fallback behavior. Done in Phase 6 second pass.
- Add an in-app diagnostics copy button for log paths and app status. Done in Phase 6 second pass.
- Rework the workbench information architecture using a WeSight-inspired task/sidebar/context layout. Started in Phase 7 third pass.
- Tighten the WeSight-inspired desktop shell so the workbench has a bounded main stage, collapsible live context dock, and no horizontal overflow at desktop smoke width. Done in Phase 7 seventh pass.
- Split model Providers from Agent runtimes and add an Agent Engine Center for built-in and external CLI engines. Started in Phase 7 fourth pass.
- Collapse long Provider, assistant, and skill configuration surfaces into expandable sections. Done in Phase 6 fifth pass.
- Add a domestic Provider matrix and static default verification. Done in Phase 6 seventh pass.
- Show domestic Provider matrix status inside the Model Center. Done in Phase 6 eighth pass.
- Add one-click Provider model-list refresh from `/models`. Done in Phase 6 ninth pass.
- Persist Provider test and model-refresh status across restart. Done in Phase 6 tenth pass.
- Tighten the Model Center into a two-pane desktop layout. Done in Phase 6 eleventh pass.
- Add desktop user-data retention smoke coverage for reinstall/upgrade confidence. Done in Phase 6 twelfth pass.

## Agent Runtime

- Make tool result messages clearer in the chat stream. Done in Phase 6 thirteenth pass.
- Add copy and full-detail viewing for tool result messages. Done in Phase 6 fourteenth pass.
- Optimize the approval queue with risk explanations and safe batch actions. Done in Phase 6 fifteenth pass.
- Add a real workspace file panel to the workbench. Done in Phase 6 sixteenth pass.
- Add workspace file preview and send-to-Agent read action. Done in Phase 6 seventeenth pass.
- Prevent packaged desktop startup from being blocked by renderer smoke tests. Done in Phase 6 eighteenth pass.
- Add workspace filename and content search in the workbench. Done in Phase 6 nineteenth pass.
- Add send-to-Agent analysis actions on workspace search results. Done in Phase 6 twentieth pass.
- Compact the workspace file tree and search into a switchable context panel. Done in Phase 6 twenty-first pass.
- Persist the workspace context panel collapsed state and active view locally. Done in Phase 6 twenty-second pass.
- Add local recent workspace files to the context panel. Done in Phase 6 twenty-third pass.
- Persist sessions and messages beyond in-memory demo state. Done in Phase 6 third pass.
- Add per-agent model override tests. Done in Phase 6 final pass.
- Add approval history and rejected-action explanations. Done in Phase 6 sixth pass.
- Add workspace root selector in desktop mode. Done in Phase 6 fourth pass.
- Detect local Codex CLI, Claude Code, Qwen Code, DeepSeek-TUI, OpenCode, OpenClaw, and Hermes runtime configs from Agent Engine Center. Started in Phase 7 fifth pass.
- Bind Code Assistant to the ready Codex CLI engine with read-only external execution and Provider fallback. Done in Phase 7 sixth pass.

## Desktop Packaging

- Test clean install, reinstall, uninstall, and upgrade paths.
- Decide signing certificate strategy.
- Decide auto-update strategy only after installer QA is stable.
- Add manual build workflow for Windows installer artifacts. Done in Phase 7 first pass.
- Add packaged desktop smoke coverage for `release/win-unpacked/NexaDesk.exe`. Done in Phase 7 first pass.
- Harden desktop smoke scripts for slower GitHub runners and locked temporary user data. Done in Phase 7 second pass.
- Disable electron-builder implicit GitHub publishing for private installer builds. Done in Phase 7 second pass.

## Public Release Later

- Pick an open-source license.
- Rewrite README for external users.
- Add public contribution and security policies.
- Audit all brand, icon, dependency, and generated asset usage.
- Create first public release only after installer, provider, and data-loss tests pass.
