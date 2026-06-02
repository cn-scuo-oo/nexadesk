# NexaDesk

NexaDesk is a private incubation build of a multi-agent desktop workbench. It is not ready for public users yet. The current goal is to keep the project safe in a private GitHub repository, preserve the development history, and make every future phase easier to test.

The product direction is a local-first cowork space where users can run assistants, inspect tool activity, manage model providers, approve risky actions, and keep workspace context visible.

## Current Status

- Visibility: private GitHub repository only.
- License: proprietary private incubation notice for now.
- Distribution: do not publish public releases yet.
- Intended users: project owner and trusted testers only.
- Stability: product prototype with real model calls, tools, approvals, settings, and installer basics, but not fully tested.

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

Run the domestic Provider defaults matrix check:

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

## Phase Status

- Phase 1: Model center and real streaming model calls are in place.
- Phase 2: Cowork Agent tools and approval queue are in place.
- Phase 3: Built-in assistants and editable skills are in place.
- Phase 4: Desktop shell, user data directory, encrypted API key storage, settings layout, and Windows installer are in place.
- Phase 5: Private GitHub repository readiness is complete.
- Phase 6: Product usability hardening is in progress, including Provider management, settings recovery, diagnostics, and local runtime state persistence.

Automatic updates, app signing, deeper installer QA, full model-provider test coverage, and public open-source release work are intentionally left for later phases.
