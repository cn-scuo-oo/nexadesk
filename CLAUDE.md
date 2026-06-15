# NexaDesk Development Guide

## Project Structure
`
nexadesk/
鈹溾攢鈹€ apps/
鈹?  鈹溾攢鈹€ web/          # React + Vite frontend
鈹?  鈹?  鈹溾攢鈹€ src/
鈹?  鈹?  鈹?  鈹溾攢鈹€ components/   # Reusable UI components
鈹?  鈹?  鈹?  鈹溾攢鈹€ views/        # Page-level views
鈹?  鈹?  鈹?  鈹斺攢鈹€ lib/          # Utilities, constants, i18n
鈹?  鈹溾攢鈹€ server/       # Express + tsx backend
鈹?  鈹?  鈹斺攢鈹€ src/      # Route modules, engines, stores
鈹?  鈹斺攢鈹€ desktop/      # Electron shell
鈹溾攢鈹€ packages/
鈹?  鈹斺攢鈹€ shared/       # Shared types, defaults, utils
鈹溾攢鈹€ scripts/          # Build and dev scripts
鈹斺攢鈹€ docs/             # Documentation
`

## Key Commands
- 
pm run dev - Start dev server + web
- 
pm run dev:server - Server only
- 
pm run dev:web - Web only
- 
pm run build - Production build
- 
pm run typecheck - TypeScript check all workspaces
- 
pm run test - Run tests

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
- ESM modules throughout (.js extensions in imports)
- Barrel exports (index.ts) for module re-exports
- Component props defined as inline interfaces

## File Naming
- React components: PascalCase.tsx
- Utility modules: kebab-case.ts
- Route modules: register*Routes pattern
- Test files: *.test.ts