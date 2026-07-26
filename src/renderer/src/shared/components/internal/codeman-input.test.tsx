import { fireEvent, render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { CodemanInput } from "@codeman-frontend/shared/components/internal/codeman-input";

describe("CodemanInput", () => {
  it("必传 props:渲染 input 元素 + 默认 type=text", () => {
    const { container } = render(() => (
      <CodemanInput value="" onValueChange={() => undefined} />
    ));
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe("text");
  });

  it("label 传则渲染,不传则不渲染", () => {
    const { container: a } = render(() => (
      <CodemanInput value="" onValueChange={() => undefined} label="用户名" />
    ));
    expect(a.querySelector("label")?.textContent).toBe("用户名");

    const { container: b } = render(() => (
      <CodemanInput value="" onValueChange={() => undefined} />
    ));
    expect(b.querySelector("label")).toBeNull();
  });

  it("error 渲染时 helperText 不渲染 (priority: error > helper)", () => {
    const { container } = render(() => (
      <CodemanInput
        value=""
        onValueChange={() => undefined}
        helperText="密码强度提示"
        error="必填"
      />
    ));
    expect(container.textContent).toContain("必填");
    expect(container.textContent).not.toContain("密码强度提示");
  });

  it("type 透传 + class 合并", () => {
    const { container } = render(() => (
      <CodemanInput
        value="x"
        onValueChange={() => undefined}
        type="password"
        inputClass="extra-class"
      />
    ));
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.className).toContain("h-10");
    expect(input.className).toContain("extra-class");
  });

  it("透传 data-slot=input from underlying Input", () => {
    const { container } = render(() => (
      <CodemanInput value="" onValueChange={() => undefined} />
    ));
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.getAttribute("data-slot")).toBe("input");
  });

  it("aria-invalid=true when error is set", () => {
    const { container } = render(() => (
      <CodemanInput value="" onValueChange={() => undefined} error="必填" />
    ));
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("error 文本渲染在 codeman-input 内", () => {
    const { container } = render(() => (
      <CodemanInput value="" onValueChange={() => undefined} error="必填" />
    ));
    expect(container.textContent).toContain("必填");
    const errorEl = container.querySelector(".text-destructive");
    expect(errorEl).toBeInTheDocument();
  });

  // ─── IME 安全 (Bug Fix regression) ────────────────────────────────────
  it("IME composition 期间 onInput 不触发 onValueChange", () => {
    const onChange = vi.fn();
    const { container } = render(() => (
      <CodemanInput value="" onValueChange={onChange} />
    ));
    const input = container.querySelector("input") as HTMLInputElement;

    fireEvent(input, new Event("compositionstart", { bubbles: true }));
    fireEvent.input(input, { target: { value: "n" } });
    fireEvent.input(input, { target: { value: "ni" } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent(input, new Event("compositionend", { bubbles: true }));
    fireEvent.input(input, { target: { value: "你" } });
    expect(onChange).toHaveBeenLastCalledWith("你");
  });
});
