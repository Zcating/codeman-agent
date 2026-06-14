import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("渲染 input checkbox", () => {
    const { container } = render(() => <Checkbox />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.type).toBe("checkbox");
    expect(el.className).toContain("h-4");
    expect(el.className).toContain("rounded");
  });

  it("选中状态", () => {
    const { container } = render(() => <Checkbox checked={true} />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.checked).toBe(true);
  });

  it("class 透传", () => {
    const { container } = render(() => <Checkbox class="my-cb" />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.className).toContain("my-cb");
  });
});
