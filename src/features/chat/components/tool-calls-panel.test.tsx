//! ToolCallsPanel 组件测试。
//!
//! Panel 现在挂在 assistant bubble 下方，filter 到单条 message。
//! 覆盖 6 个状态：0 调用不渲染、summary 计数、展开/折叠、
//! 错误计数、per-message 隔离、错误 entry 样式。
//! 用 chat.store 的真实 setupConvState 注入 messages。

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent } from "@solidjs/testing-library";
import { ToolCallsPanel } from "./tool-calls-panel";
import { setupConvState } from "../stores/chat.store";
import type { Conversation, Message } from "../../../shared/lib/types";

// ─── IPC mock (chat.store 依赖) ─────────────────────────────────────

vi.mock("../../../shared/lib/ipc", async () => {
  const { Layer, Effect: E } = await import("effect");
  const actual = await vi.importActual<typeof import("../../../shared/lib/ipc")>(
    "../../../shared/lib/ipc",
  );
  return {
    MessageService: actual.MessageService,
    ConversationService: actual.ConversationService,
    MessageServiceLive: Layer.succeed(actual.MessageService, {
      list: () => E.succeed([] as Message[]),
      append: () => E.succeed({} as Message),
      search: () => E.succeed([] as Message[]),
    }),
    ConversationServiceLive: Layer.succeed(actual.ConversationService, {
      list: () => E.succeed([] as Conversation[]),
      get: () => E.succeed({} as Conversation),
      create: () => E.succeed({} as Conversation),
      archive: () => E.void,
      delete: () => E.void,
    }),
  };
});

vi.mock("../lib/workspace-service", async () => {
  const { Layer, Effect: E } = await import("effect");
  const actual = await vi.importActual<typeof import("../lib/workspace-service")>(
    "../lib/workspace-service",
  );
  return {
    WorkspaceService: actual.WorkspaceService,
    WorkspaceServiceLive: Layer.succeed(actual.WorkspaceService, {
      list: () => E.succeed([]),
      add: () => E.succeed({} as never),
      rename: () => E.void,
      remove: () => E.void,
      pickPath: () => E.succeed(null),
    }),
  };
});

