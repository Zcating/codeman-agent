import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Textarea } from "./textarea";

describe("Textarea", () => {
  it("渲染 textarea tag 且有共享类", () => {
    const { container } = render(() => <Textarea />);
    const el = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(el).not.toBeNull();
    expect(el.className).toContain("min-h-20");
    expect(el.className).toContain("rounded-md");
  });

  it("透传 rows prop", () => {
    const { container } = render(() => <Textarea rows={5} />);
    const el = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(el.rows).toBe(5);
  });

  it("合并 class prop", () => {
    const { container } = render(() => <Textarea class="extra" />);
    const el = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(el.className).toContain("extra");
  });
});
