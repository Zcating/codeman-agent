import { fireEvent, render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { CodemanTextarea } from "@codeman-frontend/shared/components/internal/codeman-textarea";

describe("CodemanTextarea", () => {
  it("渲染 textarea 元素 + rows 透传", () => {
    const { container } = render(() => (
      <CodemanTextarea value="" onValueChange={() => undefined} rows={4} />
    ));
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.rows).toBe(4);
    expect(textarea.className).toContain("min-h-16");
    expect(textarea.className).toContain("field-sizing-content");
  });

  it("label 透传,helperText/error 二选一", () => {
    const { container: c1 } = render(() => (
      <CodemanTextarea
        value=""
        onValueChange={() => undefined}
        label="发条消息"
        helperText="最多 4000 字"
      />
    ));
    expect(c1.querySelector("label")?.textContent).toBe("发条消息");
    expect(c1.textContent).toContain("最多 4000 字");

    const { container: c2 } = render(() => (
      <CodemanTextarea value="" onValueChange={() => undefined} error="内容不能为空" />
    ));
    expect(c2.textContent).toContain("内容不能为空");
  });

  it("透传 data-slot=textarea from underlying Textarea", () => {
    const { container } = render(() => (
      <CodemanTextarea value="" onValueChange={() => undefined} />
    ));
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea?.getAttribute("data-slot")).toBe("textarea");
  });

  it("aria-invalid=true when error is set", () => {
    const { container } = render(() => (
      <CodemanTextarea value="" onValueChange={() => undefined} error="必填" />
    ));
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea?.getAttribute("aria-invalid")).toBe("true");
  });

  it("error 文本渲染在 codeman-textarea 内", () => {
    const { container } = render(() => (
      <CodemanTextarea value="" onValueChange={() => undefined} error="内容不能为空" />
    ));
    expect(container.textContent).toContain("内容不能为空");
  });

  
  it("IME composition 期间 onInput 不触发 onValueChange", () => {
    const onChange = vi.fn();
    const { container } = render(() => (
      <CodemanTextarea value="" onValueChange={onChange} />
    ));
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;

    fireEvent(textarea, new Event("compositionstart", { bubbles: true }));
    fireEvent.input(textarea, { target: { value: "n" } });
    fireEvent.input(textarea, { target: { value: "ni" } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent(textarea, new Event("compositionend", { bubbles: true }));
    fireEvent.input(textarea, { target: { value: "你好" } });
    expect(onChange).toHaveBeenLastCalledWith("你好");
  });
});
