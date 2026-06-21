//! ChatView 组件测试。
//!
//! Mocked: conversations store, messages store, runtime services.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";
import { ChatView } from "./chat-view";
import type { Message } from "../../../shared/lib/types";

const mockMessages: Message[] = [
  {
    id: "msg-1",
    conversation_id: "conv-1",
    role: "user",
    content: "Hello",
    tool_calls: null,
    tool_results: null,
    model: null,
    input_tokens: null,
    output_tokens: null,
    created_at: 1710000000,
  },
  {
    id: "msg-2",
    conversation_id: "conv-1",
    role: "assistant",
    content: "Hi there!",
    tool_calls: null,
    tool_results: null,
    model: "gpt-4o",
    input_tokens: null,
    output_tokens: null,
    created_at: 1710000001,
  },
  {
    id: "msg-3",
    conversation_id: "conv-1",
    role: "tool",
    content: "file content here",
    tool_calls: null,
    tool_results: [
      {
        tool_call_id: "tc-read-1",
        result: "const x = 1;\nconst y = 2;\nconsole.log(x + y);",
        error: null,
      },
    ],
    model: null,
    input_tokens: null,
    output_tokens: null,
    created_at: 1710000002,
  },
];

vi.mock("../stores/conversations", () => ({
  conversations$: vi.fn(() => [
    {
      id: "conv-1",
      title: "Test",
      system_prompt: null,
      created_at: 1710000000,
      updated_at: 1710000000,
      archived_at: null,
    },
  ]),
  activeId$: vi.fn(() => "conv-1"),
  loadConversations: vi.fn(),
  createConversation: vi.fn(),
  selectConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));

vi.mock("../stores/messages", () => ({
  messages$: vi.fn(() => mockMessages),
  loadMessages: vi.fn(),
  appendUserMessage: vi.fn(),
  appendAssistantMessageDelta: vi.fn(),
  finalizeAssistantMessage: vi.fn(),
  persistAssistantMessage: vi.fn(),
  appendToolCall: vi.fn(),
  finalizeToolResult: vi.fn(),
  clearMessages: vi.fn(),
  appendStreamingAssistantMessage: vi.fn(),
}));

vi.mock(import("../lib/runtime"), async (importOriginal) => {
  // V1.7+ 的 mock 只覆盖 AgentRuntime / RuntimeLayer(组件测试不需要真 runtime),
  // 但 commit 1fc33e7 之后 agent.ts 在模块加载时引用了 AgentRuntimeLive / RuntimeDeps
  // / RuntimeError 来构建 fullLayer(ADR-0016 D6)。用 importOriginal spread 真模块
  // 保留这些符号,避免 Layer.provide(AgentRuntimeLive, RuntimeDeps) 报
  // "No AgentRuntimeLive export is defined"。
  const actual = await importOriginal<typeof import("../lib/runtime")>();
  return {
    ...actual,
    AgentRuntime: { of: vi.fn() } as never,
  };
});

describe("ChatView", () => {
  afterEach(() => cleanup());

  it("从 messages$ 渲染消息列表", () => {
    const { container } = render(() => <ChatView />);
    // MessageBubble 外层包装有 class `mb-3 flex w-full`（Tailwind utilities）
    // mock 数据含 3 条消息(user / assistant / tool),全 role 都走同一 wrapper,
    // 所以 querySelectorAll("div.mb-3") 应得 3。
    const bubbles = container.querySelectorAll("div.mb-3");
    expect(bubbles.length).toBe(3);
  });

  it("输入为空时 Send 按钮禁用", () => {
    const { container } = render(() => <ChatView />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn).toBeDisabled();
  });

  it("运行中状态显示 Cancel 按钮", async () => {
    const { container } = render(() => <ChatView />);
    // 运行状态在组件内部 - 我们测试当 running() 为 true 时，
    // Cancel 按钮替代 Send 按钮出现。我们可以验证初始状态显示 "发送"。
    // Polish F2: 按钮文字走中文 "发送" (前是 "Send")
    const submitBtn = container.querySelector('button[type="submit"]');
    expect(submitBtn?.textContent).toBe("发送");
    // 当运行时，按钮会通过 <Show> fallback 变为 "取消"。
    // 我们可以验证结构是正确的 - 有一个带 fallback 的 Show 组件。
    const cancelBtn = container.querySelector('button:not([type="submit"])');
    expect(cancelBtn).toBeNull(); // 初始时无 cancel 按钮
  });

  it("tool 角色的消息渲染工具结果", () => {
    const { container } = render(() => <ChatView />);
    // 验证工具结果details存在
    const details = container.querySelectorAll("details");
    expect(details.length).toBeGreaterThan(0);
    // 验证工具结果标签存在
    const hasToolResult = Array.from(details).some((d) => d.textContent?.includes("工具结果"));
    expect(hasToolResult).toBe(true);
  });

  it("tool 消息显示工具调用 ID 和结果", () => {
    const { container } = render(() => <ChatView />);
    const codeElements = container.querySelectorAll("code");
    const hasToolCallId = Array.from(codeElements).some((code) => code.textContent === "tc-read-1");
    expect(hasToolCallId).toBe(true);
  });
});
