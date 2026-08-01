
import { For, Show, type JSX, createSignal, createEffect } from "solid-js";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@codeman-frontend/shared/components/ui/accordion";
import { cn } from "@codeman-frontend/shared/lib/cn";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarInset,
} from "@codeman-frontend/shared/components/ui/sidebar";
import { useSplitterContext } from "@ark-ui/solid/splitter";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@codeman-frontend/shared/components/ui/resizable";
import { PanelLeftClose, PanelLeftOpen } from "lucide-solid";

// ─── Persistence keys ────────────────────────────────────────────────────────────

const STORAGE_KEY_WIDTH = "codeman.sidebar.width";
const STORAGE_KEY_COLLAPSED = "codeman.sidebar.collapsed";
const DEFAULT_WIDTH = "256px";

// ─── Persistence hook ──────────────────────────────────────────────────────────

function useResizableSidebarPersistence() {
  const safeLocalStorage = (): Storage | null => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage;
      }
    } catch {
      // jsdom may throw SecurityError in some environments
    }
    return null;
  };

  const storedWidth = (): string | undefined => {
    const ls = safeLocalStorage();
    if (!ls) { return undefined; }
    try {
      return ls.getItem(STORAGE_KEY_WIDTH) ?? undefined;
    } catch {
      return undefined;
    }
  };

  const storedCollapsed = (): boolean => {
    const ls = safeLocalStorage();
    if (!ls) { return false; }
    try {
      return ls.getItem(STORAGE_KEY_COLLAPSED) === "true";
    } catch {
      return false;
    }
  };

  const [width, setWidth] = createSignal<string>(storedWidth() ?? DEFAULT_WIDTH);
  const [collapsed, setCollapsed] = createSignal<boolean>(storedCollapsed());

  const saveWidth = (newWidth: string): void => {
    setWidth(newWidth);
    const ls = safeLocalStorage();
    if (ls) {
      try {
        ls.setItem(STORAGE_KEY_WIDTH, newWidth);
      } catch {
        // Ignore quota errors
      }
    }
  };

  const saveCollapsed = (isCollapsed: boolean): void => {
    setCollapsed(isCollapsed);
    const ls = safeLocalStorage();
    if (ls) {
      try {
        ls.setItem(STORAGE_KEY_COLLAPSED, String(isCollapsed));
      } catch {
        // Ignore quota errors
      }
    }
  };

  const toggleCollapsed = (): void => {
    saveCollapsed(!collapsed());
  };

  return {
    width,
    collapsed,
    saveWidth,
    saveCollapsed,
    toggleCollapsed,
    setCollapsed,
  };
}

// ─── Collapse toggle button ────────────────────────────────────────────────────

interface CollapseToggleButtonProps {
  collapsed: boolean;
  onToggle: () => void;
}

