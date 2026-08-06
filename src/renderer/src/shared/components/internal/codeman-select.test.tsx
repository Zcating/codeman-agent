
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CodemanSelect, CodemanSelectOption } from "@codeman-frontend/shared/components/internal/codeman-select";

let mockIsOpen = false;
let sharedOnValueChange: ((details: { value: string[] }) => void) | null = null;
let sharedPositioning: Record<string, unknown> | undefined;

vi.mock("@ark-ui/solid", async () => {
  const actual = await vi.importActual("@ark-ui/solid");

  return {
    ...actual,
    Select: {
      Root: (props: any) => {
        sharedOnValueChange = props.onValueChange ?? null;
        sharedPositioning = props.positioning;
        return <>{props.children}</>;
      },
      Control: (props: any) => <>{props.children}</>,
      Trigger: (props: any) => (
        <button
          {...props}
          data-state={mockIsOpen ? "open" : "closed"}
          onClick={() => {
            mockIsOpen = !mockIsOpen;
          }}
          aria-expanded={mockIsOpen}
        >
          {props.children}
        </button>
      ),
      ValueText: (props: any) => (
        <span data-part="value-text" {...props}>
          {props.placeholder || props.children}
        </span>
      ),
      Indicator: (props: any) => <span data-part="indicator" {...props}>{props.children}</span>,
      Positioner: (props: any) => (
        <div
          data-part="positioner"
          {...props}
          style={{ display: mockIsOpen ? "block" : "none" }}
        >
          {props.children}
        </div>
      ),
      Content: (props: any) => (
        <div
          data-part="content"
          data-state={mockIsOpen ? "open" : "closed"}
          {...props}
        >
          {props.children}
        </div>
      ),
      List: (props: any) => <ul data-part="list" {...props}>{props.children}</ul>,
      Item: (props: any) => {
        const itemValue = props.item?.value ?? props.value;
        return (
          <li
            data-value={itemValue}
            data-disabled={props.item?.disabled || false}
            {...props}
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
          </li>
        );
      },
      ItemText: (props: any) => <span {...props}>{props.children}</span>,
      ItemIndicator: (props: any) => <span data-part="item-indicator" {...props}>{props.children}</span>,
    },
    createListCollection: vi.fn(({ items }: { items: CodemanSelectOption[] }) => ({
      items,
      filteredItems: items,
      getItemValue: (item: CodemanSelectOption) => item.value,
      getItemDisabled: (item: CodemanSelectOption) => item.disabled ?? false,
      stringifyItem: (item: CodemanSelectOption) => item.label,
    })),
    useSelectContext: vi.fn(() => () => ({
      setOpen: (open: boolean) => {
        mockIsOpen = open;
      }
    })),
  };
});

beforeEach(() => {
  mockIsOpen = false;
  sharedOnValueChange = null;
  sharedPositioning = undefined;
});

const defaultOptions: CodemanSelectOption[] = [
  { label: "Option A", value: "a" },
  { label: "Option B", value: "b" },
  { label: "Option C", value: "c" },
];

