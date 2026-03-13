# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend / Electron (root)
```bash
npm run electron:dev       # Start dev mode: Vite (port 5173) + Electron with hot reload
npm run build:electron     # Compile TypeScript in electron/ → dist-electron/
npm run electron:dist      # Full production build → macOS DMG/ZIP in dist-electron/
npm run lint               # ESLint
```

### Backend (separate process, separate directory)
```bash
cd backend && npm run dev  # Start Express API server with --watch (port 3000)
cd backend && npm start    # Production start
```

There are no automated tests — the backend `test` script is a placeholder.

### Build pipeline detail
`build:electron` runs two `tsc` compilations (main + preload tsconfigs) then renames `preload.js` → `preload.cjs`. This rename **must happen** before running Electron. The `electron:dev` script handles this automatically.

## Architecture

### Process Model
Three separate runtime processes:

1. **Electron main** (`electron/main.ts` → `dist-electron/main.js`) — Node.js process. Manages the BrowserWindow, handles IPC, file I/O, and file watching. All filesystem and git operations run here.

2. **Renderer / React** (`src/`) — Runs in the Electron BrowserWindow. Uses `HashRouter` (required for Electron's file:// protocol). Communicates with the main process exclusively through `window.electronAPI`.

3. **Express backend** (`backend/server.js`) — Separate Node.js process. Handles AWS S3 presigned URLs, Stripe webhooks, and email invites via SES. The frontend calls this over HTTP at `localhost:3000`.

### IPC Bridge
`electron/preload.ts` defines the `window.electronAPI` surface via `contextBridge`. The frontend wrapper is `src/lib/desktop-api.ts`. When adding new IPC channels: define handler in `electron/main.ts`, expose in `electron/preload.ts`, wrap in `src/lib/desktop-api.ts`.

### State Management
Four React Contexts wrap the entire app (see nesting order in `src/App.tsx`):
- **AuthContext** — Supabase auth session, payment plan, Google OAuth
- **RecentProjectsContext** — Recent file list (persisted in localStorage)
- **VersionControlContext** — Commit tree, branches, cloud sync state; the core domain logic
- **ModelContext** — Loaded 3D model geometry and Three.js scene state

`VersionControlContext` is the most complex: it owns the commit tree (a JSON structure persisted locally via IPC to `.0studio/` inside the project folder), branch management, gallery mode (compare up to 4 versions), and cloud sync to S3/Supabase.

### Commit Storage (two layers)
- **Local**: `.0studio/commits/<commitId>.3dm` + `.0studio/tree.json` written by `FileStorageService` in `electron/services/file-storage-service.ts` via IPC.
- **Cloud**: S3 via presigned URLs (browser uploads directly to S3). Metadata recorded in Supabase. Orchestrated by `src/lib/cloud-sync-service.ts`.

### TypeScript compilation split
- `tsconfig.json` — compiles `src/` (Vite handles this at build time)
- `electron/tsconfig.json` — compiles `electron/main.ts` and services
- `electron/preload-tsconfig.json` — compiles `electron/preload.ts` separately (outputs CJS)

Path alias `@/` maps to `src/` in all configs.

### Backend endpoints
All routes require a Supabase JWT in the `Authorization: Bearer` header except Stripe webhooks.
- `GET  /api/s3/presigned-url` — upload URL for a commit file
- `GET  /api/s3/download-url` — download URL for a commit file
- `POST /api/stripe/webhook` — Stripe event handler (raw body required)
- `GET  /api/stripe/payment-status` — check user subscription
- `POST/GET /api/projects` — project CRUD
- `POST/GET /api/invites/:projectId` — sharing invites
- `POST /api/invites/:inviteId/accept` — accept invite (resolves pending invites on auth)
