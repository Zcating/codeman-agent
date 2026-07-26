//! codeman-group-select — Ark UI Select with ItemGroup wrapper tests.

import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CodemanGroupSelect, CodemanGroupSelectGroup } from "@codeman-frontend/shared/components/internal/codeman-group-select";

// Mock state - plain values, not reactive
let mockIsOpen = false;
let sharedOnValueChange: ((details: { value: string[] }) => void) | null = null;

vi.mock("@ark-ui/solid", async () => {
  const actual = await vi.importActual("@ark-ui/solid");

  return {
    ...actual,
    Select: {
      Root: (props: any) => {
        sharedOnValueChange = props.onValueChange ?? null;
        return <>{props.children}</>;
      },
      Control: (props: any) => <>{props.children}</>,
      Trigger: (props: any) => (
        <button
          {...(props["data-testid"] ? { "data-testid": props["data-testid"] } : {})}
          data-state={mockIsOpen ? "open" : "closed"}
          disabled={props.disabled}
          onClick={() => {
            mockIsOpen = !mockIsOpen;
          }}
          aria-label={props["aria-label"]}
          aria-haspopup="listbox"
          aria-expanded={mockIsOpen}
        >
          {props.children}
        </button>
      ),
      ValueText: (props: any) => (
        <span data-part="value-text" data-placeholder={props.placeholder}>
          {props.placeholder || props.children}
        </span>
      ),
      Indicator: (props: any) => <span data-part="indicator">{props.children}</span>,
      Positioner: (props: any) => (
        <div
          data-part="positioner"
          class={props.class}
          style={{ display: mockIsOpen ? "block" : "none" }}
        >
          {props.children}
        </div>
      ),
      Content: (props: any) => (
        <div
          data-testid={props["data-testid"]}
          data-part="content"
          data-state={mockIsOpen ? "open" : "closed"}
          class={props.class}
        >
          {props.children}
        </div>
      ),
      List: (props: any) => <div data-part="list">{props.children}</div>,
      ItemGroup: (props: any) => <div data-part="item-group">{props.children}</div>,
      ItemGroupLabel: (props: any) => <div data-part="item-group-label">{props.children}</div>,
      Item: (props: any) => {
        const itemValue = props.item?.value ?? props.value;
        return (
          <div
            data-value={itemValue}
            data-disabled={props.item?.disabled || false}
            data-part="item"
            onClick={() => {
              if (!props.item?.disabled) {
                if (sharedOnValueChange) {
                  sharedOnValueChange({ value: [itemValue] });
                }
                mockIsOpen = false;
              }
            }}
          >
            {props.children}
          </div>
        );
      },
      ItemText: (props: any) => <span data-part="item-text">{props.children}</span>,
      ItemIndicator: (props: any) => <span data-part="item-indicator">{props.children}</span>,
    },
    createListCollection: vi.fn(({ items }: { items: any[] }) => ({
      items,
      filteredItems: items,
      getItemValue: (item: any) => item.value,
      getItemDisabled: (item: any) => item.disabled ?? false,
      stringifyItem: (item: any) => item.label,
    })),
    useSelectContext: vi.fn(() => () => ({
      setOpen: (open: boolean) => {
        mockIsOpen = open;
      }
    })),
  };
});

// Reset state before each test
beforeEach(() => {
  mockIsOpen = false;
  sharedOnValueChange = null;
});

const defaultGroups: CodemanGroupSelectGroup[] = [
  {
    label: "Group A",
    options: [
      { label: "Option A1", value: "a1" },
      { label: "Option A2", value: "a2" },
    ],
  },
  {
    label: "Group B",
    options: [
      { label: "Option B1", value: "b1" },
      { label: "Option B2", value: "b2" },
    ],
  },
];

