
import { splitProps } from "solid-js";
import type { Component, ComponentProps } from "solid-js";
import {
  SplitterRoot,
  SplitterPanel,
  SplitterResizeTrigger,
  SplitterResizeTriggerIndicator,
} from "@ark-ui/solid/splitter";
import { cn } from "@codeman-frontend/shared/lib/cn";

// Default classes for ResizableHandle — kept neutral: no blue ring on focus,
// no orange-leaning hover, no colored borders on the wider hit area, and
// no browser-default focus outline (which would pick up the host OS accent
// color and render orange on a Windows machine with an orange accent theme).
// focus-visible:bg-foreground/20 is the non-color focus indicator.
// Track inherits theme via bg-border (neutral gray-blue at hue 230, low chroma).
const resizableHandleDefaultClasses =
  "relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 data-[orientation=vertical]:flex-col data-[orientation=vertical]:h-px data-[orientation=vertical]:w-full data-[orientation=vertical]:after:left-0 data-[orientation=vertical]:after:h-1 data-[orientation=vertical]:after:w-full data-[orientation=vertical]:after:-translate-y-1/2 data-[orientation=vertical]:after:translate-x-0 outline-none focus-visible:outline-none focus-visible:bg-foreground/20 hover:bg-foreground/10 aria-disabled:pointer-events-none aria-disabled:opacity-50";

export const ResizablePanelGroup: Component<
  ComponentProps<typeof SplitterRoot>
> = (props) => {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <SplitterRoot
      data-slot="resizable-panel-group"
      class={cn(
        "flex h-full w-full aria-[orientation=vertical]:flex-col",
        local.class,
      )}
      {...rest}
    >
      {local.children}
    </SplitterRoot>
  );
};

export const ResizablePanel: Component<
  ComponentProps<typeof SplitterPanel>
> = (props) => {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <SplitterPanel
      data-slot="resizable-panel"
      class={local.class}
      {...rest}
    >
      {local.children}
    </SplitterPanel>
  );
};

interface ResizableHandleProps
  extends ComponentProps<typeof SplitterResizeTrigger> {
  withHandle?: boolean;
}

export const ResizableHandle: Component<ResizableHandleProps> = (props) => {
  const [local, rest] = splitProps(props, ["class", "withHandle", "children"]);
  return (
    <SplitterResizeTrigger
      data-slot="resizable-handle"
      class={cn(resizableHandleDefaultClasses, local.class)}
      {...rest}
    >
      {local.children}
      {local.withHandle && (
        <SplitterResizeTriggerIndicator class="z-10 flex h-6 w-1 shrink-0 rounded-lg bg-border" />
      )}
    </SplitterResizeTrigger>
  );
};
