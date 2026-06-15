# NexaDesk Development Guide

## Project Structure
```
nexadesk/
├── apps/
│   ├── web/          # React + Vite frontend
│   ├── server/       # Express + tsx backend
│   └── desktop/      # Electron shell
├── packages/
│   └── shared/       # Shared types, defaults, utils
├── scripts/          # Build and dev scripts
└── docs/             # Documentation
```

## Key Commands
- `npm run dev` - Start dev server + web
- `npm run typecheck` - TypeScript check all workspaces
- `npm run test` - Run tests
- `npm run build` - Production build

## Architecture Decisions
- **Monorepo**: npm workspaces with packages/shared, apps/web, apps/server
- **Backend**: Express.js with tsx for TypeScript execution
- **Frontend**: React 19 + Vite + Tailwind CSS
- **State**: Redux Toolkit (web) + runtime state store (server)
- **Markdown**: react-markdown with KaTeX + Mermaid
- **Charts**: Recharts for runtime dashboard
- **UI**: Headless UI + Heroicons + Lucide React

## Code Style
- TypeScript strict mode
- ESM modules throughout (.js in imports)
- Barrel exports (index.ts) for module re-exports
- Component props defined as inline interfaces
