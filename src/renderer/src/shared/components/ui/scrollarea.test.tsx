import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { ScrollArea } from "@codeman-frontend/shared/components/ui/scrollarea";

describe("ScrollArea (shadcn-style, .repos/shadcn/scroll-area.tsx 移植)", () => {
  it("renders Root with data-slot=scroll-area", () => {
    const { container } = render(() => <ScrollArea>content</ScrollArea>);
    const root = container.querySelector("[data-slot='scroll-area']");
    expect(root).toBeTruthy();
  });

  it("renders Viewport (真正的滚动元素) with data-slot=scroll-area-viewport", () => {
    const { container } = render(() => <ScrollArea>content</ScrollArea>);
    const viewport = container.querySelector("[data-slot='scroll-area-viewport']");
    expect(viewport).toBeTruthy();
    expect(viewport!.className).toContain("size-full");
  });

  it("renders ScrollBar + Corner inside Root", () => {
    const { container } = render(() => <ScrollArea>content</ScrollArea>);
    expect(container.querySelector("[data-slot='scroll-area-scrollbar']")).toBeTruthy();
    expect(container.querySelector("[data-slot='scroll-area-corner']")).toBeTruthy();
  });

  it("ADR-0039: data-scroll-region + data-testid 透传到 Viewport（而非 Root）", () => {
    const { container } = render(() => (
      <ScrollArea data-scroll-region="true" data-testid="main-content-scroll">
        content
      </ScrollArea>
    ));
    const root = container.querySelector("[data-slot='scroll-area']");
    const viewport = container.querySelector("[data-slot='scroll-area-viewport']");
    expect(root!.getAttribute("data-scroll-region")).toBeNull();
    expect(root!.getAttribute("data-testid")).toBeNull();
    expect(viewport!.getAttribute("data-scroll-region")).toBe("true");
    expect(viewport!.getAttribute("data-testid")).toBe("main-content-scroll");
  });

  it("ADR-0039: Viewport 是滚动元素（zag 注入 overflow:auto），Root 只是定位壳", () => {
    const { container } = render(() => <ScrollArea class="flex-1 min-h-0">content</ScrollArea>);
    const root = container.querySelector("[data-slot='scroll-area']");
    const viewport = container.querySelector("[data-slot='scroll-area-viewport']");
    expect(root!.className).toContain("relative");
    expect(root!.className).toContain("overflow-hidden");
    // flex 尺寸链在 Root 上
    expect(root!.className).toContain("flex-1");
    expect(root!.className).toContain("min-h-0");
    // 滚动通道在 Viewport 上（zag getViewportProps 注入 style.overflow=auto）
    expect((viewport as HTMLElement).style.overflow).toBe("auto");
  });

  it("merges custom class on Root", () => {
    const { container } = render(() => <ScrollArea class="custom-class">content</ScrollArea>);
    const root = container.querySelector("[data-slot='scroll-area']");
    expect(root!.className).toContain("custom-class");
  });

  it("passes children through into the Viewport", () => {
    const { container } = render(() => <ScrollArea>hello-child</ScrollArea>);
    const viewport = container.querySelector("[data-slot='scroll-area-viewport']");
    expect(viewport!.textContent).toContain("hello-child");
  });
});
