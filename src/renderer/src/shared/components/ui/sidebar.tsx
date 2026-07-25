//! sidebar.tsx — Layer 1 shadcn-style sidebar primitive.
//! Pure layout, ZERO business logic. Wraps @ark-ui/solid for Accordion/Tooltip.
//! Per ADR-0023 D8-W6 Dialog case precedent (single authorized instance) and `.omo/plans/sidebar-reshim.md` Q10=B / Q28 v5=A decisions (plan-driven authorization for sidebar/accordion/tooltip wrapper atoms): ui/ atoms MAY wrap @ark-ui/solid when the wrapper is a shadcn/ui-style primitive (per codeman-agent project context).
//! Per ADR-0022 D3: Layer 1 = this file; Layer 2 = internal/codeman-sidebar.tsx.

import type { JSX } from "solid-js";
import { createSignal, createContext, useContext, mergeProps, splitProps, Show } from "solid-js";
import { cn } from "../../lib/cn";
import { Tooltip as TooltipRoot, TooltipTrigger, TooltipContent } from "./tooltip";

// ─── SidebarContext & SidebarProvider ─────────────────────────────────────────

interface SidebarContextValue {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue | null {
  return useContext(SidebarContext);
}

export interface SidebarProviderProps {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  class?: string;
  children?: JSX.Element;
}

export function SidebarProvider(props: SidebarProviderProps): JSX.Element {
  const merged = mergeProps({ defaultOpen: true }, props);

  // Internal state for uncontrolled mode
  const [internalOpen, setInternalOpen] = createSignal(merged.defaultOpen);

  // Controlled: use props.open if provided, otherwise use internal
  const isControlled = () => props.open !== undefined;
  const open = () => (isControlled() ? props.open! : internalOpen());

  const setOpen = (value: boolean) => {
    // Always notify if onOpenChange is provided
    props.onOpenChange?.(value);
    // Only update internal state if not controlled
    if (!isControlled()) {
      setInternalOpen(value);
    }
  };

  const toggleSidebar = () => setOpen(!open());

  // isMobile is an intentional stub — plan Q6=A deferred mobile Sheet support.
  // If mobile support is added later: createMemo(() => matchMedia('(max-width: 768px)').matches)
  // + effect to sync on media change.

  return (
    <SidebarContext.Provider
      value={{
        get state() {
          return open() ? "expanded" : "collapsed";
        },
        get open() {
          return open();
        },
        setOpen,
        get isMobile() {
          return false;
        },
        toggleSidebar,
      }}
    >
      {props.children}
    </SidebarContext.Provider>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export interface SidebarProps {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
  class?: string;
  children?: JSX.Element;
}

export function Sidebar(props: SidebarProps): JSX.Element {
  const merged = mergeProps({ side: "left" as const, variant: "sidebar" as const, collapsible: "offcanvas" as const }, props);

  if (merged.collapsible === "none" || props.collapsible === "none") {
    return (
      <aside
        data-slot="sidebar"
        class={cn(
          "flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground",
          merged.class,
        )}
        aria-label="Sidebar"
      >
        {merged.children}
      </aside>
    );
  }

  return (
    <div
      data-slot="sidebar"
      data-state={useSidebar()?.state}
      data-variant={merged.variant}
      data-side={merged.side}
      data-collapsible={merged.collapsible}
    >
      <div
        data-slot="sidebar-gap"
        class={cn(
          "relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear",
          merged.variant === "floating" || merged.variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
        )}
      />
      <aside
        data-sidebar="sidebar"
        data-slot="sidebar-inner"
        class={cn(
          "flex h-full flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-linear",
          merged.variant === "floating" || merged.variant === "inset" ? "p-2" : "group-data-[side=left]:border-r group-data-[side=right]:border-l",
          merged.variant === "floating" ? "rounded-lg shadow-sm ring-1 ring-sidebar-border" : "",
          merged.variant === "inset" ? "rounded-xl" : "",
          merged.class,
        )}
        aria-label="Sidebar"
      >
        {merged.children}
      </aside>
    </div>
  );
}

export function SidebarHeader(props: { class?: string; children?: JSX.Element }): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <div data-slot="sidebar-header" data-sidebar="header" class={cn("flex flex-col gap-2 p-2", local.class)} {...rest}>
      {local.children}
    </div>
  );
}

export function SidebarContent(props: { class?: string; children?: JSX.Element }): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <div data-slot="sidebar-content" data-sidebar="content" class={cn("flex min-h-0 flex-1 flex-col gap-0 overflow-auto", local.class)} {...rest}>
      {local.children}
    </div>
  );
}

export function SidebarFooter(props: { class?: string; children?: JSX.Element }): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <div data-slot="sidebar-footer" data-sidebar="footer" class={cn("flex flex-col gap-2 p-2", local.class)} {...rest}>
      {local.children}
    </div>
  );
}

