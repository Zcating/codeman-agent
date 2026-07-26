import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Checkbox } from "@codeman-frontend/shared/components/ui/checkbox";

describe("Checkbox", () => {
  it("渲染 input checkbox", () => {
    const { container } = render(() => <Checkbox />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.type).toBe("checkbox");
    expect(el.className).toContain("size-4");
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

  it("has data-slot=checkbox", () => {
    const { container } = render(() => <Checkbox />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.getAttribute("data-slot")).toBe("checkbox");
  });

  it("aria-invalid sets error border class", () => {
    const { container } = render(() => <Checkbox aria-invalid={true} />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.className).toContain("aria-invalid:border-destructive");
    expect(el.getAttribute("aria-invalid")).toBe("true");
  });

  it("checked state applies data-checked attribute", () => {
    const { container } = render(() => <Checkbox checked={true} />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.getAttribute("data-checked")).toBe("");
  });

  it("disabled state applies disabled style", () => {
    const { container } = render(() => <Checkbox disabled />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.disabled).toBe(true);
    expect(el.className).toContain("disabled:cursor-not-allowed");
  });
});
