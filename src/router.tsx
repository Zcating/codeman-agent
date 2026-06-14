//! Router — TanStack Router configuration.
//!
//! Code-based routing (no Vite plugin). Two routes:
//! - /          → ChatLayout (Sidebar + ChatView + bottom Settings link)
//! - /settings  → SettingsPage (full-page settings, replaces main content)
//!
//! History: `createBrowserHistory()` — Tauri 2 single window + Vite
//! SPA fallback handles deep linking natively.

import { createRouter, createRoute, createRootRoute, Outlet } from "@tanstack/solid-router";
import { ChatLayout } from "./routes/index";
import { SettingsPage } from "./routes/settings";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ChatLayout,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

export const routeTree = rootRoute.addChildren([indexRoute, settingsRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router;
  }
}
