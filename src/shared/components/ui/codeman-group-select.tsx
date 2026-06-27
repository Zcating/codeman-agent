//! codeman-group-select — Ark UI Select wrapper with ItemGroup support.
//! Wraps @ark-ui/solid Select for codeman-agent design system.

import type { Component } from "solid-js";
import { For, createMemo } from "solid-js";
import {
  Select,
  createListCollection,
} from "@ark-ui/solid";
import { cn } from "../../lib/cn";

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
  // Flatten all options from all groups into a single collection
  const flatOptions = createMemo(() =>
    props.groups.flatMap((group) => group.options)
  );

  const collection = createMemo(() =>
    createListCollection({ items: flatOptions() })
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
    <Select.Root
      collection={collection()}
      value={props.value ? [props.value] : []}
      onValueChange={handleValueChange}
      disabled={props.disabled}
    >
      <Select.Control class="w-full">
        <Select.Trigger
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
          <Select.ValueText placeholder={props.placeholder ?? "Select..."} />
          <Select.Indicator class="ml-2 flex-shrink-0 text-muted-foreground">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </Select.Indicator>
        </Select.Trigger>

        <Select.Positioner
          class="z-50 overflow-hidden rounded-md border border-input bg-background shadow-md"
          style={{
            "--reference-width": "var(--available-width)",
            "--available-width": "100%",
            "--x": "0",
            "--y": "4px",
          }}
        >
          <Select.Content data-testid={contentTestId} class="max-h-60 overflow-y-auto bg-background">
            <Select.List class="p-1">
              <For each={props.groups}>
                {(group) => (
                  <Select.ItemGroup>
                    <Select.ItemGroupLabel class="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                      {group.label}
                    </Select.ItemGroupLabel>
                    <For each={group.options}>
                      {(option) => (
                        <Select.Item
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
                          <Select.ItemIndicator class="absolute left-2 flex items-center justify-center">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </Select.ItemIndicator>
                          <Select.ItemText>{option.label}</Select.ItemText>
                        </Select.Item>
                      )}
                    </For>
                  </Select.ItemGroup>
                )}
              </For>
            </Select.List>
          </Select.Content>
        </Select.Positioner>
      </Select.Control>
    </Select.Root>
  );
};
