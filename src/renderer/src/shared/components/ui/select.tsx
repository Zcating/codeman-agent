
import type { JSX } from "solid-js";
import { createSignal, onCleanup, onMount, splitProps } from "solid-js";
import {
  Select as SelectPrimitive,
  useSelectContext,
} from "@ark-ui/solid";
import { Check, ChevronDown, ChevronUp } from "lucide-solid";
import { cn } from "@codeman-frontend/shared/lib/cn";

export const SelectRoot = SelectPrimitive.Root;

export function SelectGroup(props: SelectPrimitive.ItemGroupProps) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <SelectPrimitive.ItemGroup
      data-slot="select-group"
      class={cn("scroll-my-1 p-1", local.class)}
      {...rest}
    />
  );
}

export function SelectValue(props: SelectPrimitive.ValueTextProps) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <SelectPrimitive.ValueText
      data-slot="select-value"
      class={cn("flex flex-1 text-left", local.class)}
      {...rest}
    />
  );
}

export interface SelectTriggerProps extends SelectPrimitive.TriggerProps {
  size?: "sm" | "default";
}

export function SelectTrigger(props: SelectTriggerProps) {
  const [local, rest] = splitProps(props, ["class", "size", "children"]);
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={local.size ?? "default"}
      class={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder-shown:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        local.class,
      )}
      {...rest}
    >
      {local.children}
      <SelectPrimitive.Indicator>
        <ChevronDown class="pointer-events-none size-4 text-muted-foreground" />
      </SelectPrimitive.Indicator>
    </SelectPrimitive.Trigger>
  );
}

export interface SelectContentProps extends SelectPrimitive.ContentProps {
  alignItemWithTrigger?: boolean;
}

export function SelectContent(props: SelectContentProps) {
  const [local, rest] = splitProps(props, [
    "class", "children",
    "alignItemWithTrigger",
  ]);
  return (
    <SelectPrimitive.Positioner class="isolate z-50">
      <SelectPrimitive.Content
        data-slot="select-content"
        data-align-trigger={local.alignItemWithTrigger}
        class={cn(
          "relative isolate z-50 max-h-(--available-height) w-(--reference-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          local.class,
        )}
        {...rest}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.List>
          {local.children}
        </SelectPrimitive.List>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Positioner>
  );
}

export function SelectLabel(props: SelectPrimitive.ItemGroupLabelProps) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <SelectPrimitive.ItemGroupLabel
      data-slot="select-label"
      class={cn("px-1.5 py-1 text-xs text-muted-foreground", local.class)}
      {...rest}
    />
  );
}

export function SelectItem(props: SelectPrimitive.ItemProps) {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      class={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:hover:**:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        local.class,
      )}
      {...rest}
    >
      <SelectPrimitive.ItemText class="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
        {local.children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator>
        <span class="pointer-events-none absolute inset-y-0 right-2 flex items-center justify-center">
          <Check class="pointer-events-none" />
        </span>
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export function SelectSeparator(props: JSX.HTMLAttributes<HTMLHRElement>) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <hr
      data-slot="select-separator"
      class={cn(
        "pointer-events-none -mx-1 my-1 h-px bg-border",
        local.class,
      )}
      {...rest}
    />
  );
}

export function SelectScrollUpButton(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, rest] = splitProps(props, ["class"]);
  const [hidden, setHidden] = createSignal(false);
  let btnRef: HTMLDivElement | undefined;

  onMount(() => {
    const content = btnRef?.closest<HTMLElement>('[data-part="content"]');
    if (!content) return;
    const update = () => setHidden(content.scrollTop <= 1);
    update();
    requestAnimationFrame(update);
    content.addEventListener("scroll", update, { passive: true });
    onCleanup(() => content.removeEventListener("scroll", update));
  });

  return (
    <div
      ref={btnRef}
      data-slot="select-scroll-up-button"
      data-hidden={hidden() || undefined}
      class={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4 data-[hidden]:hidden",
        local.class,
      )}
      {...rest}
    >
      <ChevronUp />
    </div>
  );
}

export function SelectScrollDownButton(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, rest] = splitProps(props, ["class"]);
  const [hidden, setHidden] = createSignal(false);
  let btnRef: HTMLDivElement | undefined;

  onMount(() => {
    const content = btnRef?.closest<HTMLElement>('[data-part="content"]');
    if (!content) return;
    const update = () =>
      setHidden(content.scrollHeight - content.clientHeight - content.scrollTop <= 1);
    update();
    requestAnimationFrame(update);
    content.addEventListener("scroll", update, { passive: true });
    onCleanup(() => content.removeEventListener("scroll", update));
  });

  return (
    <div
      ref={btnRef}
      data-slot="select-scroll-down-button"
      data-hidden={hidden() || undefined}
      class={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4 data-[hidden]:hidden",
        local.class,
      )}
      {...rest}
    >
      <ChevronDown />
    </div>
  );
}

export function SelectAction(props: { children?: JSX.Element }) {
  const ctx = useSelectContext();
  return (
    <>
      <hr role="separator" data-slot="select-separator" class="my-2 border-border" />
      <div onClick={() => ctx().setOpen(false)}>{props.children}</div>
    </>
  );
}

export { createListCollection } from "@ark-ui/solid";
