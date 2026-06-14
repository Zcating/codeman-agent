import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Input } from "./input";

describe("Input", () => {
  it("default type text: tag is input AND type is text AND className contains h-10 AND rounded-md", () => {
    const { container } = render(() => <Input />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.tagName).toBe("INPUT");
    expect(el.type).toBe("text");
    expect(el.className).toContain("h-10");
    expect(el.className).toContain("rounded-md");
  });

  it("type passthrough: type is password", () => {
    const { container } = render(() => <Input type="password" />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.type).toBe("password");
  });

  it("class passthrough: className contains my-extra-class", () => {
    const { container } = render(() => <Input class="my-extra-class" />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.className).toContain("my-extra-class");
  });
});
