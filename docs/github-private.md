# Private GitHub Setup

NexaDesk should be pushed to a private GitHub repository for now. It is not ready for public open-source release.

## Repository Visibility

- Create the GitHub repository as **Private**.
- Do not add a public GitHub Release yet.
- Do not publish installers outside trusted testing.
- Keep Issues and Discussions disabled unless you want to track private tasks there.

## Recommended First Push

```bash
git init
git add .
git commit -m "Prepare NexaDesk private incubation repo"
git branch -M main
git remote add origin https://github.com/<owner>/<private-repo>.git
git push -u origin main
```

Replace `<owner>/<private-repo>` with your real private GitHub repository path.

## What Should Not Be Committed

- `.env` and `.env.*` files
- `data/*.json`
- `release/`
- `node_modules/`
- `*.log`
- generated local screenshots
- real API keys or provider secrets

## Before Making The Repository Public Later

- Replace the private `LICENSE` with the chosen open-source license.
- Remove private-only wording from `README.md`.
- Add public contribution and security policies.
- Audit generated assets and dependencies.
- Run the full release checklist in `docs/private-release-checklist.md`.
