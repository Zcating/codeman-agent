//! Checkbox — boolean toggle primitive.
//! cn-only, native <input type="checkbox"> wrapper. No Kobalte/Radix (V1 exclusion).

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
        "data-[checked]:bg-primary data-[checked]:text-primary-foreground",
        local.class,
      )}
      {...rest}
    />
  );
};
