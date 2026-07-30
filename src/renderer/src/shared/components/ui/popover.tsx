
import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import {
  Popover as ArkPopover,
  type PopoverRootProps as ArkPopoverRootProps,
  type PopoverAnchorProps as ArkPopoverAnchorProps,
  type PopoverTriggerProps as ArkPopoverTriggerProps,
  type PopoverContentProps as ArkPopoverContentProps,
  type PopoverTitleProps as ArkPopoverTitleProps,
  type PopoverDescriptionProps as ArkPopoverDescriptionProps,
  type PopoverCloseTriggerProps as ArkPopoverCloseTriggerProps,
} from "@ark-ui/solid/popover";
import { cn } from "@codeman-frontend/shared/lib/cn";

export interface PopoverProps {
  open?: ArkPopoverRootProps["open"];
  defaultOpen?: ArkPopoverRootProps["defaultOpen"];
  onOpenChange?: (details: { open: boolean }) => void;
  id?: ArkPopoverRootProps["id"];
  positioning?: ArkPopoverRootProps["positioning"];
  autoFocus?: ArkPopoverRootProps["autoFocus"];
  restoreFocus?: ArkPopoverRootProps["restoreFocus"];
  closeOnInteractOutside?: ArkPopoverRootProps["closeOnInteractOutside"];
  closeOnEscape?: ArkPopoverRootProps["closeOnEscape"];
  children?: JSX.Element;
}

export function Popover(props: PopoverProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "open",
    "defaultOpen",
    "onOpenChange",
    "id",
    "positioning",
    "autoFocus",
    "restoreFocus",
    "closeOnInteractOutside",
    "closeOnEscape",
    "children",
  ]);
  return (
    <ArkPopover.Root
      data-slot="popover"
      id={local.id}
      open={local.open}
      defaultOpen={local.defaultOpen}
      positioning={local.positioning}
      autoFocus={local.autoFocus}
      restoreFocus={local.restoreFocus}
      closeOnInteractOutside={local.closeOnInteractOutside}
      closeOnEscape={local.closeOnEscape}
      onOpenChange={(details: { open: boolean }) => {
        local.onOpenChange?.(details);
      }}
      {...rest}
    >
      {local.children}
    </ArkPopover.Root>
  );
}

export interface PopoverAnchorProps extends ArkPopoverAnchorProps {
  class?: string;
}

export function PopoverAnchor(props: PopoverAnchorProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <ArkPopover.Anchor
      data-slot="popover-anchor"
      class={local.class}
      {...rest}
    />
  );
}

export interface PopoverTriggerProps extends ArkPopoverTriggerProps {
  class?: string;
  children?: JSX.Element;
  "data-testid"?: string;
}

export function PopoverTrigger(props: PopoverTriggerProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children", "data-testid"]);
  return (
    <ArkPopover.Trigger
      data-slot="popover-trigger"
      data-testid={local["data-testid"]}
      class={cn("inline-flex items-center justify-center", local.class)}
      {...rest}
    >
      {local.children}
    </ArkPopover.Trigger>
  );
}

export interface PopoverContentProps extends ArkPopoverContentProps {
  class?: string;
  children?: JSX.Element;
  "data-testid"?: string;
}

export function PopoverContent(props: PopoverContentProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children", "data-testid"]);
  return (
    <ArkPopover.Positioner data-slot="popover-positioner" class="isolate z-50">
      <ArkPopover.Content
        data-slot="popover-content"
        data-testid={local["data-testid"]}
        class={cn(
          "z-50 flex origin-(--transform-origin) flex-col gap-0 rounded-lg border border-border bg-popover p-0 text-popover-foreground text-sm shadow-md ring-1 ring-foreground/10 outline-hidden",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          local.class,
        )}
        {...rest}
      >
        {local.children}
      </ArkPopover.Content>
    </ArkPopover.Positioner>
  );
}

export interface PopoverTitleProps extends ArkPopoverTitleProps {
  class?: string;
}

export function PopoverTitle(props: PopoverTitleProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <ArkPopover.Title
      data-slot="popover-title"
      class={cn("font-medium text-foreground", local.class)}
      {...rest}
    />
  );
}

export interface PopoverDescriptionProps extends ArkPopoverDescriptionProps {
  class?: string;
}

export function PopoverDescription(props: PopoverDescriptionProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <ArkPopover.Description
      data-slot="popover-description"
      class={cn("text-muted-foreground", local.class)}
      {...rest}
    />
  );
}

export interface PopoverCloseProps extends ArkPopoverCloseTriggerProps {
  class?: string;
  children?: JSX.Element;
  "data-testid"?: string;
}

export function PopoverClose(props: PopoverCloseProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "children", "data-testid"]);
  return (
    <ArkPopover.CloseTrigger
      data-slot="popover-close"
      data-testid={local["data-testid"]}
      class={cn("inline-flex items-center justify-center", local.class)}
      {...rest}
    >
      {local.children}
    </ArkPopover.CloseTrigger>
  );
}
