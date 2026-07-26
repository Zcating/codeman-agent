import type { Component, JSX } from "solid-js";
import { For, Show, createMemo } from "solid-js";
import { SelectRoot, SelectTrigger, SelectContent, SelectItem, SelectValue, SelectAction, createListCollection } from "@codeman-frontend/shared/components/ui/select";

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
      // sameWidth:false lets the dropdown size to its longest option, so long
      // labels are not clipped against a narrow trigger.
      // SelectContent uses w-max min-w-(--anchor-width) min-w-36 (in ui/select.tsx)
      // to auto-expand the dropdown while keeping a sensible minimum width.
      positioning={{ sameWidth: false }}
    >
      <SelectTrigger
        data-testid={triggerTestId}
        disabled={props.disabled}
        aria-label={props["aria-label"]}
        class="w-full"
      >
        <SelectValue placeholder={props.placeholder ?? "Select..."} />
      </SelectTrigger>
      <SelectContent
        data-testid={contentTestId}
        class="bg-background"
      >
        <For each={props.options}>
          {(option) => (
            <SelectItem item={option}>
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
