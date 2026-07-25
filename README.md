# codeman-agent

Native Windows desktop AI agent with file system tools (DeepSeek, MiniMax).

## Stack

Electron 43 + Solid.js 1.9 + TypeScript 7 + Effect-TS 3 + Vite 8 + TanStack Router (code-based).

## Development

```bash
vp run install      # or: pnpm install
vp run dev          # electron-vite dev (auto-clears ports 1420 1421)
vp run test         # vitest --run
vp run typecheck    # tsc --noEmit (web + node)
vp run typecheck:web
vp run typecheck:node
vp run typecheck:e2e
vp run lint         # oxlint
vp run e2e          # Playwright + real Electron
```

## Build

```bash
vp run build:win    # NSIS + MSI x64
vp run build:dir    # unpacked dev build
```

Auto-update configured via `dev-app-update.yml` + `electron-updater` (see `docs/adr/0026-config-vs-template.md`).
