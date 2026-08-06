
import { splitProps, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import {
  Menu as ArkMenu,
  type MenuRootProps as ArkMenuRootProps,
  type MenuTriggerProps as ArkMenuTriggerProps,
  type MenuContentProps as ArkMenuContentProps,
  type MenuItemProps as ArkMenuItemProps,
  type MenuItemGroupProps as ArkMenuItemGroupProps,
  type MenuCheckboxItemProps as ArkMenuCheckboxItemProps,
  type MenuRadioItemGroupProps as ArkMenuRadioItemGroupProps,
  type MenuRadioItemProps as ArkMenuRadioItemProps,
  type MenuSeparatorProps as ArkMenuSeparatorProps,
  type MenuTriggerItemProps as ArkMenuTriggerItemProps,
} from "@ark-ui/solid/menu";
import { Check, ChevronRight } from "lucide-solid";
import { cn } from "@codeman-frontend/shared/lib/cn";

// ─── Root ────────────────────────────────────────────────────────────────────

export interface DropdownMenuProps {
  open?: ArkMenuRootProps["open"];
  defaultOpen?: ArkMenuRootProps["defaultOpen"];
  onOpenChange?: (details: { open: boolean }) => void;
  positioning?: ArkMenuRootProps["positioning"];
  closeOnSelect?: ArkMenuRootProps["closeOnSelect"];
  onSelect?: ArkMenuRootProps["onSelect"];
  "aria-label"?: string;
  children?: JSX.Element;
}

export function DropdownMenu(props: DropdownMenuProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "open",
    "defaultOpen",
    "onOpenChange",
    "positioning",
    "closeOnSelect",
    "onSelect",
    "aria-label",
    "children",
  ]);
  return (
    <ArkMenu.Root
      data-slot="dropdown-menu"
      open={local.open}
      defaultOpen={local.defaultOpen}
      positioning={local.positioning}
      closeOnSelect={local.closeOnSelect}
      onSelect={local.onSelect}
      aria-label={local["aria-label"]}
      onOpenChange={(details: { open: boolean }) => {
        local.onOpenChange?.(details);
      }}
      {...rest}
    >
      {local.children}
    </ArkMenu.Root>
  );
}

// ─── Trigger ─────────────────────────────────────────────────────────────────

export interface DropdownMenuTriggerProps extends ArkMenuTriggerProps {
  class?: string;
  children?: JSX.Element;
  "data-testid"?: string;
}

export function DropdownMenuTrigger(props: DropdownMenuTriggerProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children", "data-testid"]);
  return (
    <ArkMenu.Trigger
      data-slot="dropdown-menu-trigger"
      data-testid={local["data-testid"]}
      class={cn("inline-flex items-center justify-center", local.class)}
      {...rest}
    >
      {local.children}
    </ArkMenu.Trigger>
  );
}

// ─── Content ─────────────────────────────────────────────────────────────────

export interface DropdownMenuContentProps extends ArkMenuContentProps {
  class?: string;
  children?: JSX.Element;
  "data-testid"?: string;
}

export function DropdownMenuContent(props: DropdownMenuContentProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children", "data-testid"]);
  return (
    // 浮层必须 Portal 到 body：渲染在行 DOM 内会被侧边栏 overflow 裁剪、
    // 且 z-index 与后续兄弟行同层而被遮盖（诊断见 debugging 会话）。
    <Portal>
      <ArkMenu.Positioner data-slot="dropdown-menu-positioner" class="isolate z-50">
        <ArkMenu.Content
          data-slot="dropdown-menu-content"
          data-testid={local["data-testid"]}
          class={cn(
            "z-50 min-w-32 overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground text-sm shadow-md ring-1 ring-foreground/10 outline-hidden",
            "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            local.class,
          )}
          {...rest}
        >
          {local.children}
        </ArkMenu.Content>
      </ArkMenu.Positioner>
    </Portal>
  );
}

// ─── Group / Label ───────────────────────────────────────────────────────────

export interface DropdownMenuGroupProps extends ArkMenuItemGroupProps {
  class?: string;
  children?: JSX.Element;
}

export function DropdownMenuGroup(props: DropdownMenuGroupProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <ArkMenu.ItemGroup data-slot="dropdown-menu-group" class={local.class} {...rest}>
      {local.children}
    </ArkMenu.ItemGroup>
  );
}

export interface DropdownMenuLabelProps {
  class?: string;
  inset?: boolean;
  children?: JSX.Element;
}

export function DropdownMenuLabel(props: DropdownMenuLabelProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "inset", "children"]);
  return (
    <div
      data-slot="dropdown-menu-label"
      data-inset={local.inset}
      class={cn(
        "px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-7",
        local.class,
      )}
      {...rest}
    >
      {local.children}
    </div>
  );
}

// ─── Item ────────────────────────────────────────────────────────────────────

export interface DropdownMenuItemProps extends ArkMenuItemProps {
  class?: string;
  inset?: boolean;
  variant?: "default" | "destructive";
  children?: JSX.Element;
  "data-testid"?: string;
}

