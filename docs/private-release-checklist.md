# Private Release Checklist

Use this before pushing to the private GitHub repository or sharing an installer with trusted testers.

## Code Health

- [ ] `npm install --include=dev`
- [ ] `npm run typecheck`
- [ ] `npm run settings:smoke`
- [ ] `npm run desktop:smoke`
- [ ] `npm run desktop:retention-smoke`
- [ ] `npm run dist:win`

## Privacy And Secrets

- [ ] No real API keys in tracked files.
- [ ] No `data/*.json` committed.
- [ ] No `.env` or `.env.local` committed.
- [ ] Provider API keys are stored only through encrypted desktop/server secrets.
- [ ] `release/` remains ignored unless you intentionally upload an installer artifact.

## Product QA

- [ ] Installed app opens without a blank window.
- [ ] Window title, installer name, shortcut, and uninstall entry show NexaDesk.
- [ ] Provider settings survive restart.
- [ ] API key state survives restart without exposing the key in the UI.
- [ ] Reinstall or upgrade keeps the same Electron user data directory.
- [ ] Uninstall choice is understood: default uninstall may leave user data; manual data cleanup must be deliberate.
- [ ] Settings page categories render and scroll correctly.
- [ ] High-risk tools enter the approval queue.

## GitHub

- [ ] Repository visibility is Private.
- [ ] Branch protection can be added after the first push.
- [ ] CI passes on `main`.
- [ ] No public Release is created yet.
