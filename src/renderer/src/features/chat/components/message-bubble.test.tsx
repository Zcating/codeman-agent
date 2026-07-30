
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";
import { MessageBubble } from "@codeman-frontend/features/chat/components/message-bubble";
import type { Message, ToolCall, ToolResult, FileMatch } from "@codeman-frontend/shared/lib/types";

vi.mock("../stores/chat.store", () => ({
  store: {
    byId: {} as Record<string, { streamingMessageId: string | null }>,
  },
}));

vi.mock("./tool-call-card", () => ({
  ToolCallCard: (props: { toolCall: ToolCall; result?: ToolResult }) => (
    <div
      data-testid="inline-tool-card"
      data-tool-name={props.toolCall.name}
      data-tool-id={props.toolCall.id}
      data-has-result={props.result ? "true" : "false"}
    >
      ToolCallCard {props.toolCall.name}
    </div>
  ),
}));


function makeUserMsg(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-user",
    conversationId: "conv-1",
    role: "user",
    content: "hello",
    thinking: null,
    toolCalls: null,
    toolResults: null,
    model: null,
    inputTokens: null,
    outputTokens: null,
    createdAt: 1,
    ...overrides,
  };
}

function makeAssistantMsg(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-asst",
    conversationId: "conv-1",
    role: "assistant",
    content: "world",
    thinking: null,
    toolCalls: null,
    toolResults: null,
    model: "gpt-4o",
    inputTokens: null,
    outputTokens: null,
    createdAt: 2,
    ...overrides,
  };
}

