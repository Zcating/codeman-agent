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
import { Outlet, useNavigate, useParams } from "@tanstack/solid-router";
import {
  Brain,
  SlidersHorizontal,
  AppWindow,
  Terminal,
} from "lucide-solid";
import {
  CodemanSidebar,
  type SidebarOption,
} from "../../../shared/components/internal/codeman-sidebar";

/**
 * Static config for the 4 settings nav items.
 * Tab icons chosen per V2.5 design:
 * - LLM       → Brain       (mental model: AI configuration)
 * - App       → SlidersHorizontal (behavior toggles)
 * - Window    → AppWindow   (window sizing)
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
    label: "Advanced",
    value: "advanced",
    icon: <Terminal class="h-4 w-4" aria-hidden="true" />,
  },
];

export function SettingsSidebar(): JSX.Element {
  const navigate = useNavigate();
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

  return (
    <CodemanSidebar
      options={[...SETTINGS_NAV]}
      renderItem={renderItem}
      currentValue={currentTab()}
      onItemSelect={handleSelect}
      sidebarHeader={
        <h2 class="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Settings
        </h2>
      }
      class="border-r border-sidebar-border"
    >
      <Outlet />
    </CodemanSidebar>
  );
}