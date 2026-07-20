//! Router — TanStack Router configuration (V2.2).
//!
//! Code-based routing (no Vite plugin). Route structure:
//! - /              → ChatLayout → HomeRoute (HomeAgentForm)
//! - /conversation/$convId → ChatLayout → ConversationRoute (ChatView + back)
//! - /settings      → SettingsSidebar (layout) → 4 child sections
//!   - /settings/llm       → LlmSection
//!   - /settings/app       → AppSection
//!   - /settings/window    → WindowSection
//!   - /settings/advanced  → AdvancedSection
//!
//! `/settings` (no tab) → redirect to `/settings/llm` via `beforeLoad`.
//!
//! V3 e2e patch: exposes `window.__router` so cdp-driver.ts::goto can call
//! `router.navigate({ to: path })` directly (bypasses `history.pushState`
//! which on file:// URLs can't update the absolute Windows path).

import {
  createRouter,
  createRoute,
  createRootRoute,
  Outlet,
  redirect,
} from "@tanstack/solid-router";
import { ChatLayout, HomeRoute, ConversationRoute } from "./features/chat/routes/index";
import { SettingsSidebar } from "./features/settings/components/settings-sidebar";
import { LlmSection } from "./features/settings/routes/sections/llm-section";
import { AppSection } from "./features/settings/routes/sections/app-section";
import { WindowSection } from "./features/settings/routes/sections/window-section";
import { AdvancedSection } from "./features/settings/routes/sections/advanced-section";
import { SkillsSection } from "./features/settings/routes/sections/skills-section";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  errorComponent: (err) => {
    // Debug-friendly error UI. Production should be replaced with a proper
    // error page; this surfaces stacktraces for e2e diagnostics.
    const e = (err as { error?: unknown })?.error;
    const msg =
      e instanceof Error
        ? e.message
        : typeof e === "object" && e !== null
          ? JSON.stringify(e)
          : String(e ?? "(no error)");
    const stack = e instanceof Error ? e.stack : "(no stack)";
    return (
      <div style={{ padding: "1rem", color: "red", "font-family": "monospace" }}>
        <h2>Router error</h2>
        <pre>{msg}</pre>
        <pre>{stack}</pre>
      </div>
    );
  },
});

const chatLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "chat",
  component: ChatLayout,
  errorComponent: (err) => {
    const e = err.error;
    const msg = e instanceof Error ? e.message : typeof e === "object" && e !== null ? JSON.stringify(e) : String(e);
    const stack = e instanceof Error ? e.stack : "(no stack)";
    return (
      <div style={{ padding: "1rem", color: "orange", "font-family": "monospace" }}>
        <h2>ChatLayout error</h2>
        <pre>{msg}</pre>
        <pre>{stack}</pre>
      </div>
    );
  },
});

const homeRoute = createRoute({
  getParentRoute: () => chatLayoutRoute,
  path: "/",
  component: HomeRoute,
});

const conversationRoute = createRoute({
  getParentRoute: () => chatLayoutRoute,
  path: "/conversation/$convId",
  component: ConversationRoute,
});

// ─── Settings nested routes (ADR-0030 D8) ────────────────────────────────
//
// Parent route uses `path: "/settings"` + `beforeLoad` redirect — this is
// the canonical TanStack Router pattern that lights up SettingsSidebar on
// every `/settings/*` URL. (Plan-agent Q1: confirmed ADR-0030 wins over
// the `id: "settings"` alternative — that variant doesn't auto-mount
// the layout on /settings/* paths.)

const settingsLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsSidebar,
  beforeLoad: ({ location }) => {
    if (location.pathname === "/settings") {
      throw redirect({ to: "/settings/llm", replace: true });
    }
  },
});

const settingsLlmRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: "llm",
  component: LlmSection,
});

const settingsAppRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: "app",
  component: AppSection,
});

const settingsWindowRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: "window",
  component: WindowSection,
});

const settingsAdvancedRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: "advanced",
  component: AdvancedSection,
});

const settingsSkillsRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: "skills",
  component: SkillsSection,
});

export const routeTree = rootRoute.addChildren([
  chatLayoutRoute.addChildren([homeRoute, conversationRoute]),
  settingsLayoutRoute.addChildren([
    settingsLlmRoute,
    settingsAppRoute,
    settingsWindowRoute,
    settingsSkillsRoute,
    settingsAdvancedRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

if (typeof window !== "undefined") {
  (window as unknown as { __router?: typeof router }).__router = router;
}

declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router;
  }
}