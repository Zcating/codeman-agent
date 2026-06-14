import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("default: renders with base and default variant classes", () => {
    const { container } = render(() => <Button />);
    const className = container.querySelector("button")?.className ?? "";
    expect(className).toContain("inline-flex");
    expect(className).toContain("bg-primary");
  });

  it("destructive variant: renders with destructive class", () => {
    const { container } = render(() => <Button variant="destructive" />);
    const className = container.querySelector("button")?.className ?? "";
    expect(className).toContain("bg-destructive");
  });

  it("icon size: renders with icon dimensions", () => {
    const { container } = render(() => <Button size="icon" />);
    const className = container.querySelector("button")?.className ?? "";
    expect(className).toContain("h-10");
    expect(className).toContain("w-10");
  });

  it("class override merge: consumer class is preserved via twMerge", () => {
    const { container } = render(() => <Button class="bg-blue-500" />);
    const className = container.querySelector("button")?.className ?? "";
    expect(className).toContain("bg-blue-500");
  });
});
