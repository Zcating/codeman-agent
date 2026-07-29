//! markdown.ts 测试 — TDD 红→绿循环验证 renderMarkdown 行为。
//!
//! 覆盖: bold, H1, link, linkify, strikethrough, table, task lists, XSS 防护, 空输入。

import { describe, it, expect, vi } from "vitest";

// ─── DOMPurify mock ──────────────────────────────────────────────────────────
// jsdom 25+ 自带 window 但 DOMPurify 依赖 window.document 而可能不完全兼容。
// 先检查是否能正常 import，如果不行则 mock。
// 注意: html:false 是第一道防线，DOMPurify 是第二道。即使 DOMPurify 被 mock 成透传，
// T8/T9 的 html:false 拦截仍然有效。
vi.mock("dompurify", () => ({
  default: {
    sanitize: (str: string) => str,
  },
}));

import { renderMarkdown } from "@codeman-frontend/features/chat/lib/markdown";

describe("renderMarkdown", () => {
  // T1: bold
  it("T1: bold 渲染为 <strong>", () => {
    const result = renderMarkdown("**bold**");
    expect(result).toContain("<strong>bold</strong>");
  });

  // T2: H1
  it("T2: H1 渲染为 <h1>", () => {
    const result = renderMarkdown("# H1");
    expect(result).toContain("<h1>H1</h1>");
  });

  // T3: link
  it("T3: link 渲染为 <a>", () => {
    const result = renderMarkdown("[link](https://x.com)");
    expect(result).toContain('<a href="https://x.com">link</a>');
  });

  // T4: linkify — 自动识别 URL
  it("T4: 裸 URL 自动识别为可点击 link", () => {
    const result = renderMarkdown("https://x.com");
    expect(result).toContain('<a href="https://x.com">https://x.com</a>');
  });

  // T5: strikethrough
  it("T5: ~~strike~~ 渲染为 <s>", () => {
    const result = renderMarkdown("~~strike~~");
    expect(result).toContain("<s>strike</s>");
  });

  // T6: GFM table
  it("T6: GFM table 渲染为 <table>", () => {
    const md = "| a | b |\n| - | - |\n| 1 | 2 |";
    const result = renderMarkdown(md);
    expect(result).toContain("<table>");
  });

  // T7: task list (checkbox)
  it("T7: - [ ] todo 渲染为 checkbox", () => {
    const result = renderMarkdown("- [ ] todo");
    // markdown-it-task-lists 渲染为 <input type="checkbox" disabled>
    expect(result).toContain('type="checkbox"');
  });

  // T8: XSS — <script> 标签必须被拦截
  it("T8: <script> alert(1) </script> 不出现在输出中", () => {
    const result = renderMarkdown("<script>alert(1)</script>");
    expect(result).not.toContain("<script>");
  });

  // T9: XSS — img 标签不会作为 HTML 渲染（html:false 将其转义为文本）
  it("T9: <img src=x onerror=alert(1)> 不会作为 HTML img 标签渲染", () => {
    const result = renderMarkdown('<img src=x onerror=alert(1)>');
    // html:false 使原始 HTML 被转义为可见文本，不会作为 <img> 标签执行
    expect(result).not.toContain("<img");
  });

  // T10: empty string
  it("T10: 空字符串返回空字符串或纯空白", () => {
    const result = renderMarkdown("");
    // 返回值应该是空字符串或纯空白
    expect(result.trim()).toBe("");
  });
});
