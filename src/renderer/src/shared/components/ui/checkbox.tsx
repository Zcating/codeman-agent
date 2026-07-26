import { type Component, type ComponentProps, splitProps } from "solid-js";
import { cn } from "@codeman-frontend/shared/lib/cn";

export type CheckboxProps = ComponentProps<"input"> & { class?: string };

export const Checkbox: Component<CheckboxProps> = (props) => {
  const [local, rest] = splitProps(props, ["class", "checked"]);
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      data-checked={local.checked === true ? "" : undefined}
      class={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary",
        local.class,
      )}
      checked={local.checked}
      {...rest}
    />
  );
};
