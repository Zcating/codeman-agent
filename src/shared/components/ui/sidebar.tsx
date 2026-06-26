//! Sidebar — shadcn-style layout primitive (Layer 1).
//! Pure layout, ZERO business logic, ZERO feature imports.
//! Per ADR-0022 D3: Layer 1 = this file, Layer 2 = internal/agent-sidebar.tsx.

import { type JSX, type ParentProps, mergeProps, splitProps } from "solid-js";
import { cn } from "../../lib/cn";

// ─── Root container ────────────────────────────────────────────────────────────

export interface SidebarProps {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
  class?: string;
  children?: JSX.Element;
}

export function Sidebar(props: SidebarProps): JSX.Element {
  const merged = mergeProps(
    { side: "left" as const, variant: "sidebar" as const, collapsible: "offcanvas" as const },
    props,
  );
  return (
    <aside
      class={cn(
        "flex h-full flex-col bg-sidebar text-sidebar-foreground border-sidebar-border",
        merged.collapsible === "offcanvas" && "w-60 transition-[width] duration-200",
        merged.class,
      )}
      aria-label="Sidebar"
    >
      {merged.children}
    </aside>
  );
}

// ─── Header / Content / Footer ────────────────────────────────────────────────

export function SidebarHeader(props: ParentProps<{ class?: string }>): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <div class={cn("flex flex-col gap-1 p-2 border-b border-sidebar-border", local.class)} {...rest}>
      {local.children}
    </div>
  );
}

export function SidebarContent(props: ParentProps<{ class?: string }>): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <div class={cn("flex-1 overflow-y-auto p-2", local.class)} {...rest}>
      {local.children}
    </div>
  );
}

export function SidebarFooter(props: ParentProps<{ class?: string }>): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <div class={cn("flex flex-col gap-1 p-2 border-t border-sidebar-border", local.class)} {...rest}>
      {local.children}
    </div>
  );
}

// ─── Group (section with title) ───────────────────────────────────────────────

export function SidebarGroup(props: ParentProps<{ class?: string }>): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <div class={cn("flex flex-col gap-1", local.class)} {...rest}>
      {local.children}
    </div>
  );
}

export function SidebarGroupLabel(props: ParentProps<{ class?: string }>): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <div class={cn("px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide", local.class)} {...rest}>
      {local.children}
    </div>
  );
}

export function SidebarGroupContent(props: ParentProps<{ class?: string }>): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <div class={cn("flex flex-col gap-0.5", local.class)} {...rest}>
      {local.children}
    </div>
  );
}

// ─── Menu (interactive list) ───────────────────────────────────────────────────

export function SidebarMenu(props: ParentProps<{ class?: string }>): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <ul class={cn("flex flex-col gap-0.5 list-none p-0 m-0", local.class)} role="menu" {...rest}>
      {local.children}
    </ul>
  );
}

export function SidebarMenuItem(props: ParentProps<{ class?: string }>): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <li class={cn("flex items-center gap-1", local.class)} role="none" {...rest}>
      {local.children}
    </li>
  );
}

export interface SidebarMenuButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean;
  size?: "sm" | "md";
}

export function SidebarMenuButton(props: SidebarMenuButtonProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "isActive", "size", "children"]);
  return (
    <button
      type="button"
      role="menuitem"
      class={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        local.isActive
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        local.size === "sm" ? "h-7 px-2 text-xs" : "h-9",
        local.class,
      )}
      {...rest}
    >
      {local.children}
    </button>
  );
}

// ─── Action inside menu item (e.g., delete button) ────────────────────────────

export interface SidebarMenuActionProps {
  showOnHover?: boolean;
  onClick?: (e: MouseEvent) => void;
  class?: string;
  children?: JSX.Element;
  "aria-label"?: string;
}

export function SidebarMenuAction(props: SidebarMenuActionProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "showOnHover", "children", "onClick"]);
  return (
    <button
      type="button"
      class={cn(
        "ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground outline-none",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        local.showOnHover && "opacity-0 group-hover:opacity-100",
        local.class,
      )}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        local.onClick?.(e);
      }}
      {...rest}
    >
      {local.children}
    </button>
  );
}

// ─── Badge (e.g., streaming indicator) ───────────────────────────────────────

export function SidebarMenuBadge(props: ParentProps<{ class?: string }>): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <span class={cn("ml-auto flex h-5 items-center text-xs", local.class)} aria-live="polite" {...rest}>
      {local.children}
    </span>
  );
}

// ─── Rail (resize handle, optional) ────────────────────────────────────────────

export function SidebarRail(props: { class?: string }): JSX.Element {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <div
      class={cn("flex h-full w-1 cursor-col-resize bg-transparent", local.class)}
      role="separator"
      aria-orientation="vertical"
      {...rest}
    />
  );
}

// ─── Trigger (collapse button, optional) ──────────────────────────────────────

export function SidebarTrigger(props: {
  onClick?: (e: MouseEvent) => void;
  class?: string;
  children?: JSX.Element;
  "aria-label"?: string;
}): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children", "onClick", "aria-label"]);
  return (
    <button
      type="button"
      aria-label={local["aria-label"] ?? "Toggle sidebar"}
      onClick={(e: MouseEvent) => local.onClick?.(e)}
      class={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground outline-none",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        local.class,
      )}
      {...rest}
    >
      {local.children}
    </button>
  );
}
