
import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import {
  ScrollArea as ArkScrollArea,
  type ScrollAreaRootProps as ArkScrollAreaRootProps,
  type ScrollAreaScrollbarProps as ArkScrollAreaScrollbarProps,
  type ScrollAreaThumbProps as ArkScrollAreaThumbProps,
} from "@ark-ui/solid/scroll-area";
import { cn } from "@codeman-frontend/shared/lib/cn";

export interface ScrollAreaProps extends ArkScrollAreaRootProps {
  class?: string;
  children?: JSX.Element;
  "data-testid"?: string;
  /**
   * ADR-0039 滚动契约标记。落在 Viewport（真正的滚动元素）上，而非 Root：
   * Root 只是定位壳（relative overflow-hidden），zag 在 Viewport 上注入
   * overflow:auto，scrollHeight/clientHeight 语义属于 Viewport。
   */
  "data-scroll-region"?: string;
}

export function ScrollArea(props: ScrollAreaProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "class",
    "children",
    "data-testid",
    "data-scroll-region",
  ]);
  return (
    <ArkScrollArea.Root
      data-slot="scroll-area"
      class={cn("relative overflow-hidden", local.class)}
      {...rest}
    >
      <ArkScrollArea.Viewport
        data-slot="scroll-area-viewport"
        data-scroll-region={local["data-scroll-region"]}
        data-testid={local["data-testid"]}
        class="size-full rounded-[inherit] outline-none"
      >
        {local.children}
      </ArkScrollArea.Viewport>
      <ScrollBar />
      <ArkScrollArea.Corner data-slot="scroll-area-corner" />
    </ArkScrollArea.Root>
  );
}

export interface ScrollBarProps extends ArkScrollAreaScrollbarProps {
  class?: string;
}

export function ScrollBar(props: ScrollBarProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "orientation"]);
  return (
    <ArkScrollArea.Scrollbar
      data-slot="scroll-area-scrollbar"
      orientation={local.orientation ?? "vertical"}
      class={cn(
        "flex touch-none p-px transition-colors select-none",
        "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2.5 data-[orientation=vertical]:border-l data-[orientation=vertical]:border-l-transparent",
        "data-[orientation=horizontal]:h-2.5 data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:border-t data-[orientation=horizontal]:border-t-transparent",
        local.class,
      )}
      {...rest}
    >
      <ScrollThumb />
    </ArkScrollArea.Scrollbar>
  );
}

export interface ScrollThumbProps extends ArkScrollAreaThumbProps {
  class?: string;
}

export function ScrollThumb(props: ScrollThumbProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <ArkScrollArea.Thumb
      data-slot="scroll-area-thumb"
      class={cn("relative flex-1 rounded-full bg-border", local.class)}
      {...rest}
    />
  );
}
