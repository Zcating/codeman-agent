









import { type JSX } from "solid-js";
import { Outlet, useLocation, useNavigate, useParams } from "@tanstack/solid-router";
import {
  ArrowLeft,
  Brain,
  SlidersHorizontal,
  AppWindow,
  Terminal,
} from "lucide-solid";
import {
  CodemanSidebar,
  type CodemanSidebarGroupOption,
  type CodemanSidebarMenuGroupOption,
  type CodemanSidebarMenuOption,
} from "@codeman-frontend/shared/components/internal/codeman-sidebar";


const SETTINGS_NAV: readonly CodemanSidebarMenuOption[] = [
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
  
  
  
  
  const location = useLocation();
  
  
  
  type SettingsParams = { tab?: string };
  const params = useParams({ strict: false });
  const currentTab = (): string | undefined =>
    (params() as SettingsParams).tab;

  const renderMenuGroup = (item: CodemanSidebarMenuGroupOption): JSX.Element => (
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
    
    
    
    const target = state?.from ?? "/";
    navigate({ to: target });
  };

  const options: CodemanSidebarGroupOption[] = [
    {
      label: "Settings",
      value: "settings",
      
      
      children: SETTINGS_NAV.map(tab => ({
        label: tab.label,
        value: tab.value,
        icon: tab.icon,
      })),
    },
  ];

  return (
    <CodemanSidebar
      options={options}
      renderMenuGroup={renderMenuGroup}
      currentValue={currentTab()}
      onMenuSelect={handleSelect}
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
