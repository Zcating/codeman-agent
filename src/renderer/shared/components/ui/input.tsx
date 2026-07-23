//! Input — 文本风格输入原子组件（text/password/email/search 等）。
//! 纯 cn，type 透传。Pattern from solidcn-ui/solidcn。

import type { Component, ComponentProps } from "solid-js";
import { splitProps } from "solid-js";
import { cn } from "../../lib/cn";

export type InputProps = ComponentProps<"input"> & { class?: string };

export const Input: Component<InputProps> = (props) => {
  const [local, rest] = splitProps(props, ["class", "type"]);
  return (
    <input
      type={local.type ?? "text"}
      class={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
        "ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        local.class,
      )}
      {...rest}
    />
  );
};
