import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

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
    expect(className).toContain("bg-destructive");
  });

  it("icon 尺寸：渲染 icon 尺寸", () => {
    const { container } = render(() => <Button size="icon" />);
    const className = container.querySelector("button")?.className ?? "";
    expect(className).toContain("h-10");
    expect(className).toContain("w-10");
  });

  it("class 覆盖合并：consumer class 通过 twMerge 保留", () => {
    const { container } = render(() => <Button class="bg-blue-500" />);
    const className = container.querySelector("button")?.className ?? "";
    expect(className).toContain("bg-blue-500");
  });
});
