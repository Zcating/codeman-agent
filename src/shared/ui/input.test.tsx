import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Input } from "./input";

describe("Input", () => {
  it("默认 type text：tag 是 input 且 type 是 text 且 className 包含 h-10 和 rounded-md", () => {
    const { container } = render(() => <Input />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.tagName).toBe("INPUT");
    expect(el.type).toBe("text");
    expect(el.className).toContain("h-10");
    expect(el.className).toContain("rounded-md");
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
});
