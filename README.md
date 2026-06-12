# NexaDesk

NexaDesk is a private incubation build of a local-first, multi-agent desktop workbench. It is not a public product yet. The repo exists to keep the project safe in a private GitHub repository, preserve development history, and make every phase easier to test and extend.

The core idea is simple: users should be able to run assistants locally, inspect tool activity, approve risky actions, manage model providers, and keep workspace context visible while the system works.

## What This Repo Is For

- A private desktop workbench for running and observing agents
- A local API that mediates models, tools, approvals, and persistence
- A desktop shell that keeps the workspace and runtime state on the user's machine
- A testable base for agent behavior, not just a chat UI

## Current Position

- Visibility: private GitHub repository only
- License: proprietary private incubation notice for now
- Distribution: do not publish public releases yet
- Intended users: project owner and trusted testers only
- Stability: prototype with real model calls, tools, approvals, settings, and installer basics, but not fully hardened

## Agent Contract

The most important product rule is that agent behavior must stay explicit and inspectable.

- Model providers can be swapped without changing the UI contract
- Tool calls must flow through the local API and approval queue
- Low-risk actions can be executed automatically when the runtime allows it
- High-risk actions must be approved before they write files, run shells, browse the web, or generate images
- Session state, settings, and diagnostics should remain local-first and recoverable
- New agent capabilities should be added with clear schemas, error handling, and tests

## What Is Included

- React + TypeScript workbench UI in `apps/web`
- Node + Express local API in `apps/server`
- Electron desktop shell in `apps/desktop`
- Shared app types and demo data in `packages/shared`
- Model center, streaming chat, agent tools, approval queue, built-in assistants, custom skills, and Windows packaging
- Provider management hardening, settings recovery, encrypted API key persistence, and copyable desktop diagnostics
- Private GitHub readiness docs and CI checks

## Quick Start

```bash
npm install
npm run dev
```

If your npm config omits dev dependencies, use:

```bash
npm install --include=dev
```

Open the web app at:

```text
http://127.0.0.1:5173
```

The API runs at:

```text
http://127.0.0.1:3939
```

The web app falls back to built-in demo data if the API is not running.

## Validation

Run type checks:

```bash
npm run typecheck
```

Run the settings persistence and encrypted secret smoke test:

```bash
npm run settings:smoke
```

Run the domestic provider defaults matrix check:

```bash
npm run provider:matrix
```

Run the desktop smoke test:

```bash
npm run desktop:smoke
```

Run the desktop user-data retention smoke test:

```bash
npm run desktop:retention-smoke
```

## Desktop App

Build and run the desktop app:

```bash
npm run desktop
```

Build the Windows installer:

```bash
npm run dist:win
```

The installer is written to `release/NexaDesk Setup 0.1.0.exe`. Desktop mode stores settings under Electron's user data directory and encrypts provider API keys at rest with a key protected by Electron `safeStorage`.

## Project Layout

```text
apps/
  desktop/       Electron shell, local data paths, secure desktop startup
  server/        Local API, event stream, agent runtime and tool approvals
  web/           Agent workbench UI
packages/
  shared/        Shared TypeScript types and default data
docs/
  architecture.md
  github-private.md
  private-backlog.md
  private-release-checklist.md
  provider-matrix.md
  roadmap.md
scripts/
  build-server.mjs
  desktop-smoke.mjs
  desktop-retention-smoke.mjs
  provider-matrix-check.mjs
  settings-persistence-smoke.mjs
  dev.mjs
```

## Roadmap Status

- Phase 1: Model center and real streaming model calls are in place
- Phase 2: Cowork agent tools and approval queue are in place
- Phase 3: Built-in assistants and editable skills are in place
- Phase 4: Desktop shell, user data directory, encrypted API key storage, settings layout, and Windows installer are in place
- Phase 5: Private GitHub repository readiness is complete
- Phase 6: Product usability hardening is complete
- Phase 7: Installer QA and agent-engine-shell polish are in progress

Automatic updates, app signing, deeper installer QA, full model-provider test coverage, and public open-source release work are intentionally left for later phases.