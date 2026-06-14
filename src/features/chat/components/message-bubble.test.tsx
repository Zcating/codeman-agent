//! MessageBubble component tests — one per role (user, assistant, tool, system).
//!
//! Pure UI component. No Effect imports. No store mocks needed.

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";
import { MessageBubble } from "./message-bubble";
import type { Message, ToolCall, ToolResult } from "../../../shared/types";

describe("MessageBubble", () => {
  afterEach(() => cleanup());

  it("user role: HTML-escaped content", () => {
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
    // The content should be escaped (no raw <script> tag)
    expect(bubble?.innerHTML).not.toContain("<script>");
    expect(bubble?.textContent).toContain("<script>alert('xss')</script>");
  });

  it("assistant role: Markdown rendered with bold", () => {
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
    // marked parses **text** into <strong>
    const strong = bubble?.querySelector("strong");
    expect(strong?.textContent).toBe("world");
  });

  it("tool role: shows Tool result summary", () => {
    const toolResults: ToolResult[] = [
      { tool_call_id: "tc-1", result: { ok: true }, error: null },
    ];
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
    // Shows "Tool result" summary
    const summary = bubble?.querySelector("summary");
    expect(summary?.textContent).toBe("Tool result");
    // Shows the tool result item with ✓
    expect(bubble?.textContent).toContain("✓");
  });

  it("system role: muted text", () => {
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

  it("assistant with tool_calls shows expandable tool call details", () => {
    const toolCalls: ToolCall[] = [
      { id: "tc-1", name: "get_balance", args: { provider: "deepseek" } },
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
    expect(summary?.textContent).toContain("Tool calls (1)");
    expect(details?.textContent).toContain("get_balance");
  });
});
