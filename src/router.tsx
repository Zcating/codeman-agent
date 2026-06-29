//! Router — TanStack Router configuration (V2.2).
//!
 //! Code-based routing (no Vite plugin). Route structure:
 //! - /              → ChatLayout → HomeRoute (HomeAgentForm)
 //! - /conversation/$convId → ChatLayout → ConversationRoute (ChatView + back)
 //! - /settings      → SettingsPage
 //!
 //! History: createBrowserHistory() — Tauri 2 single window + Vite SPA fallback.

import { createRouter, createRoute, createRootRoute, Outlet } from "@tanstack/solid-router";
import { ChatLayout, HomeRoute, ConversationRoute } from "./features/chat/routes/index";
import { SettingsPage } from "./features/settings/routes/settings";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const chatLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "chat",
  component: ChatLayout,
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

declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router;
  }
}