export function SidebarSeparator(props: { class?: string; children?: JSX.Element }): JSX.Element {
  const [local] = splitProps(props, ["class"]);
  return (
    <div
      data-slot="sidebar-separator"
      data-sidebar="separator"
      class={cn("mx-2 w-auto bg-sidebar-border", local.class)}
      role="separator"
    />
  );
}

// ─── Group ─────────────────────────────────────────────────────────────────────

export function SidebarGroup(props: { class?: string; children?: JSX.Element }): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <div data-slot="sidebar-group" data-sidebar="group" class={cn("relative flex w-full min-w-0 flex-col p-2", local.class)} {...rest}>
      {local.children}
    </div>
  );
}

export function SidebarGroupLabel(props: { class?: string; children?: JSX.Element }): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <div
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      class={cn("flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear", local.class)}
      {...rest}
    >
      {local.children}
    </div>
  );
}

export function SidebarGroupContent(props: { class?: string; children?: JSX.Element }): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <div data-slot="sidebar-group-content" data-sidebar="group-content" class={cn("w-full text-sm", local.class)} {...rest}>
      {local.children}
    </div>
  );
}

export function SidebarGroupAction(props: { class?: string; children?: JSX.Element; "aria-label"?: string }): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children", "aria-label"]);
  return (
    <button
      type="button"
      data-slot="sidebar-group-action"
      data-sidebar="group-action"
      aria-label={local["aria-label"]}
      class={cn(
        "absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2",
        local.class,
      )}
      {...rest}
    >
      {local.children}
    </button>
  );
}

// ─── Menu ──────────────────────────────────────────────────────────────────────

export function SidebarMenu(props: { class?: string; children?: JSX.Element }): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <ul data-slot="sidebar-menu" data-sidebar="menu" class={cn("flex w-full min-w-0 flex-col gap-0", local.class)} role="menu" {...rest}>
      {local.children}
    </ul>
  );
}

export function SidebarMenuItem(props: { class?: string; children?: JSX.Element }): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <li data-slot="sidebar-menu-item" data-sidebar="menu-item" class={cn("group/menu-item relative", local.class)} role="none" {...rest}>
      {local.children}
    </li>
  );
}

export interface SidebarMenuButtonProps {
  isActive?: boolean;
  variant?: "default" | "outline";
  size?: "default" | "sm" | "lg";
  tooltip?: string;
  class?: string;
  children?: JSX.Element;
  onClick?: (e: MouseEvent) => void;
}

export function SidebarMenuButton(props: SidebarMenuButtonProps): JSX.Element {
  const [local, rest] = splitProps(props, ["isActive", "variant", "size", "tooltip", "class", "children", "onClick"]);

  const variant = () => local.variant ?? "default";
  const size = () => local.size ?? "default";

  const buttonClasses = () =>
    cn(
      "peer/menu-button group/menu-button group/row flex w-full items-center gap-2 overflow-hidden rounded-md ring-sidebar-ring outline-hidden transition-[width,height,padding] aria-disabled:pointer-events-none aria-disabled:opacity-50",
      !local.isActive ? "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" : "",
      "focus-visible:ring-2",
      "data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground",
      "data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground",
      variant() === "default" ? "p-2 text-sm" : "",
      variant() === "outline" ? "bg-background shadow-[0_0_0_1px_var(--sidebar-border)] hover:shadow-[0_0_0_1px_var(--sidebar-accent)]" : "",
      size() === "default" ? "h-8 text-sm" : "",
      size() === "sm" ? "h-7 text-xs" : "",
      size() === "lg" ? "h-12 text-sm" : "",
      local.isActive ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground" : "",
      local.class,
    );

  const buttonContent = (
    <button
      type="button"
      role="menuitem"
      class={buttonClasses()}
      onClick={local.onClick}
      {...rest}
    >
      {local.children}
    </button>
  );

  return (
    <Show
      when={local.tooltip}
      fallback={buttonContent}
    >
      <TooltipRoot>
        <TooltipTrigger>{buttonContent}</TooltipTrigger>
        <TooltipContent>
          {local.tooltip}
        </TooltipContent>
      </TooltipRoot>
    </Show>
  );
}

export interface SidebarMenuActionProps {
  showOnHover?: boolean;
  onClick?: (e: MouseEvent) => void;
  class?: string;
  children?: JSX.Element;
  "aria-label"?: string;
}

