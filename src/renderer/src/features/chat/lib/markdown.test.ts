
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "@codeman-frontend/features/chat/lib/markdown";

describe("renderMarkdown", () => {
  it("T1: bold 渲染为 <strong>", () => {
    const result = renderMarkdown("**bold**");
    expect(result).toContain("<strong>bold</strong>");
  });

  it("T2: H1 渲染为 <h1>", () => {
    const result = renderMarkdown("# H1");
    expect(result).toContain("<h1>H1</h1>");
  });

  it("T3: link 渲染为 <a>", () => {
    const result = renderMarkdown("[link](https://x.com)");
    expect(result).toContain('<a href="https://x.com">link</a>');
  });

  it("T4: 裸 URL 自动识别为可点击 link", () => {
    const result = renderMarkdown("https://x.com");
    expect(result).toContain('<a href="https://x.com">https://x.com</a>');
  });

  it("T5: ~~strike~~ 渲染为 <s>", () => {
    const result = renderMarkdown("~~strike~~");
    expect(result).toContain("<s>strike</s>");
  });

  it("T6: GFM table 渲染为 <table>", () => {
    const md = "| a | b |\n| - | - |\n| 1 | 2 |";
    const result = renderMarkdown(md);
    expect(result).toContain("<table>");
  });

  it("T7: - [ ] todo 渲染为 checkbox", () => {
    const result = renderMarkdown("- [ ] todo");
    expect(result).toContain('type="checkbox"');
  });

  it("T8: <script> alert(1) </script> 不出现在输出中", () => {
    const result = renderMarkdown("<script>alert(1)</script>");
    expect(result).not.toContain("<script>");
  });

  it("T9: XSS <img onerror> 属性 onerror= 被剥离", () => {
    const result = renderMarkdown('<img src=x onerror=alert(1)>');
    expect(result).not.toMatch(/<[^>]*?onerror\s*=/);
  });

  it("T10: 空字符串返回空字符串或纯空白", () => {
    const result = renderMarkdown("");
    expect(result.trim()).toBe("");
  });
});
