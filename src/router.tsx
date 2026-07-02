//! Router — TanStack Router configuration (V2.2).
//!
//! Code-based routing (no Vite plugin). Route structure:
//! - /              → ChatLayout → HomeRoute (HomeAgentForm)
//! - /conversation/$convId → ChatLayout → ConversationRoute (ChatView + back)
//! - /settings      → SettingsPage
//!
//! V3 e2e patch: exposes `window.__router` so cdp-driver.ts::goto can call
//! `router.navigate({ to: path })` directly (bypasses `history.pushState`
//! which on file:// URLs can't update the absolute Windows path).

import { createRouter, createRoute, createRootRoute, Outlet } from "@tanstack/solid-router";
import { ChatLayout, HomeRoute, ConversationRoute } from "./features/chat/routes/index";
import { SettingsPage } from "./features/settings/routes/settings";

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

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

export const routeTree = rootRoute.addChildren([
  chatLayoutRoute.addChildren([homeRoute, conversationRoute]),
  settingsRoute,
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
