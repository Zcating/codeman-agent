import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Button } from "@codeman-frontend/shared/components/ui/button";

describe("Button", () => {
  it("默认：渲染 base 和 default variant 类", () => {
    const { container } = render(() => <Button />);
    const className = container.querySelector("button")?.className ?? "";
    expect(className).toContain("inline-flex");
    expect(className).toContain("bg-primary");
  });

  it("destructive 变体：渲染 destructive 类", () => {
    const { container } = render(() => <Button variant="destructive" />);
    const className = container.querySelector("button")?.className ?? "";
    expect(className).toContain("bg-destructive/10");
  });

  it("icon 尺寸：渲染 size-8 class", () => {
    const { container } = render(() => <Button size="icon" />);
    const className = container.querySelector("button")?.className ?? "";
    expect(className).toContain("size-8");
  });

  it("class 覆盖合并：consumer class 通过 twMerge 保留", () => {
    const { container } = render(() => <Button class="bg-blue-500" />);
    const className = container.querySelector("button")?.className ?? "";
    expect(className).toContain("bg-blue-500");
  });

  it("xs size：渲染 h-6 class", () => {
    const { container } = render(() => <Button size="xs" />);
    const className = container.querySelector("button")?.className ?? "";
    expect(className).toContain("h-6");
  });

  it("icon-xs size：渲染 size-6 class", () => {
    const { container } = render(() => <Button size="icon-xs" />);
    const className = container.querySelector("button")?.className ?? "";
    expect(className).toContain("size-6");
  });

  it("icon-sm size：渲染 size-7 class", () => {
    const { container } = render(() => <Button size="icon-sm" />);
    const className = container.querySelector("button")?.className ?? "";
    expect(className).toContain("size-7");
  });

  it("icon-lg size：渲染 size-9 class", () => {
    const { container } = render(() => <Button size="icon-lg" />);
    const className = container.querySelector("button")?.className ?? "";
    expect(className).toContain("size-9");
  });

  it("data-slot=button 属性", () => {
    const { container } = render(() => <Button />);
    const button = container.querySelector("button");
    expect(button?.getAttribute("data-slot")).toBe("button");
  });

  it("aria-invalid 设置 aria-invalid 属性", () => {
    const { container } = render(() => <Button aria-invalid={true} />);
    const button = container.querySelector("button");
    expect(button?.getAttribute("aria-invalid")).toBe("true");
  });
});
