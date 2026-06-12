# ADR 0005 — Tray + summoned window, no hotkeys in V1

- Status: Accepted
- Date: 2026-06-13
- Scope: codeman-agent V1 form factor
- Supersedes: implicit V0 form factor (280×100 always-on-top
  floating widget) — V1 abandons that frame entirely.
- Related: ADR 0001 (Tauri 2 + Solid.js shell)

## Context

V0 of codeman-agent was a 280×100 always-on-top floating widget
that displayed a single billing snapshot. The product pivot
(general LLM agent, see CONTEXT.md) makes that form factor
obsolete: a multi-turn chat with tool calls and streaming
output needs real screen real estate, and a tiny widget
permanently on top of every window is hostile to a desktop
where the user is also using other apps.

We need a V1 form factor that:
- Does not occupy a fixed chunk of screen at all times.
- Is summonable in a single action from anywhere.
- Plays well with multi-monitor setups and DPI scaling.
- Reads as a coherent product, not a system tray clone of
  ChatGPT desktop.

## Decision

V1 ships as a **system tray app with a summoned window** (the
"F1" form factor):
- A pixel-art tray icon (the "G2" aesthetic) sits in the
  Windows notification area at all times.
- Clicking the tray icon toggles a single main window
  (default 800×600, min 600×400, position remembered).
- Closing the window hides it to the tray; the app keeps
  running. The tray is the "real" home.
- The tray icon is **dynamic** ("T2"): it shows idle /
  thinking / error state, with a pulse animation while the
  agent is working.
- V1 ships with **zero hotkeys** (option B in the design
  conversation). All actions go through the mouse: tray
  click to toggle, button click to send, button click to
  open settings. `tauri-plugin-global-shortcut` stays in
  dependencies for V2; the `hotkeys` settings field is
  reserved but not user-editable in V1.
- Settings is a tabbed modal over the main window: LLM /
  App / Window / Billing / Advanced.

## Considered options

- **F1 (chosen) — tray + summoned window.** Frees the UI
  from the 280×100 design tax. Familiar pattern (Slack,
  Discord, Spotify). Plays well with multi-monitor.
- **F2 — Spotlight / command bar.** Rejected. Cannot host
  multi-turn conversation, tool call visualisation, or
  code blocks. Wrong tool for a "general" agent.
- **F3 — sidebar / drawer.** Rejected. Cross-monitor
  behaviour is poor, occupies a fixed screen edge, and
  adds animation complexity.
- **F4 — Tauri webview wrapper around pi-web.** Rejected.
  Functionally identical to F1 but loses the chance to
  design the in-app UI to fit the product.

For the tray icon:
- **T1 (rejected)** — static icon. Misses the chance to
  surface agent state without occupying extra screen.
- **T2 (chosen)** — dynamic icon reflecting agent state.
  Tells the user at a glance whether the agent is
  working, idle, or in an error state.
- **T3 (rejected)** — static icon plus numeric badge.
  IM-style unread counter is wrong metaphor for an agent.

For the icon style:
- **G1 (rejected)** — geometric / Solid-aligned. Clean but
  generic.
- **G2 (chosen)** — pixel art. Distinctive on a tray full
  of flat modern icons; matches the "small, focused, sysadmin-
  adjacent" target user. 16×16 / 32×32 / 256×256 ICO frames.
- **G3 (rejected)** — text logo. Brand name changes force
  redraws; less recognisable at small sizes.

For hotkeys in V1:
- **A (rejected)** — keep fixed in-app hotkeys (Enter to
  send, Shift+Enter newline, Ctrl+F search). Standard but
  conflicts with the "V1 is mouse-driven" decision below.
- **B (chosen)** — zero hotkeys. V1 is fully mouse-driven.
  Every action has a button. `tauri-plugin-global-shortcut`
  stays in dependencies for V2; the V2 plan adds the three
  global hotkeys (toggle window, new conversation, open
  settings) plus restoring the in-app fixed hotkeys.

## Consequences

- The product framing shifts from "always-visible dashboard"
  to "summoned assistant". Users must retrain their habit
  loop. The Settings UI surfaces this in a one-time
  onboarding note (V1 ships without formal onboarding;
  the tray icon's tooltip carries the hint).
- `src-tauri/Cargo.toml` keeps `tauri-plugin-global-shortcut`
  but V1 code does not call it. PRs that "clean up" the
  unused plugin will be rejected.
- The settings schema's `hotkeys` field is present (default
  values: `Ctrl+Alt+A`, `Ctrl+N`, `Ctrl+,`) but the V1 UI
  shows it as a read-only deprecated section.
- The main window's WebView is the only place Solid renders.
  No always-on-top windows; no transparent regions; no
  click-through. The user moves the window like any
  standard app window.
- A user can still lose the window: right-click tray icon
  → Show toggles it back. (There is no "minimise to system
  tray" taskbar entry by design — the tray icon *is* the
  taskbar entry.)

## References

- Tauri tray icon API:
  https://v2.tauri.app/learn/window-customization/#tray-icon
- `tauri-plugin-global-shortcut`:
  https://v2.tauri.app/plugin/global-shortcut/