function CollapseToggleButton(props: CollapseToggleButtonProps): JSX.Element {
  return (
    <button
      type="button"
      data-testid="collapse-toggle-button"
      aria-label={props.collapsed ? "Expand sidebar" : "Collapse sidebar"}
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring transition-colors"
      onClick={props.onToggle}
    >
      {props.collapsed
        ? <PanelLeftOpen class="h-4 w-4" />
        : <PanelLeftClose class="h-4 w-4" />}
    </button>
  );
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CodemanSidebarGroupOption {
  label: string;
  value: string;
  children: (CodemanSidebarMenuGroupOption | CodemanSidebarMenuOption)[];
}

export interface CodemanSidebarMenuGroupOption {
  label: string;
  value: string;
  icon?: JSX.Element;
  disabled?: boolean;
  defaultExpanded?: boolean;
  children: CodemanSidebarMenuOption[];
}

export interface CodemanSidebarMenuOption {
  label: string;
  value: string;
  icon?: JSX.Element;
  disabled?: boolean;
  forceSubMenu?: boolean;
}

export interface CodemanSidebarProps {
  options: CodemanSidebarGroupOption[];
  renderMenuGroup: (item: CodemanSidebarMenuGroupOption) => JSX.Element;
  renderMenu?: (menu: CodemanSidebarMenuOption) => JSX.Element;
  renderGroupHeader?: (group: CodemanSidebarGroupOption) => JSX.Element;

  currentValue?: string;
  isActive?: (value: string | undefined, currentValue: string | undefined) => boolean;
  onMenuGroupSelect?: (value: string) => void;
  onMenuSelect?: (value: string) => void;
  onEmptyGroupClick?: (groupValue: string) => void;

  header?: JSX.Element;
  footer?: JSX.Element;
  children?: JSX.Element;

  emptyMessage?: string;
  class?: string;
}

interface CodemanSidebarEmptyStateProps {
  message?: string;
}

interface CodemanSidebarEmptyGroupButtonProps {
  label: string;
  value: string;
  onClick?: ((groupValue: string) => void);
}

interface CodemanSidebarMenuGroupProps {
  item: CodemanSidebarMenuGroupOption;
  renderMenuGroup: (item: CodemanSidebarMenuGroupOption) => JSX.Element;
  renderMenu?: (menu: CodemanSidebarMenuOption) => JSX.Element;
  onMenuGroupSelect?: ((value: string) => void);
  onMenuSelect?: ((value: string) => void);
  isMenuActive: (menu: CodemanSidebarMenuOption) => boolean;
}

interface CodemanSidebarMenuViewProps {
  menu: CodemanSidebarMenuOption;
  onMenuSelect?: ((value: string) => void);
  renderMenu?: (menu: CodemanSidebarMenuOption) => JSX.Element;
  isActive: boolean;
}

interface CodemanSidebarGroupViewProps {
  group: CodemanSidebarGroupOption;
  renderMenuGroup: (item: CodemanSidebarMenuGroupOption) => JSX.Element;
  renderMenu?: (menu: CodemanSidebarMenuOption) => JSX.Element;
  renderGroupHeader?: (group: CodemanSidebarGroupOption) => JSX.Element;
  onMenuGroupSelect?: ((value: string) => void);
  onMenuSelect?: ((value: string) => void);
  onEmptyGroupClick?: ((groupValue: string) => void);
  isMenuActive: (menu: CodemanSidebarMenuOption) => boolean;
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function CodemanSidebarEmptyState(
  props: CodemanSidebarEmptyStateProps,
): JSX.Element {
  return (
    <Show when={props.message}>
      <div
        data-testid="empty-state"
        class="p-3 text-sm text-muted-foreground"
      >
        {props.message}
      </div>
    </Show>
  );
}

function CodemanSidebarEmptyGroupButton(
  props: CodemanSidebarEmptyGroupButtonProps,
): JSX.Element {
  const handleClick = (): void => props.onClick?.(props.value);
  return (
    <div class="pl-6 pr-3 pb-2">
      <button
        type="button"
        class="w-full text-left px-2 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
        onClick={handleClick}
        data-empty-group-value={props.value}
      >
        {props.label} (empty)
      </button>
    </div>
  );
}

function CodemanSidebarMenuGroup(
  props: CodemanSidebarMenuGroupProps,
): JSX.Element {
  const { item } = props;
  const handleSelect = (): void => {
    if (item.disabled) {
      return;
    }
    props.onMenuGroupSelect?.(item.value);
  };

  return (
    <SidebarMenuItem>
      <Accordion
        multiple={false}
        collapsible={true}
        defaultValue={item.defaultExpanded ? [item.value] : []}
      >
        <AccordionItem value={item.value}>
          <AccordionTrigger
            class={cn(
              "peer/menu-button group/menu-button group/row w-full items-center gap-2 overflow-hidden rounded-md outline-hidden transition-[width,height,padding]",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:no-underline",
              "font-normal",
              "focus-visible:ring-2",
              "data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground",
              "data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground",
              "p-2 text-sm h-8",
            )}
            data-value={item.value}
            onClick={handleSelect}
          >
            {props.renderMenuGroup(item)}
          </AccordionTrigger>
          <AccordionContent>
            <SidebarMenuSub>
              <For each={item.children}>
                {(menu) => (
                  <CodemanSidebarMenuView
                    menu={menu}
                    onMenuSelect={props.onMenuSelect}
                    renderMenu={props.renderMenu}
                    isActive={props.isMenuActive(menu)}
                  />
                )}
              </For>
            </SidebarMenuSub>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </SidebarMenuItem>
  );
}

function CodemanSidebarMenuView(
  props: CodemanSidebarMenuViewProps,
): JSX.Element {
  const handleMenuSelect = (): void => {
    if (props.menu.disabled) { return; }
    props.onMenuSelect?.(props.menu.value);
  };
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        isActive={props.isActive}
        onClick={handleMenuSelect}
        data-value={props.menu.value}
      >
        {props.renderMenu ? props.renderMenu(props.menu) : props.menu.label}
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

function CodemanSidebarGroupView(
  props: CodemanSidebarGroupViewProps,
): JSX.Element {
  const { group } = props;
  return (
    <SidebarGroup data-value={group.value}>
      <SidebarGroupLabel>
        {props.renderGroupHeader
          ? props.renderGroupHeader(group)
          : <span>{group.label}</span>}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <Show
          when={group.children.length > 0}
          fallback={
            <Show when={props.onEmptyGroupClick}>
              <CodemanSidebarEmptyGroupButton
                label={group.label}
                value={group.value}
                onClick={props.onEmptyGroupClick}
              />
            </Show>
          }
        >
          <SidebarMenu>
            <For each={group.children}>
              {(child) => (
                <Show
                  when={"children" in child && Array.isArray(child.children)}
                  fallback={
                    <Show
                      when={(child as CodemanSidebarMenuOption).forceSubMenu}
                      fallback={
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            isActive={props.isMenuActive(child as CodemanSidebarMenuOption)}
                            onClick={(): void => {
                              const menu = child as CodemanSidebarMenuOption;
                              if (!menu.disabled) {
                                props.onMenuSelect?.(menu.value);
                              }
                            }}
                            data-value={(child as CodemanSidebarMenuOption).value}
                          >
                            {props.renderMenu
                              ? props.renderMenu(child as CodemanSidebarMenuOption)
                              : (child as CodemanSidebarMenuOption).label}
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      }
                    >
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          isActive={props.isMenuActive(child as CodemanSidebarMenuOption)}
                          onClick={(): void => {
                            const menu = child as CodemanSidebarMenuOption;
                            if (!menu.disabled) {
                              props.onMenuSelect?.(menu.value);
                            }
                          }}
                          data-value={(child as CodemanSidebarMenuOption).value}
                        >
                          {(child as CodemanSidebarMenuOption).icon}
                          <span class="truncate flex-1 text-sm">
                            {(child as CodemanSidebarMenuOption).label}
                          </span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </Show>
                  }
                >
                  <CodemanSidebarMenuGroup
                    item={child as CodemanSidebarMenuGroupOption}
                    renderMenuGroup={props.renderMenuGroup}
                    renderMenu={props.renderMenu}
                    onMenuGroupSelect={props.onMenuGroupSelect}
                    onMenuSelect={props.onMenuSelect}
                    isMenuActive={props.isMenuActive}
                  />
                </Show>
              )}
            </For>
          </SidebarMenu>
        </Show>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function makeIsMenuActive(
  currentValue: string | undefined,
  isActiveFn: CodemanSidebarProps["isActive"] | undefined,
): (menu: CodemanSidebarMenuOption) => boolean {
  if (isActiveFn) {
    return (menu) => isActiveFn(menu.value, currentValue);
  }
  return (menu) => menu.value === currentValue;
}

// ─── Startup restore component ─────────────────────────────────────────────────
//
// This component must be rendered inside Splitter.Root to access the splitter context.
// It handles the startup-restore of the collapsed state from localStorage.
interface SplitterStartupRestoreProps {
  setCollapsed: (v: boolean) => void;
}

function SplitterStartupRestore(props: SplitterStartupRestoreProps): JSX.Element {
  const splitterApi = useSplitterContext();
  createEffect(() => {
    // Re-read localStorage directly at effect time (not from signal) to handle
    // cases where localStorage was set after the signal was initially created.
    const wasCollapsed = (() => {
      try {
        return window.localStorage.getItem(STORAGE_KEY_COLLAPSED) === "true";
      } catch {
        return false;
      }
    })();
    if (wasCollapsed) {
      props.setCollapsed(true);
      splitterApi().collapsePanel("sidebar");
    }
  });
  return <></>;
}

// ─── Main component ────────────────────────────────────────────────────────────

export function CodemanSidebar(props: CodemanSidebarProps): JSX.Element {
  const isMenuActive = makeIsMenuActive(props.currentValue, props.isActive);
  const { width, collapsed, saveWidth, saveCollapsed, toggleCollapsed, setCollapsed } = useResizableSidebarPersistence();

  const handleResizeEnd = (details: { size: number[] }): void => {
    // Width is reported as percentage by zag. Store as percentage string for defaultSize.
    if (details.size && details.size[0] !== undefined) {
      saveWidth(`${details.size[0]}%`);
    }
  };

  const handleCollapse = (details: { panelId: string; size: number }): void => {
    if (details.panelId === "sidebar") {
      saveCollapsed(true);
    }
  };

  const handleExpand = (details: { panelId: string; size: number }): void => {
    if (details.panelId === "sidebar") {
      saveCollapsed(false);
    }
  };

  // Determine sidebar panel style - conditional override when collapsed
  const sidebarPanelStyle = (): JSX.CSSProperties | undefined => {
    if (collapsed()) {
      return {
        "min-width": "0px",
        "flex-basis": "0px",
        "flex-grow": "0",
        "overflow": "hidden",
      };
    }
    return undefined;
  };

  return (
    <ResizablePanelGroup
      defaultSize={[width()]}
      onResizeEnd={handleResizeEnd}
      onCollapse={handleCollapse}
      onExpand={handleExpand}
      panels={[
        { id: "sidebar", minSize: "160px", maxSize: "480px", collapsible: true, collapsedSize: "0px" },
        { id: "main", minSize: 0 },
      ]}
    >
      <SplitterStartupRestore setCollapsed={setCollapsed} />

      <ResizablePanel
        id="sidebar"
        style={sidebarPanelStyle()}
      >
        <div
          data-testid="sidebar-content-wrapper"
          data-collapsed={collapsed() ? "true" : undefined}
          inert={collapsed() ? true : undefined}
          class="flex h-full"
        >
          <Sidebar class={cn("w-full h-full", props.class)}>
            <Show when={props.header}>
              <SidebarHeader>{props.header}</SidebarHeader>
            </Show>

            <SidebarContent>
              <Show
                when={props.options.length > 0}
                fallback={<CodemanSidebarEmptyState message={props.emptyMessage} />}
              >
                <For each={props.options}>
                  {(group) => (
                    <CodemanSidebarGroupView
                      group={group}
                      renderMenuGroup={props.renderMenuGroup}
                      renderMenu={props.renderMenu}
                      renderGroupHeader={props.renderGroupHeader}
                      onMenuGroupSelect={props.onMenuGroupSelect}
                      onMenuSelect={props.onMenuSelect}
                      onEmptyGroupClick={props.onEmptyGroupClick}
                      isMenuActive={isMenuActive}
                    />
                  )}
                </For>
              </Show>
            </SidebarContent>

            <Show when={props.footer}>
              <SidebarFooter>{props.footer}</SidebarFooter>
            </Show>
          </Sidebar>
        </div>
      </ResizablePanel>

      <ResizableHandle id="sidebar:main" tabIndex={-1} withHandle>
        <div class="w-1 h-full bg-transparent hover:bg-sidebar-border/50 cursor-col-resize transition-colors" />
      </ResizableHandle>

      <ResizablePanel id="main">
        <SidebarInset class="min-h-0 overflow-y-auto flex flex-col">
          {/* Toolbar row at top of SidebarInset */}
          <div
            data-testid="sidebar-toolbar"
            class="h-10 shrink-0 flex items-center px-2 border-b border-sidebar-border"
          >
            <CollapseToggleButton
              collapsed={collapsed()}
              onToggle={toggleCollapsed}
            />
          </div>

          {/* Main content */}
          <Show when={props.children}>
            <div class="flex-1 min-h-0">
              {props.children}
            </div>
          </Show>
        </SidebarInset>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
