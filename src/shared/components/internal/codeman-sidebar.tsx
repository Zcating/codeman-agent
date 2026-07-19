//! CodemanSidebar — universal render-driven sidebar (per ADR-0030).
//!
//! Layer 2 business composition (per ADR-0022 D3): strictly prop-driven,
//! ZERO business logic, ZERO feature/store imports. Layer 1 primitives
//! live in `ui/sidebar.tsx`.
//!
//! Design philosophy (ADR-0030 D2):
//! - Consumer passes `options: SidebarOption[]` and a `renderItem` function.
//! - sidebar wraps each rendered node with active highlight + hover bg + click
//!   handler (consumer doesn't need to manage classes or onclick).
//! - Accordion state managed by @ark-ui/solid internally (uncontrolled via
//!   defaultValue), per ADR-0023 D7-CS2 (component internal signal, not coupled
//!   to appStore).
//! - 3 slots (header / footer / children) — header/footer are rendered
//!   inside the sidebar shell (top/bottom of menu). Two-column layout is
//!   owned by the sidebar; consumers only feed content via slots.

import { For, Show, type JSX } from "solid-js";
import { Accordion } from "@ark-ui/solid";
import { ChevronRight } from "lucide-solid";
import {
  Sidebar as SidebarPrimitive,
  SidebarContent,
  SidebarFooter as SidebarPrimitiveFooter,
  SidebarHeader as SidebarPrimitiveHeader,
} from "../ui/sidebar";
import { cn } from "../../lib/cn";

// ─── Types ─────────────────────────────────────────────────────────────────

/**
 * Tree node — recursive, supports N-level nesting via `children`.
 *
 * Consumers build `SidebarOption[]` from their domain data (chat: category →
 * workspace → conversation; settings: 4-tab flat nav).
 *
 * - `children === undefined` → leaf (rendered as `<div role="menuitem">`)
 * - `children` is array (empty or not) → group (rendered with `<Accordion.Item>`)
 */
export interface SidebarOption {
  /** Required: human-readable label (form semantic, also used as fallback key). */
  label: string;
  /** Optional: navigation key. Falls back to `label` if not provided. */
  value?: string;
  /** Optional: leading icon (lucide-solid `<Icon />` typically). */
  icon?: JSX.Element;
  /** Optional: disabled items get opacity-60 + `<button disabled>` (no click). */
  disabled?: boolean;
  /** Uncontrolled: expand this group on mount. Maps to Accordion.defaultValue. */
  defaultExpanded?: boolean;
  /**
   * Child nodes (recursive). `undefined` = leaf; `[]` = empty group (renders
   * onEmptyGroupClick button when provided); `SidebarOption[]` = nested group.
   */
  children?: SidebarOption[];
}

/** Consumer's per-node render function — receives a SidebarOption, returns JSX. */
export type SidebarRenderItem = (item: SidebarOption) => JSX.Element;

/** Custom active predicate. Receives (itemValue, currentValue). */
export type SidebarIsActiveFn = (
  value: string | undefined,
  currentValue: string | undefined,
) => boolean;

export interface CodemanSidebarProps {
  /** Tree of nodes (groups + leaves). */
  options: SidebarOption[];
  /** Render function called once per leaf (and per child inside groups). */
  renderItem: SidebarRenderItem;
  /**
   * Optional override for the group trigger content. When provided, replaces
   * the default `<span>{label}</span>`. Use this for group-level actions
   * (rename, delete) that must coexist with the accordion trigger.
   * Falls back to plain label when omitted.
   */
  renderGroupHeader?: (group: SidebarOption) => JSX.Element;

  /**
   * Current value for active highlighting. Syntactic sugar: when provided
   * without a custom `isActive`, sidebar uses `value === currentValue`.
   */
  currentValue?: string;
  /** Custom active predicate. Receives `(value, currentValue)`. */
  isActive?: SidebarIsActiveFn;
  /** Click handler for leaf items. Called with `item.value` (or label fallback). */
  onItemSelect?: (value: string) => void;
  /**
   * Optional click handler for "empty group" placeholder. When a group's
   * `children` array is empty AND this handler is provided, sidebar renders
   * an inline "该 workspace 暂无会话" button (or equivalent) inside the group
   * body. Click → calls `onEmptyWorkspaceClick(group.value)`.
   * Skipped when the handler is omitted (consumer can render own empty UI
   * via `renderGroupHeader`).
   */
  onEmptyGroupClick?: (groupValue: string) => void;

  // ─── 3 slots (per ADR-0030 D3) ────────────────────────────────────────
  /** Top slot (inside sidebar shell, above menu). */
  header?: JSX.Element;
  /** Bottom slot (inside sidebar shell, below menu). */
  footer?: JSX.Element;
  /** Main content slot — rendered in `SidebarInset` (right column). */
  children?: JSX.Element;

