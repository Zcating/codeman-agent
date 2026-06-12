# ADR 0001 — Tauri 2 + Solid.js

- Status: Accepted
- Date: 2026-06-09
- Scope: codeman-agent v1 client stack

## Context

codeman-agent ships as a single tiny always-on-top floating widget plus a
modal settings window on Windows. The codebase needs to:

1. Draw a small (~280x100) frameless window, drag it across monitors, and
   keep it pinned above other apps.
2. Hit provider REST endpoints on a timer, parse JSON, hold the result in
   memory, and push updates to the UI as they land.
3. Store API keys in Windows Credential Manager and other settings in a
   plain JSON file under app data.
4. Surface system notifications when balance / quota drops below a
   threshold.
5. Ship as an MSI / NSIS installer without bringing a Chromium runtime
  per user.

## Decision

Use **Tauri 2 (Rust)** for the shell and **Solid.js + TypeScript** for
the UI, built with Vite.

### Why Tauri

- Native Windows window controls (frameless, always-on-top, skip-taskbar)
  without writing Win32 code by hand.
- First-class plugins for the cross-cutting needs we already have:
  - `tauri-plugin-store` for settings JSON
  - `tauri-plugin-global-shortcut` for hotkeys
  - `tauri-plugin-notification` for system notifications
  - `tauri-plugin-autostart` for run-at-login
  - `tauri-plugin-log` for log rotation
- The Rust side is the natural home for secrets (`keyring` crate to
  Windows Credential Manager) and HTTP polling (`reqwest` + `tokio`).

### Why Solid.js

- A 280x100 widget has a tiny DOM. Solid's fine-grained reactivity
  matches that scale: no VDOM, no re-render churn, signals map directly
  onto the four pieces of state we care about (`snapshot`,
  `lastUpdated`, `isStale`, `isRefreshing`).
- TypeScript-first; aligns with the typed Rust IPC contract.
- Smaller runtime than React/Vue, which matters for a widget that boots
  on every login.

### Why not...

- **Electron** - ships a per-user Chromium, hurts install size and boot
  time for a single tiny widget.
- **Wails / Go** - weaker story for Windows-native window decorations and
  global shortcuts in v1.
- **Pure Win32 + WinUI** - too much boilerplate for v1 scope; Tauri
  already gives us the native plumbing we need.

## Consequences

- Two-language toolchain (Rust + TypeScript). Mitigated by typed IPC
  commands on both sides (`serde::Serialize` / `Deserialize` mirrors
  TypeScript interfaces in `src/lib/tauri.ts`).
- Windows-first. The Linux/macOS ports are Tauri-portable but
  out-of-scope for v1.
- We commit to `tauri-plugin-store` JSON semantics for settings; if we
  ever need a richer store we revisit in a separate ADR.

## References

- Tauri 2 docs: https://v2.tauri.app/
- Solid.js: https://www.solidjs.com/
- `keyring` crate: https://docs.rs/keyring/
