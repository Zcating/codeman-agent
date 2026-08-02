
import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@codeman-frontend/shared/components/ui/resizable";

describe("ResizablePanelGroup", () => {
  it("renders with data-slot=resizable-panel-group", () => {
    const { container } = render(() => (
      <ResizablePanelGroup panels={[{ id: "a" }, { id: "b" }]}>
        <ResizablePanel id="a">Panel 1</ResizablePanel>
        <ResizablePanel id="b">Panel 2</ResizablePanel>
      </ResizablePanelGroup>
    ));
    const el = container.querySelector("[data-slot='resizable-panel-group']");
    expect(el).toBeTruthy();
  });

  it("applies default flex classes", () => {
    const { container } = render(() => (
      <ResizablePanelGroup panels={[{ id: "a" }, { id: "b" }]}>
        <ResizablePanel id="a">Panel 1</ResizablePanel>
        <ResizablePanel id="b">Panel 2</ResizablePanel>
      </ResizablePanelGroup>
    ));
    const el = container.querySelector("[data-slot='resizable-panel-group']");
    expect(el?.className).toContain("flex");
    expect(el?.className).toContain("h-full");
    expect(el?.className).toContain("w-full");
  });

  it("merges custom class", () => {
    const { container } = render(() => (
      <ResizablePanelGroup class="custom-class" panels={[{ id: "a" }, { id: "b" }]}>
        <ResizablePanel id="a">Panel 1</ResizablePanel>
        <ResizablePanel id="b">Panel 2</ResizablePanel>
      </ResizablePanelGroup>
    ));
    const el = container.querySelector("[data-slot='resizable-panel-group']");
    expect(el?.className).toContain("custom-class");
  });
});

describe("ResizablePanel", () => {
  it("renders with data-slot=resizable-panel", () => {
    const { container } = render(() => (
      <ResizablePanelGroup panels={[{ id: "a" }, { id: "b" }]}>
        <ResizablePanel id="a">Content</ResizablePanel>
        <ResizablePanel id="b">Content 2</ResizablePanel>
      </ResizablePanelGroup>
    ));
    const el = container.querySelector("[data-slot='resizable-panel']");
    expect(el).toBeTruthy();
  });

  it("passes through id prop", () => {
    const { container } = render(() => (
      <ResizablePanelGroup panels={[{ id: "test-panel" }, { id: "b" }]}>
        <ResizablePanel id="test-panel">Content</ResizablePanel>
        <ResizablePanel id="b">Content 2</ResizablePanel>
      </ResizablePanelGroup>
    ));
    const el = container.querySelector("[data-slot='resizable-panel']");
    // zag-js may prefix the id (e.g. "splitter:cl-4:panel:test-panel")
    expect(el?.id).toContain("test-panel");
  });

  it("merges custom class", () => {
    const { container } = render(() => (
      <ResizablePanelGroup panels={[{ id: "a" }, { id: "b" }]}>
        <ResizablePanel id="a" class="my-panel">Content</ResizablePanel>
        <ResizablePanel id="b">Content 2</ResizablePanel>
      </ResizablePanelGroup>
    ));
    const el = container.querySelector("[data-slot='resizable-panel']");
    expect(el?.className).toContain("my-panel");
  });
});

