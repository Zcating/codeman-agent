import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("renders input checkbox", () => {
    const { container } = render(() => <Checkbox />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.type).toBe("checkbox");
    expect(el.className).toContain("h-4");
    expect(el.className).toContain("rounded");
  });

  it("checked state", () => {
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
