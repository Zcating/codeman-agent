

import {
  AccordionItem as ArkAccordionItem,
  AccordionItemContent,
  AccordionItemTrigger,
  AccordionRoot,
} from "@ark-ui/solid/accordion";
import { ChevronRightIcon } from "lucide-solid";
import type { Component, ComponentProps } from "solid-js";
import { splitProps } from "solid-js";
import { cn } from "@codeman-frontend/shared/lib/cn";

export const Accordion: Component<ComponentProps<typeof AccordionRoot>> = (props) => {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <AccordionRoot
      data-slot="accordion"
      class={cn("flex w-full flex-col", local.class)}
      {...rest}
    />
  );
};

export const AccordionItem: Component<
  ComponentProps<typeof ArkAccordionItem>
> = (props) => {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <ArkAccordionItem
      data-slot="accordion-item"
      class={cn("not-last:border-b border-sidebar-border", local.class)}
      {...rest}
    />
  );
};

const triggerClasses =
  "group/accordion-trigger relative flex flex-1 items-start justify-between rounded-lg border border-transparent py-2.5 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

export const AccordionTrigger: Component<
  ComponentProps<typeof AccordionItemTrigger>
> = (props) => {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <AccordionItemTrigger
      data-slot="accordion-trigger"
      class={cn(triggerClasses, local.class)}
      {...rest}
    >
      {local.children}
      <ChevronRightIcon
        data-slot="accordion-trigger-icon"
        class="pointer-events-none shrink-0 size-4 text-muted-foreground transition-transform duration-200 group-aria-expanded/accordion-trigger:rotate-90"
      />
    </AccordionItemTrigger>
  );
};

const contentClasses =
  "overflow-hidden text-sm data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up";
const contentInnerClasses =
  "pt-0 pb-2.5 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4";

export const AccordionContent: Component<
  ComponentProps<typeof AccordionItemContent>
> = (props) => {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <AccordionItemContent
      data-slot="accordion-content"
      class={cn(contentClasses, local.class)}
      {...rest}
    >
      <div class={cn(contentInnerClasses, local.class)}>{local.children}</div>
    </AccordionItemContent>
  );
};