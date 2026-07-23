import { fireEvent, render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { CodemanTextarea } from "./codeman-textarea";

describe("CodemanTextarea", () => {
  it("渲染 textarea 元素 + rows 透传", () => {
    const { container } = render(() => (
      <CodemanTextarea value="" onValueChange={() => undefined} rows={4} />
    ));
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.rows).toBe(4);
    expect(textarea.className).toContain("min-h-20");
    expect(textarea.className).toContain("resize-none");
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

  // ─── IME 安全 (Bug Fix regression:与 codeman-input 同源) ─────────────
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
