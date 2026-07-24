//! CodemanSidebar — universal render-driven sidebar (per ADR-0030 + ADR-0033).
//!
//! Layer 2 business composition (per ADR-0022 D3): strictly prop-driven,
//! ZERO business logic, ZERO feature/store imports. Layer 1 primitives
//! live in `ui/sidebar.tsx` + `ui/accordion.tsx`.
//!
//! Design (ADR-0030 + ADR-0033 Q26/Q27/Q30):
//! - `options: SidebarGroupOption[]` — top-level groups (projects)
//! - `options[].children: SidebarOption[]` — workspaces (SidebarMenuItem)
//! - `options[].children[].subItems: SidebarSubOption[]` — convs (SidebarMenuSub)
//! - `renderItem` renders workspace leaf internal visual (WorkspaceActions etc.)
//! - `renderGroupHeader` renders project group trigger override
//! - Accordion controls project groups; workspace/conversation expand is
//!   always visible once parent is expanded (per Q28 v5=A)

import { For, Show, type JSX } from "solid-js";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "../ui/accordion";
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

/** Top-level group (project) — Accordion-controlled */
export interface SidebarGroupOption {
  label: string;
  value: string;
  defaultExpanded?: boolean;
  children: SidebarOption[];
}

/** Workspace layer (SidebarMenuItem + optional SidebarMenuSub) */
export interface SidebarOption {
  label: string;
  value: string;
  icon?: JSX.Element;
  disabled?: boolean;
  /** Conversation sub-items — rendered inside SidebarMenuSub */
  subItems?: SidebarSubOption[];
}

/** Conversation leaf layer (SidebarMenuSubItem + SidebarMenuSubButton) */
export interface SidebarSubOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface CodemanSidebarProps {
  /** Tree of groups (projects) → workspaces → conversations */
  options: SidebarGroupOption[];
  /**
   * Render function for workspace item internal visual.
   * Called once per workspace with a SidebarOption.
   */
  renderItem: (item: SidebarOption) => JSX.Element;
  /**
   * Optional override for the group (project) trigger content.
   * Called once per group with a SidebarGroupOption.
   */
  renderGroupHeader?: (group: SidebarGroupOption) => JSX.Element;

  /** Current active value for highlighting */
  currentValue?: string;
  /** Custom active predicate: (value, currentValue) => boolean */
  isActive?: (value: string | undefined, currentValue: string | undefined) => boolean;
  /** Click handler for workspace items */
  onItemSelect?: (value: string) => void;
  /** Click handler for conversation sub-items (Q12 new) */
  onSubItemSelect?: (value: string) => void;
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

// ─── Helpers ───────────────────────────────────────────────────────────────

const isEqual = (a: unknown, b: unknown): boolean => a === b;

function computeActive(
  value: string | undefined,
  currentValue: string | undefined,
  isActiveFn: CodemanSidebarProps["isActive"] | undefined,
): boolean {
  if (isActiveFn) {return isActiveFn(value, currentValue);}
  return isEqual(value, currentValue);
}

function isWorkspaceActive(
  item: SidebarOption,
  currentValue: string | undefined,
  isActiveFn: CodemanSidebarProps["isActive"] | undefined,
): boolean {
  return computeActive(item.value, currentValue, isActiveFn);
}

function isSubActive(
  sub: SidebarSubOption,
  currentValue: string | undefined,
  isActiveFn: CodemanSidebarProps["isActive"] | undefined,
): boolean {
  return computeActive(sub.value, currentValue, isActiveFn);
}

// ─── Component ─────────────────────────────────────────────────────────────

export function CodemanSidebar(props: CodemanSidebarProps): JSX.Element {
  const handleSelect = (item: SidebarOption): void => {
    if (item.disabled) {return;}
    props.onItemSelect?.(item.value);
  };

  const handleSubSelect = (sub: SidebarSubOption): void => {
    if (sub.disabled) {return;}
    props.onSubItemSelect?.(sub.value);
  };

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
              fallback={
                <Show when={props.emptyMessage}>
                  <div
                    data-testid="empty-state"
                    class="p-3 text-sm text-muted-foreground"
                  >
                    {props.emptyMessage}
                  </div>
                </Show>
              }
            >
              <For each={props.options}>
                {(group) => (
                  <SidebarGroup data-value={group.value}>
                    <Accordion
                      multiple={false}
                      collapsible={true}
                      defaultValue={group.defaultExpanded ? [group.value] : []}
                    >
                      <AccordionItem value={group.value}>
                        <AccordionTrigger>
                          <SidebarGroupLabel>
                            {props.renderGroupHeader
                              ? props.renderGroupHeader(group)
                              : <span>{group.label}</span>}
                          </SidebarGroupLabel>
                        </AccordionTrigger>
                        <AccordionContent>
                          <SidebarGroupContent>
                            <Show
                              when={group.children.length > 0}
                              fallback={
                                <Show when={props.onEmptyGroupClick}>
                                  <div class="pl-6 pr-3 pb-2">
                                    <button
                                      type="button"
                                      class="w-full text-left px-2 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                                      onClick={() => props.onEmptyGroupClick?.(group.value)}
                                      data-empty-group-value={group.value}
                                    >
                                      {group.label} (empty)
                                    </button>
                                  </div>
                                </Show>
                              }
                            >
                              <SidebarMenu>
                                <For each={group.children}>
                                  {(item) => (
                                    <SidebarMenuItem>
                                      <SidebarMenuButton
                                        isActive={isWorkspaceActive(item, props.currentValue, props.isActive)}
                                        onClick={() => handleSelect(item)}
                                        data-value={item.value}
                                      >
                                        {props.renderItem(item)}
                                      </SidebarMenuButton>
                                      <Show when={item.subItems && item.subItems.length > 0}>
                                        <SidebarMenuSub>
                                          <For each={item.subItems!}>
                                            {(sub) => (
                                              <SidebarMenuSubItem>
                                                <SidebarMenuSubButton
                                                  isActive={isSubActive(sub, props.currentValue, props.isActive)}
                                                  onClick={() => handleSubSelect(sub)}
                                                  data-value={sub.value}
                                                >
                                                  {sub.label}
                                                </SidebarMenuSubButton>
                                              </SidebarMenuSubItem>
                                            )}
                                          </For>
                                        </SidebarMenuSub>
                                      </Show>
                                    </SidebarMenuItem>
                                  )}
                                </For>
                              </SidebarMenu>
                            </Show>
                          </SidebarGroupContent>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </SidebarGroup>
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