describe("ResizableHandle", () => {
  it("renders with data-slot=resizable-handle", () => {
    const { container } = render(() => (
      <ResizablePanelGroup panels={[{ id: "a" }, { id: "b" }]}>
        <ResizablePanel id="a">Panel 1</ResizablePanel>
        <ResizableHandle id="a:b" />
        <ResizablePanel id="b">Panel 2</ResizablePanel>
      </ResizablePanelGroup>
    ));
    const el = container.querySelector("[data-slot='resizable-handle']");
    expect(el).toBeTruthy();
  });

  it("applies default resizable handle classes", () => {
    const { container } = render(() => (
      <ResizablePanelGroup panels={[{ id: "a" }, { id: "b" }]}>
        <ResizablePanel id="a">Panel 1</ResizablePanel>
        <ResizableHandle id="a:b" />
        <ResizablePanel id="b">Panel 2</ResizablePanel>
      </ResizablePanelGroup>
    ));
    const el = container.querySelector("[data-slot='resizable-handle']");
    expect(el?.className).toContain("relative");
    expect(el?.className).toContain("w-px");
    expect(el?.className).toContain("bg-border");
  });

  it("does not apply focus ring (no blue outline on focus)", () => {
    const { container } = render(() => (
      <ResizablePanelGroup panels={[{ id: "a" }, { id: "b" }]}>
        <ResizablePanel id="a">Panel 1</ResizablePanel>
        <ResizableHandle id="a:b" />
        <ResizablePanel id="b">Panel 2</ResizablePanel>
      </ResizablePanelGroup>
    ));
    const el = container.querySelector("[data-slot='resizable-handle']");
    // Blue ring would come from `focus-visible:ring-ring` (--color-ring at hue 230)
    expect(el?.className).not.toMatch(/focus-visible:ring-ring/);
    expect(el?.className).not.toMatch(/focus-visible:ring-2/);
    expect(el?.className).not.toMatch(/focus-visible:ring-offset/);
  });

  it("suppresses browser default outline so host OS accent does not bleed through (orange on Windows orange-accent themes)", () => {
    const { container } = render(() => (
      <ResizablePanelGroup panels={[{ id: "a" }, { id: "b" }]}>
        <ResizablePanel id="a">Panel 1</ResizablePanel>
        <ResizableHandle id="a:b" />
        <ResizablePanel id="b">Panel 2</ResizablePanel>
      </ResizablePanelGroup>
    ));
    const el = container.querySelector("[data-slot='resizable-handle']");
    // The native <button> would otherwise render outline:auto (AccentColor).
    expect(el?.className).toMatch(/outline-none/);
    expect(el?.className).toMatch(/focus-visible:outline-none/);
  });

  it("does not apply muted-foreground hover (neutral hover only)", () => {
    const { container } = render(() => (
      <ResizablePanelGroup panels={[{ id: "a" }, { id: "b" }]}>
        <ResizablePanel id="a">Panel 1</ResizablePanel>
        <ResizableHandle id="a:b" />
        <ResizablePanel id="b">Panel 2</ResizablePanel>
      </ResizablePanelGroup>
    ));
    const el = container.querySelector("[data-slot='resizable-handle']");
    expect(el?.className).not.toMatch(/hover:bg-muted-foreground/);
  });

  it("withHandle=true renders a visible grip indicator", () => {
    const { container } = render(() => (
      <ResizablePanelGroup panels={[{ id: "a" }, { id: "b" }]}>
        <ResizablePanel id="a">Panel 1</ResizablePanel>
        <ResizableHandle id="a:b" withHandle />
        <ResizablePanel id="b">Panel 2</ResizablePanel>
      </ResizablePanelGroup>
    ));
    const el = container.querySelector("[data-slot='resizable-handle']");
    // The indicator should be a child div with the grip classes
    const indicator = el?.querySelector(".rounded-lg");
    expect(indicator).toBeTruthy();
  });

  it("withHandle=false does not render grip indicator", () => {
    const { container } = render(() => (
      <ResizablePanelGroup panels={[{ id: "a" }, { id: "b" }]}>
        <ResizablePanel id="a">Panel 1</ResizablePanel>
        <ResizableHandle id="a:b" withHandle={false} />
        <ResizablePanel id="b">Panel 2</ResizablePanel>
      </ResizablePanelGroup>
    ));
    const el = container.querySelector("[data-slot='resizable-handle']");
    const indicators = el?.querySelectorAll(".rounded-lg");
    expect(indicators?.length).toBe(0);
  });

  it("merges custom class", () => {
    const { container } = render(() => (
      <ResizablePanelGroup panels={[{ id: "a" }, { id: "b" }]}>
        <ResizablePanel id="a">Panel 1</ResizablePanel>
        <ResizableHandle id="a:b" class="custom-handle" />
        <ResizablePanel id="b">Panel 2</ResizablePanel>
      </ResizablePanelGroup>
    ));
    const el = container.querySelector("[data-slot='resizable-handle']");
    expect(el?.className).toContain("custom-handle");
  });
});
