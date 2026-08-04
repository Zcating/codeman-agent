import { fireEvent, render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { CodemanCheckbox } from "@codeman-frontend/shared/components/internal/codeman-checkbox";

// @ts-expect-error label is intentionally not part of CodemanCheckboxProps
type _AssertNoLabel = CodemanCheckboxProps extends { label: any } ? never : true;
// @ts-expect-error description is intentionally not part of CodemanCheckboxProps
type _AssertNoDescription = CodemanCheckboxProps extends { description: any } ? never : true;
// @ts-expect-error error is intentionally not part of CodemanCheckboxProps
type _AssertNoError = CodemanCheckboxProps extends { error: any } ? never : true;
// @ts-expect-error variant is intentionally not part of CodemanCheckboxProps
type _AssertNoVariant = CodemanCheckboxProps extends { variant: any } ? never : true;

describe("CodemanCheckbox", () => {
  it("value=true => checkbox checked", () => {
    const { container } = render(
      () => <CodemanCheckbox value={true} onChange={() => undefined} />,
    );
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.checked).toBe(true);
  });

  it("value=false => checkbox unchecked", () => {
    const { container } = render(
      () => <CodemanCheckbox value={false} onChange={() => undefined} />,
    );
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.checked).toBe(false);
  });

  it("change event => onChange receives boolean (not DOM event)", () => {
    const onChange = vi.fn();
    const { container } = render(
      () => <CodemanCheckbox value={false} onChange={onChange} />,
    );
    const el = container.querySelector("input") as HTMLInputElement;
    // fireEvent.change doesn't set currentTarget.checked, so set it manually
    el.checked = true;
    fireEvent.change(el);
    expect(onChange).toHaveBeenCalledWith(true);
    // Ensure it was called exactly once with boolean true
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("disabled propagates", () => {
    const { container } = render(
      () => <CodemanCheckbox value={false} onChange={() => undefined} disabled />,
    );
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.disabled).toBe(true);
  });

  it("aria-label and data-testid propagate", () => {
    const { container } = render(
      () => (
        <CodemanCheckbox
          value={false}
          onChange={() => undefined}
          aria-label="Enable feature"
          data-testid="my-checkbox"
        />
      ),
    );
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.getAttribute("aria-label")).toBe("Enable feature");
    expect(el.getAttribute("data-testid")).toBe("my-checkbox");
  });
});
