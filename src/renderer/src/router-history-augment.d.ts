//! Module augmentation: extend TanStack Router's HistoryState to support
//! passing the entry-page URL across navigations into settings.
//!
//! Without this, `<Link state={...}>` and `navigate({ state: ... })` reject any
//! custom field (only `__tempLocation` / `__tempKey` / `__hashScrollIntoViewOptions`
//! are allowed in the base `HistoryState` interface from `@tanstack/history`).
//! Adding `from` here lets chat-sidebar pass the previous pathname to
//! settings-sidebar so its "Back" button returns to the right page instead of
//! the previous settings subpage (e.g. /settings/llm).
//!
//! This file MUST stay an ambient script (no top-level `import` or `export`)
//! for the `declare module` augmentation to apply.

declare module "@tanstack/history" {
  interface HistoryState {
    /** Pathname of the page the user was on before navigating with this state. */
    from?: string;
  }
}
