//! Textarea — 多行文本输入原子组件。
//! 纯 cn，rows 透传。Pattern from solidcn-ui/solidcn。

import type { Component, ComponentProps } from "solid-js";
import { splitProps } from "solid-js";
import { cn } from "../../lib/cn";

export type TextareaProps = ComponentProps<"textarea"> & { class?: string };

export const Textarea: Component<TextareaProps> = (props) => {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <textarea
      class={cn(
        "flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
        "ring-offset-background placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "resize-none",
        local.class,
      )}
      {...rest}
    />
  );
};
