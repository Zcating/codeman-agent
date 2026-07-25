//! CodemanSidebar — universal render-driven sidebar (ADR-0030, ADR-0033).
//! Layer 2 prop-driven composition over `ui/sidebar` + `ui/accordion` primitives.

//! ADR-0022 D3: zero business logic, zero feature/store imports.

import { For, Show, type JSX } from "solid-js";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "../ui/accordion";
import { cn } from "../../lib/cn";
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
} from "../ui/sidebar";

// ─── Types ─────────────────────────────────────────────────────────────────

/** Top-level group. `children` is heterogeneous — MenuGroups (accordion-controlled) and Menus (flat) can coexist. */
export interface CodemanSidebarGroupOption {
  label: string;
  value: string;
  children: (CodemanSidebarMenuGroupOption | CodemanSidebarMenuOption)[];
}

/** Middle layer. Presence of `children` (vs Menu's flat leaf) drives the Accordion wrapper at render time. */
export interface CodemanSidebarMenuGroupOption {
  label: string;
  value: string;
  icon?: JSX.Element;
  disabled?: boolean;
  /** Initial open state for the per-group Accordion. Default: false. */
  defaultExpanded?: boolean;
  children: CodemanSidebarMenuOption[];
}

/** Leaf layer. No `children` field — discriminated from MenuGroup by absence. */
export interface CodemanSidebarMenuOption {
  label: string;
  value: string;
  icon?: JSX.Element;
  disabled?: boolean;
}

export interface CodemanSidebarProps {
  options: CodemanSidebarGroupOption[];
  /**
   * Render function for MenuGroup item internal visual.
   * Called once per MenuGroup with a CodemanSidebarMenuGroupOption.
   */
  renderMenuGroup: (item: CodemanSidebarMenuGroupOption) => JSX.Element;
  /**
   * Render function for Menu leaf internal visual.
   * Called once per Menu with a CodemanSidebarMenuOption. Falls back to `{menu.label}` when omitted.
   */
  renderMenu?: (menu: CodemanSidebarMenuOption) => JSX.Element;
  /**
   * Optional override for the group header content.
   * Called once per group with a CodemanSidebarGroupOption.
   */
  renderGroupHeader?: (group: CodemanSidebarGroupOption) => JSX.Element;

  /** Current active value for highlighting */
  currentValue?: string;
  /** Custom active predicate: (value, currentValue) => boolean */
  isActive?: (value: string | undefined, currentValue: string | undefined) => boolean;
  /** Click handler for MenuGroup items */
  onMenuGroupSelect?: (value: string) => void;
  /** Click handler for Menu items */
  onMenuSelect?: (value: string) => void;
  /** Called when an empty group is clicked (no children) */
  onEmptyGroupClick?: (groupValue: string) => void;

  // ─── 3 slots (per ADR-0030 D3) ────────────────────────────────────────
  /** Top slot — inside sidebar shell, above menu */
  header?: JSX.Element;
  /** Bottom slot — inside sidebar shell, below menu */
  footer?: JSX.Element;
  /** Main content slot — rendered in SidebarInset (right column) */
  children?: JSX.Element;

  /** Shown when `options.length === 0` */
  emptyMessage?: string;
  /** Tailwind utility class merged into the root sidebar */
  class?: string;
}

// ─── Sub-component props (file-local, not exported) ────────────────────────

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

// ─── Internal sub-components (file-local, not exported) ────────────────────

/** Empty-state placeholder when `options.length === 0`. */
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

/** Action button shown when a group has no children AND `onEmptyGroupClick` is provided. */
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

/**
 * One MenuGroup row. Wraps its children in a per-group Accordion (each MenuGroup
 * expands independently). The MenuGroup's trigger is always `isActive={false}`;
 * only Menu leaves can be active.
 */
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
              // `hover:no-underline` + `font-normal` override the shadcn
              // trigger's `hover:underline` + `font-medium` defaults.
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

/** One Menu leaf row inside SidebarMenuSub. */
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

/**
 * One group: header + heterogeneous children (MenuGroups or Menus).
 * Discriminator: presence of `children` on the child decides Accordion wrapping.
 */
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

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Bound active predicate for Menu leaves (closes over currentValue + isActiveFn). */
function makeIsMenuActive(
  currentValue: string | undefined,
  isActiveFn: CodemanSidebarProps["isActive"] | undefined,
): (menu: CodemanSidebarMenuOption) => boolean {
  if (isActiveFn) {
    return (menu) => isActiveFn(menu.value, currentValue);
  }
  return (menu) => menu.value === currentValue;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function CodemanSidebar(props: CodemanSidebarProps): JSX.Element {
  const isMenuActive = makeIsMenuActive(props.currentValue, props.isActive);

  return (
    <div class="flex h-full w-full flex-col">
      <div class="flex flex-1 min-h-0">
        <Sidebar class={props.class}>
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

        <Show when={props.children}>
          <SidebarInset>{props.children}</SidebarInset>
        </Show>
      </div>
    </div>
  );
}