//! select.test.tsx — Contract tests for Select primitive
import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { createListCollection } from "@ark-ui/solid";
import {
  SelectAction, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectRoot, SelectSeparator, SelectScrollDownButton,
  SelectScrollUpButton, SelectTrigger, SelectValue,
} from "@codeman-frontend/shared/components/ui/select";

const emptyCollection = createListCollection({ items: [] });
const sampleCollection = createListCollection({
  items: [
    { label: "Apple", value: "apple" },
    { label: "Banana", value: "banana" },
  ],
});

describe("SelectTrigger", () => {
  it("renders with data-slot=select-trigger", () => {
    render(() => (
      <SelectRoot collection={emptyCollection}>
        <SelectTrigger data-testid="trigger">Open</SelectTrigger>
      </SelectRoot>
    ));
    expect(screen.getByTestId("trigger")).toHaveAttribute("data-slot", "select-trigger");
  });

  it("size=sm applies data-size=sm", () => {
    render(() => (
      <SelectRoot collection={emptyCollection}>
        <SelectTrigger data-testid="trigger" size="sm">Open</SelectTrigger>
      </SelectRoot>
    ));
    expect(screen.getByTestId("trigger")).toHaveAttribute("data-size", "sm");
  });
});

describe("SelectContent", () => {
  it("renders with data-slot=select-content", () => {
    render(() => (
      <SelectRoot collection={sampleCollection} open>
        <SelectTrigger>Open</SelectTrigger>
        <SelectContent data-testid="content">
          <SelectItem item={{ label: "Apple", value: "apple" }}>Apple</SelectItem>
        </SelectContent>
      </SelectRoot>
    ));
    const content = screen.getByTestId("content");
    expect(content).toHaveAttribute("data-slot", "select-content");
  });
});

describe("SelectItem", () => {
  it("renders with data-slot=select-item", () => {
    render(() => (
      <SelectRoot collection={sampleCollection} open>
        <SelectTrigger>Open</SelectTrigger>
        <SelectContent>
          <SelectItem item={{ label: "Apple", value: "apple" }} data-testid="item">Apple</SelectItem>
        </SelectContent>
      </SelectRoot>
    ));
    expect(screen.getByTestId("item")).toHaveAttribute("data-slot", "select-item");
  });

  // Regression (2026-07-26): SelectItem had focus:bg-accent but no hover:bg-accent,
  // so mouse hover over an option was visually inert — no background change to
  // signal which option would be picked. Focus style (keyboard nav) worked fine,
  // mouse users got nothing. Fix: add hover:bg-accent hover:text-accent-foreground
  // to match the focus state, so both keyboard and mouse users see the same
  // visual feedback on the active option.
  it("applies hover:bg-accent so mouse hover on an option shows visual feedback", () => {
    render(() => (
      <SelectRoot collection={sampleCollection} open>
        <SelectTrigger>Open</SelectTrigger>
        <SelectContent>
          <SelectItem item={{ label: "Apple", value: "apple" }} data-testid="item">Apple</SelectItem>
        </SelectContent>
      </SelectRoot>
    ));
    const item = screen.getByTestId("item");
    // The fix adds hover:bg-accent + hover:text-accent-foreground to mirror focus.
    expect(item.className).toContain("hover:bg-accent");
    expect(item.className).toContain("hover:text-accent-foreground");
  });
});

describe("SelectSeparator", () => {
  it("renders with bg-border class and data-slot", () => {
    render(() => <SelectSeparator data-testid="sep" />);
    const sep = screen.getByTestId("sep");
    expect(sep).toHaveAttribute("data-slot", "select-separator");
    expect(sep.className).toContain("bg-border");
  });
});

describe("SelectGroup", () => {
  it("renders with data-slot=select-group", () => {
    render(() => (
      <SelectRoot collection={emptyCollection}>
        <SelectGroup data-testid="group">
          <div>Content</div>
        </SelectGroup>
      </SelectRoot>
    ));
    expect(screen.getByTestId("group")).toHaveAttribute("data-slot", "select-group");
  });
});

describe("SelectLabel", () => {
  it("renders with text-muted-foreground class", () => {
    render(() => (
      <SelectRoot collection={emptyCollection}>
        <SelectGroup>
          <SelectLabel data-testid="label">Fruits</SelectLabel>
        </SelectGroup>
      </SelectRoot>
    ));
    const label = screen.getByTestId("label");
    expect(label).toHaveAttribute("data-slot", "select-label");
    expect(label.className).toContain("text-muted-foreground");
  });
});

describe("SelectValue", () => {
  it("renders with data-slot=select-value", () => {
    render(() => (
      <SelectRoot collection={emptyCollection}>
        <SelectTrigger>
          <SelectValue data-testid="value" />
        </SelectTrigger>
      </SelectRoot>
    ));
    expect(screen.getByTestId("value")).toHaveAttribute("data-slot", "select-value");
  });
});

