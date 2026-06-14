# ADR 0007 — Full native window app with TanStack Router in-app routing

- Status: Accepted
- Date: 2026-06-13
- Scope: codeman-agent V1.5 form factor
- Supersedes: ADR-0005 (tray + summoned window)
- Related: ADR-0001 (Tauri 2 + Solid.js shell), ADR-0003 (Effect-TS logic layer), ADR-0006 (Tailwind v4 utility styling)

## Context

V1 of codeman-agent was a tray-resident app with a frameless widget and a separate settings window. The tray was the only always-visible entry point; closing the widget hid it to the tray and the only way to quit was through the tray menu. This "summoned assistant" framing was designed for a quick-lookup tool, not a general-purpose LLM agent where users expect to have a window open during extended chat sessions.

During late V1 dogfooding, several problems became apparent. There is zero visible affordance to discover the app — the tray icon is silent until hovered. The frameless widget has no OS controls (no minimize/maximize/close buttons visible), making it feel unfamiliar to Windows users. The separate settings window was a heavy pattern — a distinct OS window just for settings creates IPC complexity and breaks the immersion of a single-app experience. Global hotkeys were reserved for V2 and provided no fallback discovery path in V1.

The product pivot for V1.5: ship as a normal Windows desktop app that lives in the taskbar, with a single main window holding both the chat and (via an in-app TanStack Router route) the settings view. This trades the "invisible until summoned" UX of V1 for a discoverable taskbar presence and standard window semantics. Users get a normal close-to-taskbar behavior; the only way to exit is via File→Quit.

## Decision

V1.5 ships as a **single native main window with a Tauri menu bar**:

- One window, label `main`, default 800×600, min 600×400, with OS decorations enabled (title bar + ─ □ ✕ buttons visible). The window is a normal taskbar app (`skipTaskbar: false`).
- The main window hosts a **TanStack Router** route tree with two routes:
  - `/` — chat view (the existing `ChatView` content + a bottom "Settings" link)
  - `/settings` — settings view (replaces main content; uses a back link to return to `/`)
- The Settings view is a route inside the main window, NOT a separate Tauri window. The previous separate `settings` Tauri window is removed.
- **Closing the main window (X button)** triggers `WindowEvent::CloseRequested`, which calls `prevent_close()` + `minimize()`. The window goes to the taskbar. The app process stays alive.
- **Exiting the app** goes through a native Tauri menu: `File → Quit (Ctrl+Q)`. This is the only place `app.exit(0)` is called.
- **No tray icon.** The previous tray (with dynamic idle/thinking/error state) is removed entirely. The window's taskbar presence replaces the tray's "always visible" role.
- **No global hotkeys.** The previous `tauri-plugin-global-shortcut` dependency is removed. In-app hotkeys (Enter to send, etc.) are not in V1.5 scope.
- The window position is still remembered via `tauri-plugin-window-state` (carried over from V1).
- `start_at_login` autostart is preserved (carried over from V1).
- The settings struct drops 3 V1 fields that no longer apply: `start_minimized`, `close_behavior`, `hotkeys`. The Rust `CloseBehavior` enum and `HotkeySettings` struct are deleted.

### Routing (TanStack Router)

We use **TanStack Router** (`@tanstack/solid-router`, code-based routing) for in-app navigation:
- `@tanstack/solid-router` 1.170.15 is current and Solid 1.9.3 compatible
- Code-based routing (no Vite plugin) — the route tree is built in `src/router.ts` with `createRootRoute` + 2 `createRoute` children
- `createBrowserHistory()` is the history implementation; Tauri 2 single-window + Vite SPA fallback handle the rest
- `RouterProvider` is mounted in `src/index.tsx` (replaces the previous direct `ChatView` mount)
- Route components live in `src/routes/`: `__root.tsx`, `index.tsx`, `settings.tsx`
- The bottom "Settings" link uses TanStack Router's `<A href="/settings">` component for active-state styling

## Considered options

- **G1 (rejected) — Keep V1 form factor (tray + summoned window), only add TanStack Router for the in-app settings route.** Minimal change, but does not address the core "no visible affordance / frameless window" problem. The user explicitly rejected this.
- **G2 (chosen) — Full native single-window app, with TanStack Router for in-app settings.** The main window is a normal taskbar app; settings is a route inside it. Closes use `prevent_close` + `minimize`; exit uses a File menu. No tray.
- **G3 (rejected) — Full native single-window app, settings remains a separate Tauri window.** Tried first, then folded into G2. Two windows add IPC complexity (cross-window state) and make the "replace main content for settings" UX impossible without a third window. The router is the cleaner abstraction.
- **G4 (rejected) — Full native app with a tab bar in the main window (Chat | Settings tabs).** Tabs work, but a full route per concern scales better as new views land (per-conversation routes, etc.).