describe("MessageBubble", () => {
  afterEach(() => cleanup());


  it("user 角色：HTML 转义内容", () => {
    const msg = makeUserMsg({
      content: "<script>alert('xss')</script>",
    });
    const { container } = render(() => <MessageBubble message={msg} />);
    const bubble = container.querySelector(".justify-end");
    expect(bubble).toBeTruthy();
    expect(bubble?.innerHTML).not.toContain("<script>");
    expect(bubble?.textContent).toContain("<script>alert('xss')</script>");
  });


  it("assistant 角色：Markdown 渲染加粗", () => {
    const msg = makeAssistantMsg({ content: "Hello **world**" });
    const { container } = render(() => <MessageBubble message={msg} />);
    const bubble = container.querySelector('[data-testid="agent-bubble"]');
    expect(bubble).toBeTruthy();
    const strong = bubble?.querySelector("strong");
    expect(strong?.textContent).toBe("world");
  });

  it("assistant 角色：纯文本无 tool_calls → bubble 出现 + 三个子节点都不渲染", () => {
    const msg = makeAssistantMsg({ content: "just text" });
    const { container } = render(() => <MessageBubble message={msg} />);
    expect(container.querySelector('[data-testid="agent-bubble"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="thinking-panel"]')).toBeNull();
    expect(container.querySelector('[data-testid="inline-tool-calls"]')).toBeNull();
    expect(container.querySelector('[data-testid="agent-text-content"]')).toBeTruthy();
  });

  it("assistant 角色：tool_calls 内联渲染为 ToolCallCard (不再用独立 panel)", () => {
    const toolCalls: ToolCall[] = [
      { id: "tc-1", name: "read_file", args: { path: "/tmp/x.txt" } },
    ];
    const msg = makeAssistantMsg({
      content: "Let me check that.",
      toolCalls: toolCalls,
    });
    const { container } = render(() => <MessageBubble message={msg} />);
    const inline = container.querySelector('[data-testid="inline-tool-calls"]');
    expect(inline).toBeTruthy();
    const card = container.querySelector('[data-testid="inline-tool-card"]');
    expect(card).toBeTruthy();
    expect(card?.getAttribute("data-tool-name")).toBe("read_file");
    expect(card?.getAttribute("data-tool-id")).toBe("tc-1");
    expect(card?.getAttribute("data-has-result")).toBe("false");
  });

  it("assistant 角色：tool_calls + tool_results 配对 → ToolCallCard 拿到 result", () => {
    const toolCalls: ToolCall[] = [
      { id: "tc-1", name: "read_file", args: { path: "/a" } },
    ];
    const toolResults: ToolResult[] = [
      { toolCallId: "tc-1", result: "ok", error: null },
    ];
    const msg = makeAssistantMsg({
      content: "done",
      toolCalls: toolCalls,
      toolResults: toolResults,
    });
    const { container } = render(() => <MessageBubble message={msg} />);
    const card = container.querySelector('[data-testid="inline-tool-card"]');
    expect(card?.getAttribute("data-has-result")).toBe("true");
  });

  it("assistant 角色：thinking 非空 → 渲染 ThinkingPanel", () => {
    const msg = makeAssistantMsg({
      content: "answer",
      thinking: "Let me think about this...",
    });
    const { container } = render(() => <MessageBubble message={msg} />);
    const panel = container.querySelector('[data-testid="thinking-panel"]');
    expect(panel).toBeTruthy();
    expect(panel?.textContent).toContain("Let me think about this...");
  });

  it("assistant 角色：thinking 为空字符串 → 不渲染 ThinkingPanel", () => {
    const msg = makeAssistantMsg({
      content: "answer",
      thinking: "",
    });
    const { container } = render(() => <MessageBubble message={msg} />);
    expect(container.querySelector('[data-testid="thinking-panel"]')).toBeNull();
  });

  it("assistant 角色：thinking null → 不渲染 ThinkingPanel", () => {
    const msg = makeAssistantMsg({
      content: "answer",
      thinking: null,
    });
    const { container } = render(() => <MessageBubble message={msg} />);
    expect(container.querySelector('[data-testid="thinking-panel"]')).toBeNull();
  });

  it("assistant 三块全空 (abort 在第一个 token 之前) → 渲染占位文本", () => {
    const msg = makeAssistantMsg({
      content: "",
      thinking: null,
      toolCalls: null,
      toolResults: null,
    });
    const { container } = render(() => <MessageBubble message={msg} />);
    expect(container.querySelector('[data-testid="agent-bubble"]')).toBeTruthy();
    expect(container.textContent).toContain("空响应");
  });

  it("assistant 全部三块都存在 → 渲染顺序 thinking → tool calls → text", () => {
    const toolCalls: ToolCall[] = [{ id: "tc-1", name: "read_file", args: {} }];
    const msg = makeAssistantMsg({
      content: "answer",
      thinking: "thinking text",
      toolCalls: toolCalls,
    });
    const { container } = render(() => <MessageBubble message={msg} />);
    const bubble = container.querySelector('[data-testid="agent-bubble"]');
    expect(bubble).toBeTruthy();
    const children = Array.from(bubble!.children).map(
      (c) => c.getAttribute("data-testid") ?? c.tagName,
    );
    expect(children.indexOf("thinking-panel")).toBeLessThan(
      children.indexOf("inline-tool-calls"),
    );
    expect(children.indexOf("inline-tool-calls")).toBeLessThan(
      children.indexOf("agent-text-content"),
    );
  });


  it("tool 角色：显示 Tool 结果摘要", () => {
    const toolResults: ToolResult[] = [{ toolCallId: "tc-1", result: { ok: true }, error: null }];
    const msg: Message = makeUserMsg({
      id: "msg-3",
      role: "tool",
      content: '{"status":"ok"}',
      thinking: null,
      toolResults: toolResults,
    });
    const { container } = render(() => <MessageBubble message={msg} />);
    const bubble = container.querySelector(".justify-start");
    expect(bubble).toBeTruthy();
    const summary = bubble?.querySelector("summary");
    expect(summary?.textContent).toBe("工具结果");
    expect(container.querySelector("[data-testid='tool-success']")).toBeTruthy();
  });


  it("system 角色：静音文本", () => {
    const msg: Message = makeUserMsg({
      id: "msg-4",
      role: "system",
      content: "You are a helpful assistant.",
      thinking: null,
    });
    const { container } = render(() => <MessageBubble message={msg} />);
    const bubble = container.querySelector(".justify-start");
    expect(bubble).toBeTruthy();
    expect(bubble?.textContent).toContain("You are a helpful assistant.");
  });


  it("tool_results[0].error 存在时用 text-destructive + ❌", () => {
    const toolResults: ToolResult[] = [
      { toolCallId: "tc-1", result: "ok", error: "boom" },
    ];
    const msg: Message = makeUserMsg({
      id: "msg-6",
      role: "tool",
      content: "",
      thinking: null,
      toolResults: toolResults,
    });
    const { container } = render(() => <MessageBubble message={msg} />);
    const bubble = container.querySelector(".justify-start");
    expect(bubble).toBeTruthy();
    const errorDiv = bubble?.querySelector(".text-destructive");
    expect(errorDiv).toBeTruthy();
    expect(container.querySelector("[data-testid='tool-error']")).toBeTruthy();
  });

  it("tool_results[0].error = null 时用 text-success + ✓", () => {
    const toolResults: ToolResult[] = [
      { toolCallId: "tc-1", result: "ok", error: null },
    ];
    const msg: Message = makeUserMsg({
      id: "msg-7",
      role: "tool",
      content: "",
      thinking: null,
      toolResults: toolResults,
    });
    const { container } = render(() => <MessageBubble message={msg} />);
    const bubble = container.querySelector(".justify-start");
    expect(bubble).toBeTruthy();
    const successDiv = bubble?.querySelector(".text-success");
    expect(successDiv).toBeTruthy();
    expect(container.querySelector("[data-testid='tool-success']")).toBeTruthy();
  });


  it("tool result string.length > 200 渲染 details + 行数", () => {
    const longResult = "a".repeat(250);
    const toolResults: ToolResult[] = [
      { toolCallId: "tc-1", result: longResult, error: null },
    ];
    const msg: Message = makeUserMsg({
      id: "msg-8",
      role: "tool",
      content: "",
      thinking: null,
      toolResults: toolResults,
    });
    const { container } = render(() => <MessageBubble message={msg} />);
    const bubble = container.querySelector(".justify-start");
    expect(bubble).toBeTruthy();
    const nestedDetails = bubble?.querySelectorAll("details");
    expect(nestedDetails?.length).toBeGreaterThan(1);
  });


  it("tool result array (FileMatch[]) 渲染 match list", () => {
    const toolResults: ToolResult[] = [
      {
        toolCallId: "tc-search",
        result: [
          { path: "src/x.ts", lineNumber: 42, lineContent: "const x = 1" },
          { path: "src/y.ts", lineNumber: 100, lineContent: "const y = 2" },
        ] as FileMatch[],
        error: null,
      },
    ];
    const msg: Message = makeUserMsg({
      id: "msg-9",
      role: "tool",
      content: "",
      thinking: null,
      toolResults: toolResults,
    });
    const { container } = render(() => <MessageBubble message={msg} />);
    const bubble = container.querySelector(".justify-start");
    expect(bubble).toBeTruthy();
    expect(bubble?.textContent).toContain("42");
    expect(bubble?.textContent).toContain("100");
    const codeElements = bubble?.querySelectorAll("code");
    const paths = Array.from(codeElements ?? []).map((c) => c.textContent);
    expect(paths).toContain("src/x.ts");
    expect(paths).toContain("src/y.ts");
  });

  it("tool role 仅有 content (无 tool_results) 渲染 JSON", () => {
    const msg: Message = makeUserMsg({
      id: "msg-10",
      role: "tool",
      content: '{"x":1}',
      thinking: null,
      toolResults: null,
    });
    const { container } = render(() => <MessageBubble message={msg} />);
    const bubble = container.querySelector(".justify-start");
    expect(bubble).toBeTruthy();
    const pre = bubble?.querySelector("pre");
    expect(pre).toBeTruthy();
    expect(pre?.textContent).toContain("x");
  });

  it("system 消息含 italic + bg-warning/10", () => {
    const msg: Message = makeUserMsg({
      id: "msg-11",
      role: "system",
      content: "System prompt here.",
      thinking: null,
    });
    const { container } = render(() => <MessageBubble message={msg} />);
    const bubble = container.querySelector(".justify-start");
    expect(bubble).toBeTruthy();
    const italicDiv = bubble?.querySelector(".italic");
    expect(italicDiv).toBeTruthy();
    expect(bubble?.innerHTML).toContain("warning");
  });
});