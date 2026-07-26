import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Textarea } from "@codeman-frontend/shared/components/ui/textarea";

describe("Textarea", () => {
  it("渲染 textarea tag 且有共享类", () => {
    const { container } = render(() => <Textarea />);
    const el = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(el).not.toBeNull();
    expect(el.className).toContain("min-h-16");
    expect(el.className).toContain("rounded-lg");
    expect(el.className).toContain("field-sizing-content");
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

  it("has data-slot=textarea", () => {
    const { container } = render(() => <Textarea />);
    const el = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(el.getAttribute("data-slot")).toBe("textarea");
  });

  it("aria-invalid sets error border class", () => {
    const { container } = render(() => <Textarea aria-invalid />);
    const el = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(el.className).toContain("aria-invalid:border-destructive");
  });

  it("disabled state applies disabled style", () => {
    const { container } = render(() => <Textarea disabled />);
    const el = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(el.className).toContain("disabled:cursor-not-allowed");
    expect(el.disabled).toBe(true);
  });
});