vi.mock("../lib/runtime", () => ({
  createAgentRuntime: () => ({
    run: () => ({ [Symbol.iterator]: () => ({ next: () => ({ done: true }) }) }),
    cancel: () => {},
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────

function makeConv(id: string, messages: Message[]): void {
  const conv: Conversation = {
    id,
    title: "test",
    system_prompt: null,
    workspace_id: "",
    created_at: 1,
    updated_at: 1,
    archived_at: null,
  };
  setupConvState(conv, messages);
}

const assistantWithCall = (
  msgId: string,
  createdAt: number,
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>,
  toolResults?: Array<{ tool_call_id: string; result: unknown; error: string | null }>,
): Message => ({
  id: msgId,
  conversation_id: "c1",
  role: "assistant",
  content: "",
  tool_calls: toolCalls,
  tool_results: toolResults ?? null,
  model: null,
  input_tokens: null,
  output_tokens: null,
  created_at: createdAt,
});

// ─── Tests ──────────────────────────────────────────────────────────

describe("ToolCallsPanel (per-message filter)", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("message 无 tool_calls → 不渲染面板", () => {
    makeConv("c1", [
      {
        id: "msg-text-only",
        conversation_id: "c1",
        role: "assistant",
        content: "just text",
        tool_calls: null,
        tool_results: null,
        model: null,
        input_tokens: null,
        output_tokens: null,
        created_at: 1,
      },
    ]);
    const { container } = render(() => <ToolCallsPanel convId="c1" messageId="msg-text-only" />);
    expect(container.querySelector("[data-testid='tool-calls-panel']")).toBeNull();
  });

  it("messageId 不存在 → 不渲染面板 (no crash)", () => {
    makeConv("c1", [
      assistantWithCall("msg-1", 1, [{ id: "tc-1", name: "read_file", args: {} }]),
    ]);
    const { container } = render(() => <ToolCallsPanel convId="c1" messageId="nonexistent" />);
    expect(container.querySelector("[data-testid='tool-calls-panel']")).toBeNull();
  });

  it("1 个 tool call → summary '工具调用 1'", () => {
    makeConv("c1", [
      assistantWithCall(
        "msg-1",
        1_700_000_000_000,
        [{ id: "tc-1", name: "read_file", args: { path: "/tmp/x.txt" } }],
        [{ tool_call_id: "tc-1", result: "file content", error: null }],
      ),
    ]);
    const { container } = render(() => <ToolCallsPanel convId="c1" messageId="msg-1" />);
    const summary = container.querySelector("[data-testid='tool-calls-panel-summary']");
    expect(summary?.textContent).toContain("工具调用 1");
    const success = container.querySelector("[data-testid='tool-calls-panel-success']");
    expect(success?.textContent).toContain("成功 1");
    expect(container.querySelector("[data-testid='tool-calls-panel-error']")).toBeNull();
  });

  it("1 success + 1 error 在同一 message → summary 计数正确", () => {
    makeConv("c1", [
      assistantWithCall(
        "msg-1",
        1_700_000_000_000,
        [
          { id: "tc-1", name: "read_file", args: { path: "/a" } },
          { id: "tc-2", name: "read_file", args: { path: "/missing" } },
        ],
        [
          { tool_call_id: "tc-1", result: "ok", error: null },
          { tool_call_id: "tc-2", result: null, error: "File not found" },
        ],
      ),
    ]);
    const { container } = render(() => <ToolCallsPanel convId="c1" messageId="msg-1" />);
    const summary = container.querySelector("[data-testid='tool-calls-panel-summary']");
    expect(summary?.textContent).toContain("工具调用 2");
    expect(container.querySelector("[data-testid='tool-calls-panel-success']")?.textContent).toContain("成功 1");
    expect(container.querySelector("[data-testid='tool-calls-panel-error']")?.textContent).toContain("错误 1");
  });

  it("per-message 隔离: 渲染 msg-1 panel 只看 msg-1 的 calls (忽略 msg-2)", () => {
    makeConv("c1", [
      assistantWithCall(
        "msg-1",
        1_700_000_000_000,
        [{ id: "tc-1", name: "read_file", args: { path: "/a" } }],
        [{ tool_call_id: "tc-1", result: "ok", error: null }],
      ),
      assistantWithCall(
        "msg-2",
        1_700_000_001_000,
        [
          { id: "tc-2", name: "read_file", args: { path: "/b" } },
          { id: "tc-3", name: "read_file", args: { path: "/c" } },
        ],
        [
          { tool_call_id: "tc-2", result: "ok", error: null },
          { tool_call_id: "tc-3", result: "ok", error: null },
        ],
      ),
    ]);
    // 只渲染 msg-1 的 panel
    const { container } = render(() => <ToolCallsPanel convId="c1" messageId="msg-1" />);
    const summary = container.querySelector("[data-testid='tool-calls-panel-summary']");
    expect(summary?.textContent).toContain("工具调用 1"); // 不是 3
  });

  it("默认折叠 → list 不可见", () => {
    makeConv("c1", [
      assistantWithCall(
        "msg-1",
        1_700_000_000_000,
        [{ id: "tc-1", name: "read_file", args: { path: "/a" } }],
        [{ tool_call_id: "tc-1", result: "ok", error: null }],
      ),
    ]);
    const { container } = render(() => <ToolCallsPanel convId="c1" messageId="msg-1" />);
    expect(container.querySelector("[data-testid='tool-calls-panel-list']")).toBeNull();
    expect(
      container.querySelector("[data-testid='tool-calls-panel-toggle']")?.getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("点击 toggle → 展开 list 显示所有 entry", () => {
    makeConv("c1", [
      assistantWithCall(
        "msg-1",
        1_700_000_000_000,
        [
          { id: "tc-1", name: "read_file", args: { path: "/a" } },
          { id: "tc-2", name: "write_file", args: { path: "/b", content: "x" } },
        ],
        [
          { tool_call_id: "tc-1", result: "ok", error: null },
          { tool_call_id: "tc-2", result: "ok", error: null },
        ],
      ),
    ]);
    const { container } = render(() => <ToolCallsPanel convId="c1" messageId="msg-1" />);
    const toggle = container.querySelector(
      "[data-testid='tool-calls-panel-toggle']",
    ) as HTMLButtonElement;
    fireEvent.click(toggle);
    expect(container.querySelector("[data-testid='tool-calls-panel-list']")).toBeTruthy();
    expect(container.querySelectorAll("[data-testid='tool-calls-panel-entry']").length).toBe(2);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("running 状态 (有 call 无 result) → 不计入 success/error", () => {
    makeConv("c1", [
      assistantWithCall(
        "msg-1",
        1_700_000_000_000,
        [{ id: "tc-1", name: "read_file", args: { path: "/a" } }],
        // 没有 tool_results → running
      ),
    ]);
    const { container } = render(() => <ToolCallsPanel convId="c1" messageId="msg-1" />);
    const summary = container.querySelector("[data-testid='tool-calls-panel-summary']");
    expect(summary?.textContent).toContain("工具调用 1");
    expect(container.querySelector("[data-testid='tool-calls-panel-success']")).toBeNull();
    expect(container.querySelector("[data-testid='tool-calls-panel-error']")).toBeNull();
  });

  it("错误调用的 entry 渲染红色 error 边框 + 错误文案", () => {
    makeConv("c1", [
      assistantWithCall(
        "msg-1",
        1_700_000_000_000,
        [{ id: "tc-err", name: "read_file", args: { path: "/missing" } }],
        [{ tool_call_id: "tc-err", result: null, error: "Not found" }],
      ),
    ]);
    const { container } = render(() => <ToolCallsPanel convId="c1" messageId="msg-1" />);
    const toggle = container.querySelector(
      "[data-testid='tool-calls-panel-toggle']",
    ) as HTMLButtonElement;
    fireEvent.click(toggle);
    const errorCard = container.querySelector("[class*='border-destructive']");
    expect(errorCard).toBeTruthy();
    expect(errorCard?.textContent).toContain("Not found");
  });
});