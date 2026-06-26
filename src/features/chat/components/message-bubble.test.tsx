//! MessageBubble 组件测试 — 每个角色一个（user, assistant, tool, system）。
//!
//! 纯 UI 组件。无 Effect 导入。无 store mock 需要。

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";
import { MessageBubble } from "./message-bubble";
import type { Message, ToolCall, ToolResult, FileMatch } from "../../../shared/lib/types";

describe("MessageBubble", () => {
  afterEach(() => cleanup());

  it("user 角色：HTML 转义内容", () => {
    const msg: Message = {
      id: "msg-1",
      conversation_id: "conv-1",
      role: "user",
      content: "<script>alert('xss')</script>",
      tool_calls: null,
      tool_results: null,
      model: null,
      input_tokens: null,
      output_tokens: null,
      created_at: 1710000000,
    };
    const { container } = render(() => <MessageBubble message={msg} />);
    const bubble = container.querySelector(".justify-end");
    expect(bubble).toBeTruthy();
    // 内容应该被转义（无原始 <script> 标签）
    expect(bubble?.innerHTML).not.toContain("<script>");
    expect(bubble?.textContent).toContain("<script>alert('xss')</script>");
  });

  it("assistant 角色：Markdown 渲染加粗", () => {
    const msg: Message = {
      id: "msg-2",
      conversation_id: "conv-1",
      role: "assistant",
      content: "Hello **world**",
      tool_calls: null,
      tool_results: null,
      model: "gpt-4o",
      input_tokens: null,
      output_tokens: null,
      created_at: 1710000001,
    };
    const { container } = render(() => <MessageBubble message={msg} />);
    const bubble = container.querySelector(".justify-start");
    expect(bubble).toBeTruthy();
    // marked 将 **text** 解析为 <strong>
    const strong = bubble?.querySelector("strong");
    expect(strong?.textContent).toBe("world");
  });

  it("tool 角色：显示 Tool 结果摘要", () => {
    const toolResults: ToolResult[] = [{ tool_call_id: "tc-1", result: { ok: true }, error: null }];
    const msg: Message = {
      id: "msg-3",
      conversation_id: "conv-1",
      role: "tool",
      content: '{"status":"ok"}',
      tool_calls: null,
      tool_results: toolResults,
      model: null,
      input_tokens: null,
      output_tokens: null,
      created_at: 1710000002,
    };
    const { container } = render(() => <MessageBubble message={msg} />);
    const bubble = container.querySelector(".justify-start");
    expect(bubble).toBeTruthy();
    // Polish C3: tool 角色摘要走中文 "工具结果" (前是 "Tool result")
    const summary = bubble?.querySelector("summary");
    expect(summary?.textContent).toBe("工具结果");
    // 显示带 ✓ 的工具结果项
    expect(bubble?.textContent).toContain("✓");
  });

  it("system 角色：静音文本", () => {
    const msg: Message = {
      id: "msg-4",
      conversation_id: "conv-1",
      role: "system",
      content: "You are a helpful assistant.",
      tool_calls: null,
      tool_results: null,
      model: null,
      input_tokens: null,
      output_tokens: null,
      created_at: 1710000003,
    };
    const { container } = render(() => <MessageBubble message={msg} />);
    const bubble = container.querySelector(".justify-start");
    expect(bubble).toBeTruthy();
    expect(bubble?.textContent).toContain("You are a helpful assistant.");
  });

  it("带 tool_calls 的 assistant 显示可展开工具调用详情", () => {
    const toolCalls: ToolCall[] = [
      { id: "tc-1", name: "read_file", args: { path: "/tmp/x.txt" } },
    ];
    const msg: Message = {
      id: "msg-5",
      conversation_id: "conv-1",
      role: "assistant",
      content: "Let me check that.",
      tool_calls: toolCalls,
      tool_results: null,
      model: "gpt-4o",
      input_tokens: null,
      output_tokens: null,
      created_at: 1710000004,
    };
    const { container } = render(() => <MessageBubble message={msg} />);
    const details = container.querySelector("details");
    expect(details).toBeTruthy();
    const summary = details?.querySelector("summary");
    expect(summary?.textContent).toContain("工具调用 (1)");
    expect(details?.textContent).toContain("read_file");
  });

  // ─── tool_results error/success 分支测试 ─────────────────────────────
  it("tool_results[0].error 存在时用 text-destructive + ❌", () => {
    const toolResults: ToolResult[] = [
      { tool_call_id: "tc-1", result: "ok", error: "boom" },
    ];
    const msg: Message = {
      id: "msg-6",
      conversation_id: "conv-1",
      role: "tool",
      content: "",
      tool_calls: null,
      tool_results: toolResults,
      model: null,
      input_tokens: null,
      output_tokens: null,
      created_at: 1710000005,
    };
    const { container } = render(() => <MessageBubble message={msg} />);
    const bubble = container.querySelector(".justify-start");
    expect(bubble).toBeTruthy();
    // text-destructive class for error
    const errorDiv = bubble?.querySelector(".text-destructive");
    expect(errorDiv).toBeTruthy();
    expect(errorDiv?.textContent).toContain("❌");
    expect(errorDiv?.textContent).toContain("tc-1");
  });

  it("tool_results[0].error = null 时用 text-success + ✓", () => {
    const toolResults: ToolResult[] = [
      { tool_call_id: "tc-1", result: "ok", error: null },
    ];
    const msg: Message = {
      id: "msg-7",
      conversation_id: "conv-1",
      role: "tool",
      content: "",
      tool_calls: null,
      tool_results: toolResults,
      model: null,
      input_tokens: null,
      output_tokens: null,
      created_at: 1710000006,
    };
    const { container } = render(() => <MessageBubble message={msg} />);
    const bubble = container.querySelector(".justify-start");
    expect(bubble).toBeTruthy();
    // text-success class for success
    const successDiv = bubble?.querySelector(".text-success");
    expect(successDiv).toBeTruthy();
    expect(successDiv?.textContent).toContain("✓");
  });

  // ─── 长字符串 tool result 渲染 details 测试 ─────────────────────────
  it("tool result string.length > 200 渲染 details + 行数", () => {
    // Create a string longer than 200 characters
    const longResult = "a".repeat(250);
    const toolResults: ToolResult[] = [
      { tool_call_id: "tc-1", result: longResult, error: null },
    ];
    const msg: Message = {
      id: "msg-8",
      conversation_id: "conv-1",
      role: "tool",
      content: "",
      tool_calls: null,
      tool_results: toolResults,
      model: null,
      input_tokens: null,
      output_tokens: null,
      created_at: 1710000007,
    };
    const { container } = render(() => <MessageBubble message={msg} />);
    const bubble = container.querySelector(".justify-start");
    expect(bubble).toBeTruthy();
    // Should have nested details for long content
    const nestedDetails = bubble?.querySelectorAll("details");
    expect(nestedDetails?.length).toBeGreaterThan(1);
  });

  // ─── FileMatch[] array 渲染测试 ─────────────────────────────────────
  it("tool result array (FileMatch[]) 渲染 match list", () => {
    const toolResults: ToolResult[] = [
      {
        tool_call_id: "tc-search",
        result: [
          { path: "src/x.ts", line_number: 42, line_content: "const x = 1" },
          { path: "src/y.ts", line_number: 100, line_content: "const y = 2" },
        ] as FileMatch[],
        error: null,
      },
    ];
    const msg: Message = {
      id: "msg-9",
      conversation_id: "conv-1",
      role: "tool",
      content: "",
      tool_calls: null,
      tool_results: toolResults,
      model: null,
      input_tokens: null,
      output_tokens: null,
      created_at: 1710000008,
    };
    const { container } = render(() => <MessageBubble message={msg} />);
    const bubble = container.querySelector(".justify-start");
    expect(bubble).toBeTruthy();
    // Should show line numbers
    expect(bubble?.textContent).toContain("42");
    expect(bubble?.textContent).toContain("100");
    // Should show paths in <code>
    const codeElements = bubble?.querySelectorAll("code");
    const paths = Array.from(codeElements ?? []).map((c) => c.textContent);
    expect(paths).toContain("src/x.ts");
    expect(paths).toContain("src/y.ts");
  });

  // ─── tool role 仅有 content 无 tool_results 测试 ─────────────────────
  it("tool role 仅有 content (无 tool_results) 渲染 JSON", () => {
    const msg: Message = {
      id: "msg-10",
      conversation_id: "conv-1",
      role: "tool",
      content: '{"x":1}',
      tool_calls: null,
      tool_results: null,
      model: null,
      input_tokens: null,
      output_tokens: null,
      created_at: 1710000009,
    };
    const { container } = render(() => <MessageBubble message={msg} />);
    const bubble = container.querySelector(".justify-start");
    expect(bubble).toBeTruthy();
    // Should render JSON content in <pre>
    const pre = bubble?.querySelector("pre");
    expect(pre).toBeTruthy();
    // JSON.stringify of '{"x":1}' produces escaped string
    expect(pre?.textContent).toContain("x");
  });

  // ─── system 消息样式测试 ─────────────────────────────────────────────
  it("system 消息含 italic + bg-warning/10", () => {
    const msg: Message = {
      id: "msg-11",
      conversation_id: "conv-1",
      role: "system",
      content: "System prompt here.",
      tool_calls: null,
      tool_results: null,
      model: null,
      input_tokens: null,
      output_tokens: null,
      created_at: 1710000010,
    };
    const { container } = render(() => <MessageBubble message={msg} />);
    const bubble = container.querySelector(".justify-start");
    expect(bubble).toBeTruthy();
    // italic class for system
    const italicDiv = bubble?.querySelector(".italic");
    expect(italicDiv).toBeTruthy();
    // bg-warning/10 (using bg-warning/10 class)
    expect(bubble?.innerHTML).toContain("warning");
  });
});
