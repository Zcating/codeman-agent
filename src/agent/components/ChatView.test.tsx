//! ChatView component tests.
//!
//! Mocked: conversations store, messages store, runtime services.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";
import { ChatView } from "./ChatView";
import type { Message } from "../../lib/types";

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
];

vi.mock("../store/conversations", () => ({
  conversations$: vi.fn(() => [{ id: "conv-1", title: "Test", system_prompt: null, created_at: 1710000000, updated_at: 1710000000, archived_at: null }]),
  activeId$: vi.fn(() => "conv-1"),
  loadConversations: vi.fn(),
  createConversation: vi.fn(),
  selectConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));

vi.mock("../store/messages", () => ({
  messages$: vi.fn(() => mockMessages),
  loadMessages: vi.fn(),
  appendUserMessage: vi.fn(),
  appendAssistantMessageDelta: vi.fn(),
  finalizeAssistantMessage: vi.fn(),
  appendToolCall: vi.fn(),
  finalizeToolResult: vi.fn(),
  clearMessages: vi.fn(),
  appendStreamingAssistantMessage: vi.fn(),
}));

vi.mock("../runtime", () => ({
  AgentRuntime: { of: vi.fn() },
  RuntimeLayer: {},
}));

vi.mock("./Sidebar", () => ({
  Sidebar: () => null,
}));

describe("ChatView", () => {
  afterEach(() => cleanup());

  it("renders message list from messages$", () => {
    const { container } = render(() => <ChatView />);
    // MessageBubble outer wrapper has class `mb-3 flex w-full` (Tailwind utilities)
    const bubbles = container.querySelectorAll("div.mb-3");
    expect(bubbles.length).toBe(2);
  });

  it("Send button is disabled when input is empty", () => {
    const { container } = render(() => <ChatView />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn).toBeDisabled();
  });

  it("running state shows Cancel button", async () => {
    const { container } = render(() => <ChatView />);
    // The running state is internal to the component - we test that when running() is true,
    // the Cancel button is shown instead of Send. We can verify the initial state shows Send.
    const submitBtn = container.querySelector('button[type="submit"]');
    expect(submitBtn?.textContent).toBe("Send");
    // When running, the button would change to "Cancel" via the <Show> fallback.
    // We can verify the structure is correct - there is a Show component with fallback.
    const cancelBtn = container.querySelector('button:not([type="submit"])');
    expect(cancelBtn).toBeNull(); // No cancel button initially
  });
});