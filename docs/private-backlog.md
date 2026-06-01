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

## Agent Runtime

- Make tool result messages clearer in the chat stream.
- Persist sessions and messages beyond in-memory demo state.
- Add per-agent model override tests.
- Add approval history and rejected-action explanations.
- Add workspace root selector in desktop mode.

## Desktop Packaging

- Test clean install, reinstall, uninstall, and upgrade paths.
- Decide signing certificate strategy.
- Decide auto-update strategy only after installer QA is stable.
- Add manual build workflow for Windows installer artifacts.

## Public Release Later

- Pick an open-source license.
- Rewrite README for external users.
- Add public contribution and security policies.
- Audit all brand, icon, dependency, and generated asset usage.
- Create first public release only after installer, provider, and data-loss tests pass.
