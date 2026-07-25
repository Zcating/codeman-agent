import type { Component, JSX } from "solid-js";
import { For, Show, createMemo } from "solid-js";
import { SelectRoot, SelectTrigger, SelectContent, SelectItem, SelectValue, createListCollection, useSelectContext } from "../ui/select";
import { cn } from "../../lib/cn";

export interface CodemanSelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface CodemanSelectProps {
  options: CodemanSelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "data-testid"?: string;
  children?: JSX.Element; // Action slot
}

// Internal action wrapper that uses useSelectContext to close dropdown
const SelectAction: Component<{ children: JSX.Element }> = (props) => {
  const ctx = useSelectContext();
  const handleClick = () => {
    ctx().setOpen(false);
  };
  return (
    <>
      <hr role="separator" class="my-2 border-border" />
      <div onClick={handleClick}>{props.children}</div>
    </>
  );
};

export const CodemanSelect: Component<CodemanSelectProps> = (props) => {
  const collection = createMemo(() =>
    createListCollection({ items: props.options })
  );

  // Ark UI Select passes { value: T[], items: T[] } to onValueChange
  const handleValueChange = (details: { value: string[] }) => {
    if (details.value.length > 0) {
      props.onChange(details.value[0]);
    }
  };

  const triggerTestId = props["data-testid"]
    ? `${props["data-testid"]}-trigger`
    : undefined;
  const contentTestId = props["data-testid"]
    ? `${props["data-testid"]}-content`
    : undefined;

  return (
    <SelectRoot
      collection={collection()}
      value={props.value ? [props.value] : []}
      onValueChange={handleValueChange}
      disabled={props.disabled}
      positioning={{ sameWidth: true }}
    >
      <SelectTrigger
        data-testid={triggerTestId}
        disabled={props.disabled}
        aria-label={props["aria-label"]}
        class={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input",
          "bg-background px-3 py-2 text-sm",
          "ring-offset-background",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "[&[data-state=open]]:ring-2 [&[data-state=open]]:ring-ring",
        )}
      >
        <SelectValue placeholder={props.placeholder ?? "Select..."} />
      </SelectTrigger>
      <SelectContent
        data-testid={contentTestId}
        class="rounded-md border border-input bg-background"
      >
        <For each={props.options}>
          {(option) => (
            <SelectItem
              item={option}
              class={cn(
                "relative flex w-full cursor-pointer select-none items-center",
                "rounded-sm py-1.5 pl-8 pr-2 text-sm",
                "outline-none",
                "focus:bg-accent focus:text-accent-foreground",
                "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                "[&[data-state=checked]]:bg-accent [&[data-state=checked]]:text-accent-foreground",
              )}
            >
              {option.label}
            </SelectItem>
          )}
        </For>
        <Show when={props.children}>
          <SelectAction>{props.children}</SelectAction>
        </Show>
      </SelectContent>
    </SelectRoot>
  );
};
