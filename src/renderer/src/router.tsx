
import {
  createRouter,
  createRoute,
  createRootRoute,
  Outlet,
  redirect,
} from "@tanstack/solid-router";
import { ChatLayout, HomeRoute, ConversationRoute } from "@codeman-frontend/features/chat/routes/index";
import { SettingsSidebar } from "@codeman-frontend/features/settings/components/settings-sidebar";
import { LlmSection } from "@codeman-frontend/features/settings/routes/sections/llm-section";
import { AppSection } from "@codeman-frontend/features/settings/routes/sections/app-section";
import { WindowSection } from "@codeman-frontend/features/settings/routes/sections/window-section";
import { AdvancedSection } from "@codeman-frontend/features/settings/routes/sections/advanced-section";
import { SkillsSection } from "@codeman-frontend/features/settings/routes/sections/skills-section";
import { McpSection } from "@codeman-frontend/features/settings/routes/sections/mcp-section";
import { SettingsTab as MultiAgentsSettingsTab } from "@codeman-frontend/plugins/multi-agents/components/settings-tab";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  errorComponent: (err) => {
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

const pluginsSkillsRoute = createRoute({
  getParentRoute: () => chatLayoutRoute,
  path: "/plugins/skills",
  component: SkillsSection,
});

const pluginsMcpRoute = createRoute({
  getParentRoute: () => chatLayoutRoute,
  path: "/plugins/mcp",
  component: McpSection,
});

const pluginsMultiAgentsRoute = createRoute({
  getParentRoute: () => chatLayoutRoute,
  path: "/plugins/multi-agents",
  component: MultiAgentsSettingsTab,
});


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
  beforeLoad: () => {
    throw redirect({ to: "/plugins/skills", replace: false });
  },
});

const settingsMcpRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: "mcp",
  beforeLoad: () => {
    throw redirect({ to: "/plugins/mcp", replace: false });
  },
});

export const routeTree = rootRoute.addChildren([
  chatLayoutRoute.addChildren([homeRoute, conversationRoute, pluginsSkillsRoute, pluginsMcpRoute, pluginsMultiAgentsRoute]),
  settingsLayoutRoute.addChildren([
    settingsLlmRoute,
    settingsAppRoute,
    settingsWindowRoute,
    settingsSkillsRoute,
    settingsMcpRoute,
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