export function DropdownMenuItem(props: DropdownMenuItemProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "inset", "variant", "children", "data-testid"]);
  return (
    <ArkMenu.Item
      data-slot="dropdown-menu-item"
      data-testid={local["data-testid"]}
      data-inset={local.inset}
      data-variant={local.variant}
      class={cn(
        "group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none",
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        "data-inset:pl-7",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "not-data-[variant=destructive]:data-highlighted:text-accent-foreground",
        "data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive/10 data-[variant=destructive]:data-highlighted:text-destructive",
        "dark:data-[variant=destructive]:data-highlighted:bg-destructive/20",
        "data-[variant=destructive]:*:[svg]:text-destructive",
        local.class,
      )}
      {...rest}
    >
      {local.children}
    </ArkMenu.Item>
  );
}

// ─── Sub menu ────────────────────────────────────────────────────────────────

export interface DropdownMenuSubProps {
  positioning?: ArkMenuRootProps["positioning"];
  children?: JSX.Element;
}

export function DropdownMenuSub(props: DropdownMenuSubProps): JSX.Element {
  const [local, rest] = splitProps(props, ["positioning", "children"]);
  return (
    <ArkMenu.Root
      data-slot="dropdown-menu-sub"
      positioning={local.positioning ?? { placement: "right-start" }}
      {...rest}
    >
      {local.children}
    </ArkMenu.Root>
  );
}

export interface DropdownMenuSubTriggerProps extends ArkMenuTriggerItemProps {
  class?: string;
  inset?: boolean;
  children?: JSX.Element;
}

export function DropdownMenuSubTrigger(props: DropdownMenuSubTriggerProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "inset", "children"]);
  return (
    <ArkMenu.TriggerItem
      data-slot="dropdown-menu-sub-trigger"
      data-inset={local.inset}
      class={cn(
        "flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none",
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        "data-inset:pl-7",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        local.class,
      )}
      {...rest}
    >
      {local.children}
      <ChevronRight class="ml-auto" />
    </ArkMenu.TriggerItem>
  );
}

export interface DropdownMenuSubContentProps extends ArkMenuContentProps {
  class?: string;
  children?: JSX.Element;
}

export function DropdownMenuSubContent(props: DropdownMenuSubContentProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    // 二级菜单同样 Portal 到 body，避免被父菜单 / 侧边栏容器裁剪遮盖。
    <Portal>
      <ArkMenu.Positioner data-slot="dropdown-menu-sub-positioner" class="isolate z-50">
        <ArkMenu.Content
          data-slot="dropdown-menu-sub-content"
          class={cn(
            "z-50 w-auto min-w-24 overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground text-sm shadow-md ring-1 ring-foreground/10 outline-hidden",
            "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            local.class,
          )}
          {...rest}
        >
          {local.children}
        </ArkMenu.Content>
      </ArkMenu.Positioner>
    </Portal>
  );
}

// ─── Checkbox item ───────────────────────────────────────────────────────────

export interface DropdownMenuCheckboxItemProps extends ArkMenuCheckboxItemProps {
  class?: string;
  children?: JSX.Element;
  "data-testid"?: string;
}

export function DropdownMenuCheckboxItem(props: DropdownMenuCheckboxItemProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children", "data-testid"]);
  return (
    <ArkMenu.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-testid={local["data-testid"]}
      class={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none",
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        local.class,
      )}
      {...rest}
    >
      <span
        class="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <ArkMenu.ItemIndicator>
          <Check />
        </ArkMenu.ItemIndicator>
      </span>
      {local.children}
    </ArkMenu.CheckboxItem>
  );
}

// ─── Radio group / item ──────────────────────────────────────────────────────

export interface DropdownMenuRadioGroupProps extends ArkMenuRadioItemGroupProps {
  class?: string;
  children?: JSX.Element;
}

export function DropdownMenuRadioGroup(props: DropdownMenuRadioGroupProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <ArkMenu.RadioItemGroup data-slot="dropdown-menu-radio-group" class={local.class} {...rest}>
      {local.children}
    </ArkMenu.RadioItemGroup>
  );
}

export interface DropdownMenuRadioItemProps extends ArkMenuRadioItemProps {
  class?: string;
  children?: JSX.Element;
  "data-testid"?: string;
}

export function DropdownMenuRadioItem(props: DropdownMenuRadioItemProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children", "data-testid"]);
  return (
    <ArkMenu.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-testid={local["data-testid"]}
      class={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none",
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        local.class,
      )}
      {...rest}
    >
      <span
        class="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <ArkMenu.ItemIndicator>
          <Check />
        </ArkMenu.ItemIndicator>
      </span>
      {local.children}
    </ArkMenu.RadioItem>
  );
}

// ─── Separator / Shortcut ────────────────────────────────────────────────────

export interface DropdownMenuSeparatorProps extends ArkMenuSeparatorProps {
  class?: string;
  "data-testid"?: string;
}

export function DropdownMenuSeparator(props: DropdownMenuSeparatorProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "data-testid"]);
  return (
    <ArkMenu.Separator
      data-slot="dropdown-menu-separator"
      data-testid={local["data-testid"]}
      class={cn("-mx-1 my-1 h-px bg-border", local.class)}
      {...rest}
    />
  );
}

export interface DropdownMenuShortcutProps {
  class?: string;
  children?: JSX.Element;
}

export function DropdownMenuShortcut(props: DropdownMenuShortcutProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      class={cn("ml-auto text-xs tracking-widest text-muted-foreground", local.class)}
      {...rest}
    >
      {local.children}
    </span>
  );
}
