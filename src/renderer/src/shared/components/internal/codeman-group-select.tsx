//! codeman-group-select — @ark-ui/solid Select with ItemGroup wrapper.
//! Routes through ui/select.tsx atoms (design-token single source of truth).

import type { Component } from "solid-js";
import { For, createMemo } from "solid-js";
import {
  SelectRoot,
  SelectGroup,
  SelectLabel,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
  createListCollection,
} from "@codeman-frontend/shared/components/ui/select";

export interface CodemanGroupSelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface CodemanGroupSelectGroup {
  label: string;
  options: CodemanGroupSelectOption[];
}

export interface CodemanGroupSelectProps {
  groups: CodemanGroupSelectGroup[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "data-testid"?: string;
}

export const CodemanGroupSelect: Component<CodemanGroupSelectProps> = (props) => {
  // ItemGroup is presentation-only; flatten for the @ark-ui collection.
  const flatOptions = createMemo(() =>
    props.groups.flatMap((group) => group.options)
  );

  const collection = createMemo(() =>
    createListCollection({ items: flatOptions() })
  );

  // @ark-ui/solid Select passes { value: T[], items: T[] } to onValueChange.
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
      // sameWidth:false lets the dropdown size to its longest option, so labels
      // like "MiniMax-M2.7-highspeed" are not clipped against a narrow trigger.
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
      <SelectContent data-testid={contentTestId}>
        <For each={props.groups}>
          {(group) => (
            <SelectGroup>
              <SelectLabel>{group.label}</SelectLabel>
              <For each={group.options}>
                {(option) => (
                  <SelectItem item={option}>{option.label}</SelectItem>
                )}
              </For>
            </SelectGroup>
          )}
        </For>
      </SelectContent>
    </SelectRoot>
  );
};