describe("SelectScrollUpButton", () => {
  it("renders with data-slot=select-scroll-up-button", () => {
    render(() => <SelectScrollUpButton data-testid="up" />);
    expect(screen.getByTestId("up")).toHaveAttribute("data-slot", "select-scroll-up-button");
  });

  it("hides via data-hidden when content is at top of scroll", async () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      label: `Item ${i}`,
      value: `i${i}`,
    }));
    const collection = createListCollection({ items });
    render(() => (
      <SelectRoot collection={collection} open>
        <SelectTrigger>Open</SelectTrigger>
        <SelectContent data-testid="content">
          <SelectScrollUpButton data-testid="up" />
          <SelectItem item={items[0]}>{items[0].label}</SelectItem>
          <SelectScrollDownButton data-testid="down" />
        </SelectContent>
      </SelectRoot>
    ));
    const content = screen.getByTestId("content");
    // jsdom does not compute layout — mock overflow geometry.
    Object.defineProperty(content, "scrollHeight", { configurable: true, value: 500 });
    Object.defineProperty(content, "clientHeight", { configurable: true, value: 200 });
    fireEvent.scroll(content);
    await waitFor(() => {
      // scrollTop=0 → up hidden, down visible
      expect(screen.getByTestId("up")).toHaveAttribute("data-hidden");
      expect(screen.getByTestId("down")).not.toHaveAttribute("data-hidden");
    });
  });

  it("shows up button once content is scrolled past top", async () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      label: `Item ${i}`,
      value: `i${i}`,
    }));
    const collection = createListCollection({ items });
    render(() => (
      <SelectRoot collection={collection} open>
        <SelectTrigger>Open</SelectTrigger>
        <SelectContent data-testid="content">
          <SelectScrollUpButton data-testid="up" />
          <SelectItem item={items[0]}>{items[0].label}</SelectItem>
          <SelectScrollDownButton data-testid="down" />
        </SelectContent>
      </SelectRoot>
    ));
    const content = screen.getByTestId("content");
    Object.defineProperty(content, "scrollHeight", { configurable: true, value: 500 });
    Object.defineProperty(content, "clientHeight", { configurable: true, value: 200 });
    Object.defineProperty(content, "scrollTop", { configurable: true, value: 50, writable: true });
    fireEvent.scroll(content);
    await waitFor(() => {
      expect(screen.getByTestId("up")).not.toHaveAttribute("data-hidden");
    });
  });

  it("hides both buttons when content fits without overflow", async () => {
    const collection = createListCollection({ items: [{ label: "A", value: "a" }] });
    render(() => (
      <SelectRoot collection={collection} open>
        <SelectTrigger>Open</SelectTrigger>
        <SelectContent data-testid="content">
          <SelectScrollUpButton data-testid="up" />
          <SelectItem item={collection.items[0]}>A</SelectItem>
          <SelectScrollDownButton data-testid="down" />
        </SelectContent>
      </SelectRoot>
    ));
    const content = screen.getByTestId("content");
    // No overflow: scrollHeight === clientHeight
    Object.defineProperty(content, "scrollHeight", { configurable: true, value: 200 });
    Object.defineProperty(content, "clientHeight", { configurable: true, value: 200 });
    fireEvent.scroll(content);
    await waitFor(() => {
      expect(screen.getByTestId("up")).toHaveAttribute("data-hidden");
      expect(screen.getByTestId("down")).toHaveAttribute("data-hidden");
    });
  });
});

describe("SelectScrollDownButton", () => {
  it("renders with data-slot=select-scroll-down-button", () => {
    render(() => <SelectScrollDownButton data-testid="down" />);
    expect(screen.getByTestId("down")).toHaveAttribute("data-slot", "select-scroll-down-button");
  });
});

describe("SelectAction", () => {
  it("renders hr separator with data-slot=select-separator", () => {
    const collection = createListCollection({ items: [{ label: "A", value: "a" }] });
    render(() => (
      <SelectRoot collection={collection} open>
        <SelectTrigger>Open</SelectTrigger>
        <SelectContent>
          <SelectItem item={collection.items[0]}>A</SelectItem>
          <SelectAction>Custom</SelectAction>
        </SelectContent>
      </SelectRoot>
    ));
    expect(screen.getByRole("separator")).toHaveAttribute("data-slot", "select-separator");
  });

  it("renders children inside container div", () => {
    const collection = createListCollection({ items: [{ label: "A", value: "a" }] });
    render(() => (
      <SelectRoot collection={collection} open>
        <SelectTrigger>Open</SelectTrigger>
        <SelectContent>
          <SelectItem item={collection.items[0]}>A</SelectItem>
          <SelectAction><span data-testid="custom">Custom</span></SelectAction>
        </SelectContent>
      </SelectRoot>
    ));
    expect(screen.getByTestId("custom")).toHaveTextContent("Custom");
  });
});

describe("SelectRoot interaction", () => {
  it("trigger toggles content on click", async () => {
    const collection = createListCollection({ items: [{ label: "A", value: "a" }] });
    render(() => (
      <SelectRoot collection={collection}>
        <SelectTrigger data-testid="trigger">Open</SelectTrigger>
        <SelectContent data-testid="content">
          <SelectItem item={collection.items[0]}>A</SelectItem>
        </SelectContent>
      </SelectRoot>
    ));
    const trigger = screen.getByTestId("trigger");
    const content = screen.getByTestId("content");
    expect(content).toHaveAttribute("data-state", "closed");
    fireEvent.click(trigger);
    await waitFor(() => {
      expect(screen.getByTestId("content")).toHaveAttribute("data-state", "open");
    });
  });
});
