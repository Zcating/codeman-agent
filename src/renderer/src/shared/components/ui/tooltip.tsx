

import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import { TooltipRoot as ArkTooltipRoot, TooltipTrigger as ArkTooltipTrigger, TooltipContent as ArkTooltipContent, TooltipPositioner, TooltipArrow } from "@ark-ui/solid/tooltip";
import { cn } from "@codeman-frontend/shared/lib/cn";

export interface TooltipProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (details: { open: boolean }) => void;
  children?: JSX.Element;
}

export function Tooltip(props: TooltipProps): JSX.Element {
  const [local, rest] = splitProps(props, ["open", "defaultOpen", "onOpenChange", "children"]);
  return (
    <ArkTooltipRoot
      {...rest}
      open={local.open}
      defaultOpen={local.defaultOpen}
      onOpenChange={(details: { open: boolean }) => {
        local.onOpenChange?.(details);
      }}
    >
      {local.children}
    </ArkTooltipRoot>
  );
}

export interface TooltipTriggerProps {
  class?: string;
  children?: JSX.Element;
}

export function TooltipTrigger(props: TooltipTriggerProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <ArkTooltipTrigger
      class={cn("inline-flex items-center justify-center", local.class)}
      {...rest}
    >
      {local.children}
    </ArkTooltipTrigger>
  );
}

export interface TooltipContentProps {
  
  side?: never;
  
  align?: never;
  class?: string;
  children?: JSX.Element;
  hidden?: boolean;
}

export function TooltipContent(props: TooltipContentProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children", "hidden"]);
  return (
    <TooltipPositioner
      class="isolate z-50"
    >
      <ArkTooltipContent
        {...rest}
        class={cn(
          "z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background",
          "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95",
          "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
          "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          local.class,
        )}
        hidden={local.hidden}
      >
        {local.children}
        <TooltipArrow class="size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] bg-foreground" />
      </ArkTooltipContent>
    </TooltipPositioner>
  );
}
