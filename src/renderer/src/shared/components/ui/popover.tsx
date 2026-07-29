//! popover.tsx -- shadcn-style Popover primitive wrapping @ark-ui/solid Popover.
//!
//! Compound components: Popover, PopoverAnchor, PopoverTrigger, PopoverContent,
//! PopoverTitle, PopoverDescription, PopoverClose.
//!
//! Notes on the API:
//! - Popover is controlled via `open` / `defaultOpen` + `onOpenChange`.
//! - PopoverContent renders inside a Portal; positioning is delegated to
//!   PopoverPositioner, which handles viewport collision and flipping.
//! - PopoverAnchor accepts a virtual `getBoundingClientRect()` ref (the anchor
//!   rect) so callers can re-anchor when the trigger is not a real element.

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
  /** Optional id passed to @ark-ui for deterministic ids. */
  id?: ArkPopoverRootProps["id"];
  /**
   * Positioning options forwarded to @ark-ui/solid. Use this instead of
   * passing `side` / `align` to PopoverContent; positioning is configured
   * on the root, not the positioner.
   */
  positioning?: ArkPopoverRootProps["positioning"];
  /**
   * Whether @ark-ui/solid should auto-focus the popover content on open.
   * Default in @ark-ui is `true`, which steals focus from any trigger
   * outside the popover. For "anchored to a text input" use cases (slash
   * menus, mention pickers) set this to `false` so the input keeps focus
   * and keystrokes continue to flow into it.
   */
  autoFocus?: ArkPopoverRootProps["autoFocus"];
  /**
   * Whether @ark-ui/solid should restore focus to the trigger when the
   * popover closes. Default is `true`. Set to `false` if there is no
   * trigger (controlled via `open` prop) or if you manage focus yourself.
   */
  restoreFocus?: ArkPopoverRootProps["restoreFocus"];
  /**
   * Whether the popover should close when the user clicks outside of it.
   * @ark-ui default is `true`. Set to `false` if outside-click should be
   * handled by the caller (e.g. when the popover is anchored to a text
   * input and the user is expected to keep interacting with it).
   */
  closeOnInteractOutside?: ArkPopoverRootProps["closeOnInteractOutside"];
  /**
   * Whether the popover should close when the user presses Escape.
   * @ark-ui default is `true`. Useful to disable if Escape is handled
   * at a higher level (e.g. closing the parent dialog).
   */
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
  /** Optional class for the anchor wrapper. */
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