For routing:
- **R1 (rejected) — Stay on hash-based routing (`location.hash`).** Already used in V1 (via `ChatView`). TanStack Router adds typed routes, `<A>` active-state, and nested layouts — none of which hash-based routing gives.
- **R2 (chosen) — TanStack Router (code-based).** Type-safe, active link styling, no Vite plugin needed. Bundle size is small (~15KB gzipped).
- **R3 (rejected) — `@solidjs/router` (the SolidStart-blessed router).** Simpler, smaller, but lacks type-safe routes, file-based routing ergonomics, and the broader TanStack ecosystem (start/table/etc. that V2 may want).
- **R4 (rejected) — File-based routing via `@tanstack/router-plugin` (Vite).** More idiomatic for larger apps, but adds a Vite plugin to maintain and a `routes/` directory layout to learn. Code-based is sufficient at V1.5 scale (2 routes).

## Consequences

- The main window is now visible in the Windows taskbar at all times when open. This trades V1's "invisible until summoned" UX for a discoverable app icon and a standard close-to-taskbar behavior.
- Closing the window no longer hides it to a tray; it minimizes to the taskbar. Users retrain from "click X to dismiss" to "click X to park". The File→Quit menu is the explicit exit path.
- The separate `settings` Tauri window is removed. The 5 IPC commands it relied on (`get_widget_position`, `set_widget_position`, `hide_widget_window`, `show_widget_window`, `show_settings_window`) are also removed. The 25 remaining IPC commands are unaffected.
- The `Settings` struct loses 3 V1 fields (`start_minimized`, `close_behavior`, `hotkeys`). The Rust `CloseBehavior` enum and `HotkeySettings` struct are deleted. Existing on-disk settings.json files will deserialize via `#[serde(default)]` for the remaining fields; the removed fields are simply ignored on load.
- The `tray.rs` and `hotkeys.rs` modules are deleted. `apply_autostart` is moved into `lib.rs`. Three tray `.ico` assets are removed.
- `tauri-plugin-global-shortcut` and the `tray-icon` Tauri feature are removed from `Cargo.toml`. The other 7 plugins (store, log, notification, autostart, window-state, opener, and tauri itself) stay.
- The `tauri-plugin-window-state` plugin (which remembers window position/size) is kept — relevant for a single main window that the user moves around.
- All 5 plugin capability entries that are now dead (`core:window:allow-hide`, `global-shortcut:allow-register`, `global-shortcut:allow-unregister`, `global-shortcut:allow-is-registered`) are removed from `capabilities/default.json`. The `windows` list shrinks from `["widget", "settings"]` to `["main"]`.
- Frontend changes (in a follow-up): `src/index.tsx` mounts `<RouterProvider>`; `src/router.ts` defines the route tree; `src/routes/__root.tsx` is the bare layout; `src/routes/index.tsx` wraps `ChatView` in a `ChatLayout` with a Sidebar and bottom "Settings" link; `src/routes/settings.tsx` is the full-page settings (extracted from the deleted `settings-modal.tsx`); the deleted `settings-modal.tsx` is replaced.
- The `ChatView` component is simplified: it no longer embeds `<Sidebar />` (now in the route layout) and no longer handles the `location.hash` route.
- A migration note for future maintainers: if a user updates from V1 to V1.5, their settings.json retains the 3 removed fields harmlessly (serde ignores unknown fields by default). The V1.5 settings panel no longer exposes them.
- A user can no longer "lose" the app: the taskbar icon is always present when the window is open, and the File→Quit menu is the only exit. This is a meaningful improvement over V1's tray-only discoverability.

## References

- TanStack Router for Solid: https://tanstack.com/router/latest/docs/framework/solid/overview
- TanStack Solid Router npm: https://www.npmjs.com/package/@tanstack/solid-router
- Tauri 2 menus: https://v2.tauri.app/learn/window-menu/
- Tauri 2 window APIs: https://v2.tauri.app/learn/window-customization/
- Tauri 2 minimize: see `tauri::Window::minimize` (WindowExt trait)
- ADR-0005 (the form factor this supersedes): `docs/adr/0005-tray-form-factor-no-hotkeys.md`