export function SidebarMenuAction(props: SidebarMenuActionProps): JSX.Element {
  const [local, rest] = splitProps(props, ["showOnHover", "onClick", "class", "children"]);
  return (
    <button
      type="button"
      data-slot="sidebar-menu-action"
      data-sidebar="menu-action"
      aria-label={props["aria-label"]}
      class={cn(
        "absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2",
        "peer-hover/menu-button:text-sidebar-accent-foreground",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "peer-data-[size=sm]/menu-button:top-1",
        local.showOnHover
          ? "opacity-0 group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-active/menu-button:text-sidebar-accent-foreground md:opacity-0"
          : "",
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

export function SidebarMenuBadge(props: { class?: string; children?: JSX.Element }): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <span
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      class={cn(
        "pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium text-sidebar-foreground tabular-nums select-none",
        "group-data-[collapsible=icon]:hidden",
        "peer-hover/menu-button:text-sidebar-accent-foreground",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-active/menu-button:text-sidebar-accent-foreground",
        local.class,
      )}
      aria-live="polite"
      {...rest}
    >
      {local.children}
    </span>
  );
}

export function SidebarMenuSkeleton(props: { showIcon?: boolean; class?: string }): JSX.Element {
  const [local] = splitProps(props, ["showIcon", "class"]);
  return (
    <div data-slot="sidebar-menu-skeleton" data-sidebar="menu-skeleton" class={cn("flex h-8 items-center gap-2 rounded-md px-2", local.class)}>
      <Show when={local.showIcon}>
        <div class="size-4 rounded-md bg-sidebar-ring/30" />
      </Show>
      <div class="h-4 flex-1 rounded bg-sidebar-ring/30" style={{ "max-width": "calc(var(--skeleton-width, 75%))" }} />
    </div>
  );
}

// ─── Sub ───────────────────────────────────────────────────────────────────────

export function SidebarMenuSub(props: { class?: string; children?: JSX.Element }): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      class={cn(
        // Codeman override: left-only indent so subItem right edge aligns
        // with Item buttons (Rename + Delete line up across rows). shadcn's
        // default uses symmetric mx-3.5 + px-2.5.
        "ml-3.5 flex min-w-0 flex-col gap-1 border-l border-sidebar-border pl-2.5 py-0.5",
        "group-data-[collapsible=icon]:hidden",
        local.class,
      )}
      role="menu"
      {...rest}
    >
      {local.children}
    </ul>
  );
}

export function SidebarMenuSubItem(props: { class?: string; children?: JSX.Element }): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class={cn("group/menu-sub-item relative", local.class)} role="none" {...rest}>
      {local.children}
    </li>
  );
}

export interface SidebarMenuSubButtonProps {
  isActive?: boolean;
  size?: "sm" | "md";
  class?: string;
  children?: JSX.Element;
  onClick?: (e: MouseEvent) => void;
}

export function SidebarMenuSubButton(props: SidebarMenuSubButtonProps): JSX.Element {
  const [local, rest] = splitProps(props, ["isActive", "size", "class", "children", "onClick"]);

  return (
    <a
      role="menuitem"
      class={cn(
        "group/row flex h-7 min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "focus-visible:ring-2",
        "active:bg-sidebar-accent active:text-sidebar-accent-foreground",
        "aria-disabled:pointer-events-none aria-disabled:opacity-50",
        "data-[size=md]:text-sm",
        "data-[size=sm]:text-xs",
        "data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground",
        "group-data-[collapsible=icon]:hidden",
        local.size === "sm" ? "text-xs" : "text-sm",
        local.isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "",
        local.class,
      )}
      onClick={local.onClick}
      {...rest}
    >
      {local.children}
    </a>
  );
}

// ─── Inset + Input + Rail + Trigger ───────────────────────────────────────────

export function SidebarInset(props: { class?: string; children?: JSX.Element }): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <main
      data-slot="sidebar-inset"
      class={cn(
        "relative flex w-full flex-1 flex-col bg-background",
        "peer-data-[variant=inset]:m-2 peer-data-[variant=inset]:ml-0",
        "peer-data-[variant=inset]:rounded-xl peer-data-[variant=inset]:shadow-sm",
        "peer-data-[state=collapsed]:peer-data-[variant=inset]:ml-2",
        local.class,
      )}
      {...rest}
    >
      {local.children}
    </main>
  );
}

export function SidebarInput(props: { class?: string; placeholder?: string }): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "placeholder"]);
  return (
    <input
      type="text"
      data-slot="sidebar-input"
      data-sidebar="input"
      placeholder={local.placeholder}
      class={cn("flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-none ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50", local.class)}
      {...rest}
    />
  );
}

export function SidebarRail(props: { class?: string; onClick?: (e: MouseEvent) => void }): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "onClick"]);
  return (
    <button
      type="button"
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={local.onClick}
      class={cn(
        "absolute inset-y-0 z-20 hidden w-4 cursor-col-resize items-center bg-transparent transition-all ease-linear",
        "hover:bg-sidebar-border/50",
        "group-data-[side=left]:-right-4 group-data-[side=right]:left-0",
        "sm:flex",
        local.class,
      )}
      {...rest}
    />
  );
}

export function SidebarTrigger(props: { class?: string; children?: JSX.Element; "aria-label"?: string; onClick?: (e: MouseEvent) => void }): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children", "aria-label", "onClick"]);
  const ctx = useSidebar();

  return (
    <button
      type="button"
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      aria-label={local["aria-label"] ?? "Toggle sidebar"}
      class={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        local.class,
      )}
      onClick={(e: MouseEvent) => {
        local.onClick?.(e);
        ctx?.toggleSidebar();
      }}
      {...rest}
    >
      {local.children}
    </button>
  );
}
