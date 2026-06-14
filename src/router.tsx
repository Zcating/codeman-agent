//! Router — TanStack Router 配置。
//!
//! 代码路由（无 Vite 插件）。两个路由：
//! - /          → ChatLayout（Sidebar + ChatView + 底部 Settings 链接）
//! - /settings  → SettingsPage（全页面设置，替换主内容）
//!
//! 历史记录：`createBrowserHistory()` — Tauri 2 单窗口 + Vite
//! SPA fallback 原生处理深度链接。

import { createRouter, createRoute, createRootRoute, Outlet } from "@tanstack/solid-router";
import { ChatLayout } from "./features/chat/routes/index";
import { SettingsPage } from "./features/settings/routes/settings";

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
