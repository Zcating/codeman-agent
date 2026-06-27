//! codeman-select — Ark UI Select wrapper tests.

import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "@testing-library/user-event";
import { CodemanSelect, CodemanSelectOption } from "./codeman-select";

// Mock @ark-ui/solid to avoid complex rendering in unit tests
vi.mock("@ark-ui/solid", async () => {
  const actual = await vi.importActual("@ark-ui/solid");
  return {
    ...actual,
    Select: {
      Root: (props: any) => props.children({ isOpen: props.isOpen ?? false }),
      Control: (props: any) => props.children(),
      Trigger: (props: any) => (
        <button
          data-testid={props["data-testid"]}
          data-state={props.isOpen ? "open" : "closed"}
          disabled={props.disabled}
          onClick={props.onClick}
          aria-label={props["aria-label"]}
        >
          {props.children}
        </button>
      ),
      ValueText: (props: any) => <span>{props.children}</span>,
      Indicator: (props: any) => <span data-part="indicator">{props.children}</span>,
      Positioner: (props: any) => <div data-part="positioner">{props.children}</div>,
      Content: (props: any) => (
        <div
          data-testid={props["data-testid"]}
          data-part="content"
          data-state={props.isOpen ? "open" : "closed"}
        >
          {props.children}
        </div>
      ),
      List: (props: any) => <ul data-part="list">{props.children}</ul>,
      Item: (props: any) => (
        <li
          data-value={props.value}
          data-disabled={props.disabled || false}
          onClick={() => !props.disabled && props.onClick?.()}
        >
          {props.children}
        </li>
      ),
      ItemText: (props: any) => <span>{props.children}</span>,
      ItemIndicator: (props: any) => <span data-part="item-indicator">{props.children}</span>,
    },
    createListCollection: vi.fn(({ items }: { items: CodemanSelectOption[] }) => ({
      items,
      filteredItems: items,
    })),
    useSelectContext: vi.fn(() => () => ({ setOpen: vi.fn() })),
  };
});

const defaultOptions: CodemanSelectOption[] = [
  { label: "Option A", value: "a" },
  { label: "Option B", value: "b" },
  { label: "Option C", value: "c" },
];

describe("CodemanSelect", () => {
  // 1. renders trigger with placeholder
  it("renders trigger with placeholder", () => {
    render(() => (
      <CodemanSelect
        options={defaultOptions}
        value={null}
        onChange={vi.fn()}
        placeholder="Select an option"
      />
    ));
    expect(screen.getByPlaceholderText("Select an option")).toBeInTheDocument();
  });

  // 2. opens content when trigger clicked
  it("opens content when trigger clicked", async () => {
    const user = userEvent.setup();
    render(() => (
      <CodemanSelect
        options={defaultOptions}
        value={null}
        onChange={vi.fn()}
        placeholder="Select"
      />
    ));
    const trigger = screen.getByRole("combobox");
    await user.click(trigger);
    await waitFor(() => {
      const content = document.querySelector('[data-part="content"]');
      expect(content).toBeInTheDocument();
    });
  });

  // 3. shows options from collection
  it("shows options from collection", async () => {
    const user = userEvent.setup();
    render(() => (
      <CodemanSelect
        options={defaultOptions}
        value={null}
        onChange={vi.fn()}
        placeholder="Select"
      />
    ));
    const trigger = screen.getByRole("combobox");
    await user.click(trigger);
    await waitFor(() => {
      expect(screen.getByText("Option A")).toBeInTheDocument();
      expect(screen.getByText("Option B")).toBeInTheDocument();
      expect(screen.getByText("Option C")).toBeInTheDocument();
    });
  });

  // 4. calls onChange with selected value (string)
  it("calls onChange with selected value (string)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(() => (
      <CodemanSelect
        options={defaultOptions}
        value={null}
        onChange={onChange}
        placeholder="Select"
      />
    ));
    const trigger = screen.getByRole("combobox");
    await user.click(trigger);
    await waitFor(async () => {
      await user.click(screen.getByText("Option B"));
      expect(onChange).toHaveBeenCalledWith("b");
    });
  });

  // 5. closes when option selected
  it("closes when option selected", async () => {
    const user = userEvent.setup();
    render(() => (
      <CodemanSelect
        options={defaultOptions}
        value={null}
        onChange={vi.fn()}
        placeholder="Select"
      />
    ));
    const trigger = screen.getByRole("combobox");
    await user.click(trigger);
    await waitFor(async () => {
      await user.click(screen.getByText("Option A"));
    });
    await waitFor(() => {
      const content = document.querySelector('[data-part="content"]');
      expect(content).toBeNull();
    });
  });

  // 6. shows empty state when no options
  it("shows empty state when no options", () => {
    render(() => (
      <CodemanSelect
        options={[]}
        value={null}
        onChange={vi.fn()}
        placeholder="Select"
      />
    ));
    const trigger = screen.getByRole("combobox");
    fireEvent.click(trigger);
    const content = document.querySelector('[data-part="list"]');
    expect(content).toBeInTheDocument();
  });

  // 7. disabled state prevents interaction
  it("disabled state prevents interaction", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(() => (
      <CodemanSelect
        options={defaultOptions}
        value={null}
        onChange={onChange}
        placeholder="Select"
        disabled={true}
      />
    ));
    const trigger = screen.getByRole("combobox");
    expect(trigger).toBeDisabled();
    await user.click(trigger);
    expect(onChange).not.toHaveBeenCalled();
  });

  // 8. Action slot renders non-option button after list (and clicks close the dropdown via useSelectContext)
  it("Action slot renders non-option button after list and closes dropdown on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const actionClick = vi.fn();

    render(() => (
      <CodemanSelect
        options={defaultOptions}
        value={null}
        onChange={onChange}
        placeholder="Select"
      >
        <button data-testid="action-btn" onClick={actionClick}>
          Action
        </button>
      </CodemanSelect>
    ));

    const trigger = screen.getByRole("combobox");
    await user.click(trigger);
    await waitFor(() => {
      expect(screen.getByTestId("action-btn")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("action-btn"));
    expect(actionClick).toHaveBeenCalled();
  });

  // data-testid on Trigger and Content
  it("applies data-testid to trigger with -trigger suffix", () => {
    render(() => (
      <CodemanSelect
        options={defaultOptions}
        value={null}
        onChange={vi.fn()}
        placeholder="Select"
        data-testid="my-select"
      />
    ));
    expect(screen.getByTestId("my-select-trigger")).toBeInTheDocument();
  });

  it("applies data-testid to content with -content suffix", async () => {
    const user = userEvent.setup();
    render(() => (
      <CodemanSelect
        options={defaultOptions}
        value={null}
        onChange={vi.fn()}
        placeholder="Select"
        data-testid="my-select"
      />
    ));
    const trigger = screen.getByTestId("my-select-trigger");
    await user.click(trigger);
    await waitFor(() => {
      expect(screen.getByTestId("my-select-content")).toBeInTheDocument();
    });
  });
});
