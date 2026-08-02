
import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { ScrollRegion } from "@codeman-frontend/shared/components/ui/scroll-region";

describe("ScrollRegion (ADR-0039 布局原语)", () => {
  it("渲染 data-scroll-region 身份 + class 三件套", () => {
    const { container } = render(() => <ScrollRegion>content</ScrollRegion>);
    const el = container.querySelector("[data-scroll-region]");
    expect(el).toBeTruthy();
    expect(el!.getAttribute("data-scroll-region")).toBe("true");
    expect(el!.className).toContain("flex-1");
    expect(el!.className).toContain("min-h-0");
    expect(el!.className).toContain("overflow-y-auto");
  });

  it("class prop 合并到三件套之上（chat 消息区场景：p-4 space-y-3）", () => {
    const { container } = render(() => <ScrollRegion class="p-4 space-y-3" />);
    const el = container.querySelector("[data-scroll-region]");
    expect(el!.className).toContain("overflow-y-auto");
    expect(el!.className).toContain("p-4");
    expect(el!.className).toContain("space-y-3");
  });

  it("透传 data-testid（主内容 wrapper 的契约身份）", () => {
    const { container } = render(() => (
      <ScrollRegion data-testid="main-content-scroll" />
    ));
    const el = container.querySelector('[data-testid="main-content-scroll"]');
    expect(el).toBeTruthy();
    expect(el!.getAttribute("data-scroll-region")).toBe("true");
  });

  it("渲染 children", () => {
    const { getByText } = render(() => (
      <ScrollRegion>
        <span>route content</span>
      </ScrollRegion>
    ));
    expect(getByText("route content")).toBeTruthy();
  });
});
