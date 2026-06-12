# Private Backlog

This backlog tracks the remaining private-incubation work for NexaDesk. Items here should be converted into private GitHub Issues as soon as they are actively being worked on.

## Immediate Private Repo Tasks

- Confirm branch protection is enabled once the private CI signal is stable.
- Keep private installer artifacts short-lived and restricted to trusted testers.
- Decide whether issue templates and release checklists should be enforced before more contributors join.
- Keep the repo private until signing, update strategy, and public release policy are decided.

## Phase 7 - Installer QA And Agent Engine Shell

- Finish the clean install, reinstall, upgrade, shortcut, and uninstall entry checks.
- Finish the data-retention validation for desktop mode across repeated launches and user-data reuse.
- Harden packaged desktop smoke coverage for slow runners and transient Windows cleanup locks.
- Verify the Windows NSIS installer from the packaged executable before sharing artifacts.
- Complete the WeSight-inspired shell polish so the workspace has a bounded main stage, collapsible live context, and no horizontal overflow at desktop width.
- Finish the single-purpose main surfaces for New Task, Task Thread, Search, Scheduled Tasks, Runtime Dashboard, Skills, MCP, Agents, and Settings.
- Finish the Agent Engine Center split between model providers and agent runtimes.
- Finish engine detection for built-in and external runtimes, including local CLI config discovery and persisted setup status.
- Finish Code Assistant routing through the ready Codex CLI engine, with provider fallback when the external engine is unavailable.
- Add coverage for the remaining engine and runtime-path combinations that matter for trusted testers.

## Product Hardening Follow-Ups

- Re-run provider save/load checks across the provider families most likely to drift.
- Keep the approval queue behavior covered as new tool actions are added.
- Verify workspace search, preview, and send-to-agent flows after any context-panel changes.
- Keep runtime state persistence covered when sessions, approvals, or activity formats change.
- Keep diagnostics copy output free of secrets as more settings are added.

## Public Release Later

- Pick an open-source license.
- Rewrite README for external users.
- Add public contribution and security policies.
- Audit all brand, icon, dependency, and generated asset usage.
- Decide on app signing and automatic updates.
- Create the first public release only after installer, provider, and data-loss tests pass.