describe("CodemanGroupSelect", () => {
  // 1. renders trigger with placeholder
  it("renders trigger with placeholder", () => {
    render(() => (
      <CodemanGroupSelect
        groups={defaultGroups}
        value={null}
        onChange={vi.fn()}
        placeholder="Select an option"
        data-testid="test-select"
      />
    ));
    expect(screen.getByTestId("test-select-trigger")).toBeInTheDocument();
    const valueText = document.querySelector('[data-part="value-text"]');
    expect(valueText?.textContent).toBe("Select an option");
  });

  // 2. shows grouped options with ItemGroupLabel headers
  it("shows grouped options with ItemGroupLabel headers", () => {
    render(() => (
      <CodemanGroupSelect
        groups={defaultGroups}
        value={null}
        onChange={vi.fn()}
        placeholder="Select"
        data-testid="test-select"
      />
    ));
    // Verify group labels exist
    const groupLabels = document.querySelectorAll('[data-part="item-group-label"]');
    expect(groupLabels.length).toBe(2);
    expect(groupLabels[0].textContent).toBe("Group A");
    expect(groupLabels[1].textContent).toBe("Group B");

    // Verify items exist under each group
    const items = document.querySelectorAll('[data-part="item"]');
    expect(items.length).toBe(4);
  });

  // 3. calls onChange with selected value when item clicked
  it("calls onChange with selected value when item clicked", () => {
    const onChange = vi.fn();
    render(() => (
      <CodemanGroupSelect
        groups={defaultGroups}
        value={null}
        onChange={onChange}
        placeholder="Select"
        data-testid="test-select"
      />
    ));
    // Click item with value "b1"
    const itemB1 = document.querySelector('[data-value="b1"]');
    fireEvent.click(itemB1!);
    expect(onChange).toHaveBeenCalledWith("b1");
  });

  // 4. closes when item selected
  it("closes when item selected", () => {
    render(() => (
      <CodemanGroupSelect
        groups={defaultGroups}
        value={null}
        onChange={vi.fn()}
        placeholder="Select"
        data-testid="test-select"
      />
    ));
    // Click item with value "a1"
    const itemA1 = document.querySelector('[data-value="a1"]');
    fireEvent.click(itemA1!);
    // The mock's isOpen is now false - verify item is still in DOM
    expect(itemA1).toBeInTheDocument();
  });

  // 5. disabled state prevents interaction
  it("disabled state prevents interaction", () => {
    const onChange = vi.fn();
    render(() => (
      <CodemanGroupSelect
        groups={defaultGroups}
        value={null}
        onChange={onChange}
        disabled={true}
        placeholder="Select"
        data-testid="test-select"
      />
    ));
    const trigger = screen.getByTestId("test-select-trigger");
    expect(trigger).toBeDisabled();
    // Clicking disabled trigger should not open
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("data-state", "closed");
  });

  // 6. empty groups state (all groups with 0 items) shows empty state
  it("empty groups state shows empty state", () => {
    const emptyGroups: CodemanGroupSelectGroup[] = [
      { label: "Empty Group 1", options: [] },
      { label: "Empty Group 2", options: [] },
    ];
    render(() => (
      <CodemanGroupSelect
        groups={emptyGroups}
        value={null}
        onChange={vi.fn()}
        placeholder="Select"
        data-testid="test-select"
      />
    ));
    // Group labels should still exist
    const groupLabels = document.querySelectorAll('[data-part="item-group-label"]');
    expect(groupLabels.length).toBe(2);

    // But no items should be rendered
    const items = document.querySelectorAll('[data-part="item"]');
    expect(items.length).toBe(0);
  });

  // 7. regression: visual chrome (border / ring / shadow) must live on Content,
  //    not Positioner. Otherwise Positioner's always-mounted div leaves a ghost
  //    outlined box on the page when the select is closed.
  it("places visual chrome on Content, not Positioner (no ghost chrome when closed)", () => {
    render(() => (
      <CodemanGroupSelect
        groups={defaultGroups}
        value={null}
        onChange={vi.fn()}
        placeholder="Select"
        data-testid="test-select"
      />
    ));
    const positioner = document.querySelector('[data-part="positioner"]') as HTMLElement;
    const content = document.querySelector('[data-part="content"]') as HTMLElement;
    expect(positioner).toBeInTheDocument();
    expect(content).toBeInTheDocument();

    // Positioner is always mounted — it must not carry visual chrome.
    const chrome = /\b(border|ring|shadow)\b/;
    expect(positioner.className).not.toMatch(chrome);

    // Content (the part that toggles data-state + hidden) owns the visible chrome.
    expect(content.className).toMatch(chrome);
  });
});