  /** Shown when `options.length === 0`. */
  emptyMessage?: string;
  /** Tailwind utility class merged into the root `<aside>`. */
  class?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Default active predicate: strict equality. */
const isEqual = (a: unknown, b: unknown): boolean => a === b;

/**
 * Compute whether an item is currently active.
 * Uses custom `isActive` if provided; otherwise falls back to
 * `value === currentValue` (strict equality).
 */
function computeActive(
  item: SidebarOption,
  currentValue: string | undefined,
  isActiveFn: SidebarIsActiveFn | undefined,
): boolean {
  const value = item.value ?? item.label;
  if (isActiveFn) return isActiveFn(value, currentValue);
  return isEqual(value, currentValue);
}

/**
 * Render a leaf wrapped in a `<div role="menuitem">` with click + active +
 * disabled attrs. Slices 4-7 cover: active highlight, click → onItemSelect,
 * disabled blocks click + opacity-60 visual. Slice 13: element carries
 * data-value for e2e.
 *
 * Wrapper is a `<div role="menuitem">` (not `<button>`) so consumers can
 * nest their own `<button>` elements inside (e.g., per-item delete action).
 * Click + keyboard activation (Enter/Space) are handled manually since div
 * has no native button semantics. Per WAI-ARIA menu pattern.
 */
function renderLeaf(
  item: SidebarOption,
  props: CodemanSidebarProps,
): JSX.Element {
  const active = (): boolean =>
    computeActive(item, props.currentValue, props.isActive);
  const handleClick = (): void => {
    if (item.disabled) return;
    props.onItemSelect?.(item.value ?? item.label);
  };
  const handleKeyDown = (e: KeyboardEvent): void => {
    if (item.disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };
  const valueKey = item.value ?? item.label;
  return (
    <div
      role="menuitem"
      tabindex={item.disabled ? undefined : 0}
      data-value={valueKey}
      class={cn(
        "group/row relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        active()
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        item.disabled && "opacity-60 cursor-not-allowed",
      )}
      aria-current={active() ? "page" : undefined}
      aria-disabled={item.disabled || undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {props.renderItem(item)}
    </div>
  );
}

// ─── Recursive renderTree ───────────────────────────────────────────────────

/**
 * Recursive tree renderer. Handles N-level nesting: each group is an
 * Accordion item, its children are rendered via a recursive call.
 */
function renderTree(
  options: SidebarOption[],
  props: CodemanSidebarProps,
): JSX.Element {
  const flatLeaves = options.filter((o) => o.children === undefined);
  const groups = options.filter((o) => o.children !== undefined);
  const defaultValue = groups
    .filter((o) => o.defaultExpanded)
    .map((o) => o.value ?? o.label);

  return (
    <>
      <Show when={flatLeaves.length > 0}>
        <ul class="flex flex-col gap-0.5 list-none p-0 m-0">
          <For each={flatLeaves}>
            {(item) => <li>{renderLeaf(item, props)}</li>}
          </For>
        </ul>
      </Show>
      <Show when={groups.length > 0}>
        <Accordion.Root
          multiple={false}
          collapsible={true}
          defaultValue={defaultValue}
        >
          <For each={groups}>
            {(group) => (
              <Accordion.Item
                value={group.value ?? group.label}
                data-value={group.value ?? group.label}
              >
                <Accordion.ItemTrigger class="group/row relative w-full px-2 py-2">
                  <span class="flex w-full items-center gap-2 min-w-0">
                    <Accordion.ItemIndicator>
                      <ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/row:rotate-90" />
                    </Accordion.ItemIndicator>
                    {props.renderGroupHeader
                      ? props.renderGroupHeader(group)
                      : <span>{group.label}</span>}
                  </span>
                </Accordion.ItemTrigger>
                <Accordion.ItemContent class="pt-1">
                  <Show
                    when={group.children && group.children.length > 0}
                    fallback={
                      <Show when={props.onEmptyGroupClick}>
                        <div class="pl-6 pr-3 pb-2">
                          <button
                            type="button"
                            class="w-full text-left px-2 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                            onClick={() =>
                              props.onEmptyGroupClick?.(
                                group.value ?? group.label,
                              )
                            }
                            aria-label={`${group.label}: empty group`}
                            data-empty-group-value={
                              group.value ?? group.label
                            }
                          >
                            {group.label} (empty)
                          </button>
                        </div>
                      </Show>
                    }
                  >
                    {renderTree(group.children!, props)}
                  </Show>
                </Accordion.ItemContent>
              </Accordion.Item>
            )}
          </For>
        </Accordion.Root>
      </Show>
    </>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CodemanSidebar(props: CodemanSidebarProps): JSX.Element {
  return (
    <div class="flex h-full w-full flex-col">
      {/* Two-column row: sidebar + main content */}
      <div class="flex flex-1 min-h-0">
        <SidebarPrimitive class={props.class}>
          {/* Header slot — inside sidebar shell, above menu */}
          <Show when={props.header}>
            <SidebarPrimitiveHeader>
              {props.header}
            </SidebarPrimitiveHeader>
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
              {renderTree(props.options, props)}
            </Show>
          </SidebarContent>

          {/* Footer slot — inside sidebar shell, below menu */}
          <Show when={props.footer}>
            <SidebarPrimitiveFooter>
              {props.footer}
            </SidebarPrimitiveFooter>
          </Show>
        </SidebarPrimitive>

        {/* Children slot — main content area (right column) */}
        <Show when={props.children}>
          <main class="flex-1 min-w-0 overflow-y-auto">{props.children}</main>
        </Show>
      </div>
    </div>
  );
}
