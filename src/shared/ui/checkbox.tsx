//! Checkbox — 布尔切换原子组件。
//! 纯 cn，原生 <input type="checkbox"> 包装器。无 Kobalte/Radix（V1 排除）。

import type { Component, ComponentProps } from "solid-js";
import { splitProps } from "solid-js";
import { cn } from "../lib/cn";

export type CheckboxProps = ComponentProps<"input"> & { class?: string };

export const Checkbox: Component<CheckboxProps> = (props) => {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <input
      type="checkbox"
      class={cn(
        "h-4 w-4 rounded border border-input bg-background",
        "ring-offset-background focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-checked:bg-primary data-checked:text-primary-foreground",
        local.class,
      )}
      {...rest}
    />
  );
};