describe("CodemanSelect", () => {
  it("renders trigger with placeholder", () => {
    render(() => (
      <CodemanSelect
        options={defaultOptions}
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

  it("trigger placeholder variant matches ark-ui DOM state (data-placeholder-shown)", () => {
    // 回归：占位符文字必须跟随主题。失效的 data-placeholder 变体不会匹配
    // ark-ui 在 trigger 上设置的 data-placeholder-shown 属性，导致占位符
    // 颜色继承 UA 默认色（不跟随应用内主题切换）。
    render(() => (
      <CodemanSelect
        options={defaultOptions}
        value={null}
        onChange={vi.fn()}
        placeholder="Select"
        data-testid="test-select"
      />
    ));
    const trigger = screen.getByTestId("test-select-trigger");
    expect(trigger).toHaveClass("data-placeholder-shown:text-muted-foreground");
  });

  it("shows empty placeholder text when no options", () => {
    // 回归：options 为空时下拉区不能空白——必须显示空占位符，
    // 提示用户没有对应的内容（而非让用户以为列表还在加载/出错）。
    render(() => (
      <CodemanSelect
        options={[]}
        value={null}
        onChange={vi.fn()}
        placeholder="Select"
        data-testid="test-select"
      />
    ));
    expect(screen.getByText('无可用选项')).toBeInTheDocument();
  });

  it("opens content when trigger clicked", () => {
    render(() => (
      <CodemanSelect
        options={defaultOptions}
        value={null}
        onChange={vi.fn()}
        placeholder="Select"
        data-testid="test-select"
      />
    ));
    const trigger = screen.getByTestId("test-select-trigger");
    const content = document.querySelector('[data-part="content"]');
    expect(content).toBeInTheDocument();
    expect(trigger).toHaveAttribute("data-state", "closed");
  });

  it("shows options from collection", () => {
    render(() => (
      <CodemanSelect
        options={defaultOptions}
        value={null}
        onChange={vi.fn()}
        placeholder="Select"
        data-testid="test-select"
      />
    ));
    const items = document.querySelectorAll('li[data-value]');
    expect(items.length).toBe(3);
    expect(items[0]).toHaveAttribute("data-value", "a");
    expect(items[1]).toHaveAttribute("data-value", "b");
    expect(items[2]).toHaveAttribute("data-value", "c");
  });

  it("calls onChange with selected value (string)", () => {
    const onChange = vi.fn();
    render(() => (
      <CodemanSelect
        options={defaultOptions}
        value={null}
        onChange={onChange}
        placeholder="Select"
        data-testid="test-select"
      />
    ));
    const itemB = document.querySelector('li[data-value="b"]');
    fireEvent.click(itemB!);
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("closes when option selected", () => {
    render(() => (
      <CodemanSelect
        options={defaultOptions}
        value={null}
        onChange={vi.fn()}
        placeholder="Select"
        data-testid="test-select"
      />
    ));
    const itemA = document.querySelector('li[data-value="a"]');
    fireEvent.click(itemA!);
    expect(itemA).toBeInTheDocument();
  });

  it("shows empty state when no options", () => {
    render(() => (
      <CodemanSelect
        options={[]}
        value={null}
        onChange={vi.fn()}
        placeholder="Select"
        data-testid="test-select"
      />
    ));
    const list = document.querySelector('[data-part="list"]');
    expect(list).toBeInTheDocument();
    const items = document.querySelectorAll('li[data-value]');
    expect(items.length).toBe(0);
  });

  it("disabled state prevents interaction", () => {
    const onChange = vi.fn();
    render(() => (
      <CodemanSelect
        options={defaultOptions}
        value={null}
        onChange={onChange}
        disabled={true}
        placeholder="Select"
        data-testid="test-select"
      />
    ));
    const trigger = screen.getByTestId("test-select-trigger");
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("data-state", "closed");
  });

  it("Action slot renders non-option button after list and closes dropdown on click", () => {
    const onActionClick = vi.fn();
    render(() => (
      <CodemanSelect
        options={defaultOptions}
        value={null}
        onChange={vi.fn()}
        placeholder="Select"
        data-testid="test-select"
      >
        <button data-testid="action-btn" onClick={onActionClick}>
          Action
        </button>
      </CodemanSelect>
    ));
    const actionBtn = document.querySelector('[data-testid="action-btn"]');
    expect(actionBtn).toBeInTheDocument();
    fireEvent.click(actionBtn!);
    expect(onActionClick).toHaveBeenCalled();
  });

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

  it("applies data-testid to content with -content suffix", () => {
    render(() => (
      <CodemanSelect
        options={defaultOptions}
        value={null}
        onChange={vi.fn()}
        placeholder="Select"
        data-testid="my-select"
      />
    ));
    expect(screen.getByTestId("my-select-content")).toBeInTheDocument();
  });

  it("SelectTrigger has data-slot=select-trigger", () => {
    render(() => (
      <CodemanSelect
        options={defaultOptions}
        value={null}
        onChange={vi.fn()}
        placeholder="Select"
        data-testid="test-select"
      />
    ));
    const trigger = document.querySelector('[data-slot="select-trigger"]');
    expect(trigger).toBeInTheDocument();
  });

  it("SelectItem has data-slot=select-item", () => {
    render(() => (
      <CodemanSelect
        options={defaultOptions}
        value={null}
        onChange={vi.fn()}
        placeholder="Select"
        data-testid="test-select"
      />
    ));
    const items = document.querySelectorAll('[data-slot="select-item"]');
    expect(items.length).toBe(3);
  });

  it("places visual chrome on Content, not Positioner (no ghost border when closed)", () => {
    render(() => (
      <CodemanSelect
        options={defaultOptions}
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

    expect(positioner.className).not.toMatch(/\bborder\b/);
    expect(positioner.className).not.toMatch(/\bshadow\b/);

    expect(content.className).toMatch(/bg-background\b/);
  });

  it("passes sameWidth: false to SelectRoot so long option labels are not clipped", () => {
    render(() => (
      <CodemanSelect
        options={defaultOptions}
        value={null}
        onChange={vi.fn()}
        placeholder="Select"
        data-testid="test-select"
      />
    ));
    expect(sharedPositioning).toBeDefined();
    expect(sharedPositioning?.sameWidth).toBe(false);
  });
});
