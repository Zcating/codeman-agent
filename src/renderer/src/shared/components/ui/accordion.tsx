//! accordion.tsx — shadcn-style Accordion primitive wrapping @ark-ui/solid Accordion.
//! Per ADR-0023 D8-W6 Dialog case precedent (single authorized instance) and `.omo/plans/sidebar-reshim.md` Q10=B / Q28 v5=A decisions (plan-driven authorization for sidebar/accordion/tooltip wrapper atoms): ui/ atoms MAY wrap @ark-ui/solid when the wrapper is a shadcn/ui-style primitive (per codeman-agent project context).
//! Per plan: Q28 v5=A —新建 ui/accordion.tsx + chat tree; 包 @ark-ui/solid Accordion.

import type { Component, JSX } from "solid-js";
import { splitProps } from "solid-js";
import { AccordionRoot, AccordionItem, AccordionItemTrigger, AccordionItemContent } from "@ark-ui/solid/accordion";
import { cn } from "../../lib/cn";

export interface AccordionProps {
  /** Allow multiple items to be open simultaneously. Default: false */
  multiple?: boolean;
  /** Allow all items to be closed. Default: true */
  collapsible?: boolean;
  /** Uncontrolled: initial open items */
  defaultValue?: string[];
  /** Controlled: currently open items */
  value?: string[];
  /** Controlled: called when value changes */
  onValueChange?: (details: { value: string[] }) => void;
  class?: string;
  children?: JSX.Element;
}

export const AccordionRootComp: Component<AccordionProps> = (props) => {
  const [local, rest] = splitProps(props, ["multiple", "collapsible", "defaultValue", "value", "onValueChange", "class", "children"]);

  return (
    <AccordionRoot
      {...rest}
      multiple={local.multiple}
      collapsible={local.collapsible}
      defaultValue={local.defaultValue}
      value={local.value}
      onValueChange={(details: { value: string[] }) => {
        local.onValueChange?.(details);
      }}
      class={cn("flex w-full flex-col", local.class)}
    >
      {local.children}
    </AccordionRoot>
  );
};

export interface AccordionItemProps {
  value: string;
  disabled?: boolean;
  class?: string;
  children?: JSX.Element;
}

export const AccordionItemComp: Component<AccordionItemProps> = (props) => {
  const [local, rest] = splitProps(props, ["value", "disabled", "class", "children"]);
  return (
    <AccordionItem
      {...rest}
      value={local.value}
      disabled={local.disabled}
      class={cn("not-last:border-b border-sidebar-border", local.class)}
    >
      {local.children}
    </AccordionItem>
  );
};

export interface AccordionTriggerProps {
  class?: string;
  children?: JSX.Element;
}

export const AccordionTrigger: Component<AccordionTriggerProps> = (props) => {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <AccordionItemTrigger
      class={cn(
        "group/accordion-trigger relative flex flex-1 items-start justify-between rounded-lg border border-transparent py-2.5 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
        local.class,
      )}
      {...rest}
    >
      {local.children}
    </AccordionItemTrigger>
  );
};

export interface AccordionContentProps {
  class?: string;
  children?: JSX.Element;
}

export const AccordionContent: Component<AccordionContentProps> = (props) => {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <AccordionItemContent
      class="overflow-hidden text-sm data-open:animate-accordion-down data-closed:animate-accordion-up"
      {...rest}
    >
      <div
        class={cn(
          "pt-0 pb-2.5 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
          local.class,
        )}
      >
        {local.children}
      </div>
    </AccordionItemContent>
  );
};

// Re-export with shadcn/ui-style names
export const Accordion = AccordionRootComp;
export { AccordionItemComp as AccordionItem };
