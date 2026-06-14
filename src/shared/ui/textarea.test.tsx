import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Textarea } from "./textarea";

describe("Textarea", () => {
  it("renders textarea tag with shared classes", () => {
    const { container } = render(() => <Textarea />);
    const el = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(el).not.toBeNull();
    expect(el.className).toContain("min-h-20");
    expect(el.className).toContain("rounded-md");
  });

  it("forwards rows prop", () => {
    const { container } = render(() => <Textarea rows={5} />);
    const el = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(el.rows).toBe(5);
  });

  it("merges class prop", () => {
    const { container } = render(() => <Textarea class="extra" />);
    const el = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(el.className).toContain("extra");
  });
});
