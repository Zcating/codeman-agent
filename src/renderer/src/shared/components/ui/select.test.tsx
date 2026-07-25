//! select.test.tsx — Contract tests for Select primitive
import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { createListCollection } from "@ark-ui/solid";
import {
  SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectRoot, SelectSeparator, SelectScrollDownButton,
  SelectScrollUpButton, SelectTrigger, SelectValue,
} from "./select";

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
});

describe("SelectScrollDownButton", () => {
  it("renders with data-slot=select-scroll-down-button", () => {
    render(() => <SelectScrollDownButton data-testid="down" />);
    expect(screen.getByTestId("down")).toHaveAttribute("data-slot", "select-scroll-down-button");
  });
});
