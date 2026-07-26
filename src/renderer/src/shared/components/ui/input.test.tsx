import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Input } from "@codeman-frontend/shared/components/ui/input";

describe("Input", () => {
  it("默认 type text：tag 是 input 且 type 是 text 且 className 包含 h-8 和 rounded-lg", () => {
    const { container } = render(() => <Input />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.tagName).toBe("INPUT");
    expect(el.type).toBe("text");
    expect(el.className).toContain("h-8");
    expect(el.className).toContain("rounded-lg");
  });

  it("type 透传：type 是 password", () => {
    const { container } = render(() => <Input type="password" />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.type).toBe("password");
  });

  it("class 透传：className 包含 my-extra-class", () => {
    const { container } = render(() => <Input class="my-extra-class" />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.className).toContain("my-extra-class");
  });

  it("has data-slot=input", () => {
    const { container } = render(() => <Input />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.getAttribute("data-slot")).toBe("input");
  });

  it("aria-invalid sets error border class", () => {
    const { container } = render(() => <Input aria-invalid />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.className).toContain("aria-invalid:border-destructive");
  });

  it("disabled state applies disabled style", () => {
    const { container } = render(() => <Input disabled />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.className).toContain("disabled:opacity-50");
  });

  it("placeholder shows muted-foreground class", () => {
    const { container } = render(() => <Input placeholder="Type here..." />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.className).toContain("placeholder:text-muted-foreground");
  });

  it("type=file applies file: class", () => {
    const { container } = render(() => <Input type="file" />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.className).toContain("file:inline-flex");
  });
});
