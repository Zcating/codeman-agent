//! accordion.test.tsx — Contract tests for Accordion primitive wrapping @ark-ui/solid.
import { render, screen, cleanup } from "@solidjs/testing-library";
import { describe, expect, it, beforeEach } from "vitest";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@codeman-frontend/shared/components/ui/accordion";

describe("Accordion — seam 10 (AccordionProvider)", () => {
  beforeEach(() => cleanup());

  it("renders AccordionItem children when defaultValue=['a'] and Item a is open", () => {
    render(() => (
      <Accordion defaultValue={["a"]}>
        <AccordionItem value="a">
          <AccordionTrigger>Trigger A</AccordionTrigger>
          <AccordionContent>Content A</AccordionContent>
        </AccordionItem>
        <AccordionItem value="b">
          <AccordionTrigger>Trigger B</AccordionTrigger>
          <AccordionContent>Content B</AccordionContent>
        </AccordionItem>
      </Accordion>
    ));

    // Both triggers should be visible
    expect(screen.getByText("Trigger A")).toBeInTheDocument();
    expect(screen.getByText("Trigger B")).toBeInTheDocument();

    // Content A should be visible (open)
    expect(screen.getByText("Content A")).toBeInTheDocument();
    // Content B might or might not be visible depending on default
  });

  it("renders multiple items with defaultValue containing multiple values", () => {
    render(() => (
      <Accordion defaultValue={["a", "b"]}>
        <AccordionItem value="a">
          <AccordionTrigger>Trigger A</AccordionTrigger>
          <AccordionContent>Content A</AccordionContent>
        </AccordionItem>
        <AccordionItem value="b">
          <AccordionTrigger>Trigger B</AccordionTrigger>
          <AccordionContent>Content B</AccordionContent>
        </AccordionItem>
      </Accordion>
    ));

    expect(screen.getByText("Trigger A")).toBeInTheDocument();
    expect(screen.getByText("Trigger B")).toBeInTheDocument();
    expect(screen.getByText("Content A")).toBeInTheDocument();
    expect(screen.getByText("Content B")).toBeInTheDocument();
  });
});

describe("AccordionItem data-state — seam 11", () => {
  beforeEach(() => cleanup());

  it("open Item has data-state=open on its content region", () => {
    const { container } = render(() => (
      <Accordion defaultValue={["a"]}>
        <AccordionItem value="a">
          <AccordionTrigger>Trigger A</AccordionTrigger>
          <AccordionContent>Content A</AccordionContent>
        </AccordionItem>
      </Accordion>
    ));

    // The accordion item should have a data-state attribute
    // Looking for data-state on the item or its content
    const contentEl = container.querySelector("[data-state='open']");
    expect(contentEl).toBeTruthy();
  });

  it("closed Item does not have data-state=open", () => {
    const { container } = render(() => (
      <Accordion defaultValue={[]}>
        <AccordionItem value="a">
          <AccordionTrigger>Trigger A</AccordionTrigger>
          <AccordionContent>Content A</AccordionContent>
        </AccordionItem>
      </Accordion>
    ));

    // No open state should be present when defaultValue is empty
    const openEls = container.querySelectorAll("[data-state='open']");
    expect(openEls.length).toBe(0);
  });
});

describe("Accordion structural", () => {
  beforeEach(() => cleanup());

  it("AccordionTrigger renders as button", () => {
    render(() => (
      <Accordion defaultValue={[]}>
        <AccordionItem value="a">
          <AccordionTrigger>Click me</AccordionTrigger>
          <AccordionContent>content</AccordionContent>
        </AccordionItem>
      </Accordion>
    ));
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("AccordionContent renders div content", () => {
    render(() => (
      <Accordion defaultValue={["a"]}>
        <AccordionItem value="a">
          <AccordionTrigger>Trigger</AccordionTrigger>
          <AccordionContent>The content</AccordionContent>
        </AccordionItem>
      </Accordion>
    ));
    // Content should be rendered
    expect(screen.getByText("The content")).toBeInTheDocument();
  });

  it("disabled Item cannot be opened", () => {
    render(() => (
      <Accordion defaultValue={[]}>
        <AccordionItem value="a" disabled>
          <AccordionTrigger>Disabled Trigger</AccordionTrigger>
          <AccordionContent>Disabled content</AccordionContent>
        </AccordionItem>
      </Accordion>
    ));
    const trigger = screen.getByRole("button");
    expect(trigger).toBeDisabled();
  });

  it("multiple=true allows multiple items open", () => {
    render(() => (
      <Accordion multiple defaultValue={["a", "b"]}>
        <AccordionItem value="a">
          <AccordionTrigger>Trigger A</AccordionTrigger>
          <AccordionContent>Content A</AccordionContent>
        </AccordionItem>
        <AccordionItem value="b">
          <AccordionTrigger>Trigger B</AccordionTrigger>
          <AccordionContent>Content B</AccordionContent>
        </AccordionItem>
      </Accordion>
    ));
    expect(screen.getByText("Content A")).toBeInTheDocument();
    expect(screen.getByText("Content B")).toBeInTheDocument();
  });
});
