//! SettingsSidebar — settings-domain wrapper for the universal CodemanSidebar.
//!
//! 4 flat nav items: LLM / App / Window / Advanced. URL is single source of
//! truth: `currentValue` derived from `/settings/$tab` route param.
//! `onItemSelect` navigates to `/settings/{value}`.
//!
//! Renders `<Outlet />` inside CodemanSidebar's children slot — this makes
//! SettingsSidebar the layout component (the router uses it directly as
//! `/settings` route's `component`).

import { type JSX } from "solid-js";
import { Outlet, useLocation, useNavigate, useParams } from "@tanstack/solid-router";
import {
  ArrowLeft,
  Brain,
  SlidersHorizontal,
  AppWindow,
  Terminal,
  Sparkles,
  Server,
} from "lucide-solid";
import {
  CodemanSidebar,
  type SidebarOption,
} from "../../../shared/components/internal/codeman-sidebar";

/**
 * Static config for the 6 settings nav items.
 * Tab icons chosen per V2.5 design:
 * - LLM       → Brain       (mental model: AI configuration)
 * - App       → SlidersHorizontal (behavior toggles)
 * - Window    → AppWindow   (window sizing)
 * - Skills    → Sparkles    (V3.1 ADR-0031 Skills plugin)
 * - MCP       → Server      (V3.1 ADR-0032 MCP client)
 * - Advanced  → Terminal    (danger zone, low-level)
 */
const SETTINGS_NAV: readonly SidebarOption[] = [
  { label: "LLM", value: "llm", icon: <Brain class="h-4 w-4" aria-hidden="true" /> },
  {
    label: "App",
    value: "app",
    icon: <SlidersHorizontal class="h-4 w-4" aria-hidden="true" />,
  },
  {
    label: "Window",
    value: "window",
    icon: <AppWindow class="h-4 w-4" aria-hidden="true" />,
  },
  {
    label: "Skills",
    value: "skills",
    icon: <Sparkles class="h-4 w-4" aria-hidden="true" />,
  },
  {
    label: "MCP",
    value: "mcp",
    icon: <Server class="h-4 w-4" aria-hidden="true" />,
  },
  {
    label: "Advanced",
    value: "advanced",
    icon: <Terminal class="h-4 w-4" aria-hidden="true" />,
  },
];

export function SettingsSidebar(): JSX.Element {
  const navigate = useNavigate();
  // Read `from` from router state — the chat sidebar's "设置" link passes
  // `state={{ from: location.pathname }}` so the Back button returns to
  // the page the user was on before entering settings (e.g. /conversation/c-1)
  // instead of a settings subpage (e.g. /settings/llm).
  const location = useLocation();
  // TanStack Router's `useParams` returns a typed accessor; we read `tab`
  // with a single cast through a named alias (instead of `as unknown as`)
  // so the type narrows consistently for downstream consumers.
  type SettingsParams = { tab?: string };
  const params = useParams({ strict: false });
  const currentTab = (): string | undefined =>
    (params() as SettingsParams).tab;

  const renderItem = (item: SidebarOption): JSX.Element => (
    <div class="flex items-center gap-2 min-w-0">
      {item.icon}
      <span class="truncate">{item.label}</span>
    </div>
  );

  const handleSelect = (value: string): void => {
    navigate({ to: `/settings/${value}` });
  };

  const handleBack = (): void => {
    const state = location().state as { from?: string } | undefined;
    // Fallback to "/" when no `from` is set (deep-link entry, browser refresh,
    // or direct URL paste). Don't use window.history.back() because that
    // would land on a settings subpage if the user has navigated between tabs.
    const target = state?.from ?? "/";
    navigate({ to: target });
  };

  return (
    <CodemanSidebar
      options={[...SETTINGS_NAV]}
      renderItem={renderItem}
      currentValue={currentTab()}
      onItemSelect={handleSelect}
      header={
        <h2 class="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Settings
        </h2>
      }
      class="border-r border-sidebar-border"
      footer={
        <button
          type="button"
          onClick={handleBack}
          class="hover:text-foreground transition-colors flex items-center gap-1 px-2 py-1 -mx-2 -my-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          <ArrowLeft class="h-3.5 w-3.5" aria-hidden="true" />
          <span>Back</span>
        </button>
      }
    >
      <Outlet />
    </CodemanSidebar>
  );
}