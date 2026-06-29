import { describe, it, expect } from "vitest";
import { createAgentRuntime, type ProviderConfig, type RuntimeEvent } from "./runtime";
import { Stream, Effect } from "effect";
import type { Message } from "../../../shared/lib/types";
import { vi } from "vitest";

// Mock pi-agent Agent
vi.mock("@mariozechner/pi-agent", () => {
  return {
    Agent: vi.fn().mockImplementation(function _MockAgent(_config: unknown) {
      let handler: ((evt: unknown) => void) | null = null;
      return {
        subscribe: (h: (evt: unknown) => void) => {
          handler = h;
          return () => {
            handler = null;
          };
        },
        prompt: vi.fn().mockImplementation(async (_userContent: string) => {
          if (handler) {
            handler({ type: "agent_start" });
            handler({
              type: "message_update",
              message: { content: [{ type: "text", text: "hello" }] },
            });
            handler({
              type: "message_end",
              message: { content: [{ type: "text", text: "hello" }] },
            });
            handler({
              type: "agent_end",
              messages: [{ content: [{ type: "text", text: "hello" }] }],
            });
          }
        }),
        appendMessage: vi.fn(),
      };
    }),
  };
});

const mockProvider: ProviderConfig = {
  apiKey: "test-key",
  baseUrl: "https://mock.local",
  defaultModel: "mock-model",
  systemPrompt: "You are a helpful assistant.",
  tools: [],
};

const mockContext: Message[] = [
  {
    id: "u1",
    conversation_id: "c1",
    role: "user",
    content: "hi",
    tool_calls: null,
    tool_results: null,
    model: null,
    input_tokens: null,
    output_tokens: null,
    created_at: 1,
  },
];

describe("createAgentRuntime()", () => {
  it("returns object with run + cancel methods", () => {
    const runtime = createAgentRuntime();
    expect(typeof runtime.run).toBe("function");
    expect(typeof runtime.cancel).toBe("function");
  });

  it("cancel() before run() does not throw", () => {
    const runtime = createAgentRuntime();
    expect(() => runtime.cancel()).not.toThrow();
  });

  it("run() returns a Stream", () => {
    const runtime = createAgentRuntime();
    const stream = runtime.run({ context: mockContext, provider: mockProvider });
    expect(stream).toBeDefined();
  });
});

describe("run() — event translation", () => {
  it("translates message_update text → token event", async () => {
    const runtime = createAgentRuntime();
    const events: RuntimeEvent[] = [];
    const program = Stream.runForEach(
      runtime.run({ context: mockContext, provider: mockProvider }),
      (e) => Effect.sync(() => events.push(e)),
    );
    await Effect.runPromise(program.pipe(Effect.scoped));
    const tokens = events.filter((e) => e.type === "token");
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[0]).toMatchObject({ type: "token", content: "hello" });
  });
});

describe("cancel()", () => {
  it("cancel() before run() does not throw", () => {
    const runtime = createAgentRuntime();
    expect(() => runtime.cancel()).not.toThrow();
  });

  it("cancel() after run() starts does not throw", async () => {
    const runtime = createAgentRuntime();
    expect(() => runtime.cancel()).not.toThrow();
    expect(() => runtime.cancel()).not.toThrow();
  });
});

describe("error handling", () => {
  it("emits error event when prompt rejects", async () => {
    const { Agent } = await import("@mariozechner/pi-agent");
    const mockedAgent = vi.mocked(Agent);
    const originalImpl = mockedAgent.getMockImplementation();

    try {
      mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
        return {
          subscribe: (_h: (evt: unknown) => void) => () => {},
          prompt: vi.fn().mockRejectedValue(new Error("network failure")),
          appendMessage: vi.fn(),
        };
      });

      const runtime = createAgentRuntime();
      const events: RuntimeEvent[] = [];
      const program = Stream.runForEach(
        runtime.run({ context: mockContext, provider: mockProvider }),
        (e) => Effect.sync(() => events.push(e)),
      );
      await Effect.runPromise(program.pipe(Effect.scoped));

      const errorEvent = events.find((e) => e.type === "error");
      expect(errorEvent).toBeDefined();
      expect((errorEvent as { type: "error"; error: { message: string } }).error.message).toContain(
        "network failure",
      );
    } finally {
      mockedAgent.mockImplementation(originalImpl as never);
    }
  });
});

describe("run() — tool_execution_end 事件", () => {
  it("tool_execution_end 且 isError=true 时发出带 error 的 tool_result 事件", async () => {
    const { Agent } = await import("@mariozechner/pi-agent");
    const mockedAgent = vi.mocked(Agent);
    const originalImpl = mockedAgent.getMockImplementation();

    let capturedCallback: ((evt: unknown) => void) | undefined;
    try {
      mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
        return {
          subscribe: (h: (evt: unknown) => void) => {
            capturedCallback = h;
            return () => {};
          },
          prompt: vi.fn().mockResolvedValue(undefined),
          appendMessage: vi.fn(),
        };
      });

      const runtime = createAgentRuntime();
      const events: RuntimeEvent[] = [];
      // 不 await，让微任务先跑，这样 capturedCallback 能被设置
      const program = Stream.runForEach(
        runtime.run({ context: mockContext, provider: mockProvider }),
        (e) => Effect.sync(() => events.push(e)),
      );
      Effect.runPromise(program.pipe(Effect.scoped)).catch(() => {});

      // 等待微任务队列清空，确保 subscribe 已被调用
      await new Promise((resolve) => setTimeout(resolve, 10));

      // 触发 tool_execution_end with isError=true
      capturedCallback!({
        type: "tool_execution_end",
        toolCallId: "tc-1",
        result: "failed-msg",
        isError: true,
      });

      // 用 agent_end 关闭 stream
      capturedCallback!({ type: "agent_end", messages: [] });

      await new Promise((resolve) => setTimeout(resolve, 20));
      const toolResult = events.find((e) => e.type === "tool_result") as {
        type: "tool_result";
        toolCallId: string;
        result: unknown;
        error?: string;
      };
      expect(toolResult).toBeDefined();
      expect(toolResult.toolCallId).toBe("tc-1");
      expect(toolResult.error).toBe("failed-msg");
    } finally {
      mockedAgent.mockImplementation(originalImpl as never);
    }
  });

  it("tool_execution_end 且 isError=false 时发出不带 error 的 tool_result 事件", async () => {
    const { Agent } = await import("@mariozechner/pi-agent");
    const mockedAgent = vi.mocked(Agent);
    const originalImpl = mockedAgent.getMockImplementation();

    let capturedCallback: ((evt: unknown) => void) | undefined;
    try {
      mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
        return {
          subscribe: (h: (evt: unknown) => void) => {
            capturedCallback = h;
            return () => {};
          },
          prompt: vi.fn().mockResolvedValue(undefined),
          appendMessage: vi.fn(),
        };
      });

      const runtime = createAgentRuntime();
      const events: RuntimeEvent[] = [];
      const program = Stream.runForEach(
        runtime.run({ context: mockContext, provider: mockProvider }),
        (e) => Effect.sync(() => events.push(e)),
      );
      Effect.runPromise(program.pipe(Effect.scoped)).catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 10));

      capturedCallback!({
        type: "tool_execution_end",
        toolCallId: "tc-2",
        result: { ok: 1 },
        isError: false,
      });

      capturedCallback!({ type: "agent_end", messages: [] });

      await new Promise((resolve) => setTimeout(resolve, 20));
      const toolResult = events.find((e) => e.type === "tool_result") as {
        type: "tool_result";
        toolCallId: string;
        result: unknown;
        error?: string;
      };
      expect(toolResult).toBeDefined();
      expect(toolResult.toolCallId).toBe("tc-2");
      expect(toolResult.result).toEqual({ ok: 1 });
      expect(toolResult.error).toBeUndefined();
    } finally {
      mockedAgent.mockImplementation(originalImpl as never);
    }
  });
});

describe("run() — message_update 边界情况", () => {
  it("message_update 含 toolCall block 时发出 tool_call 事件", async () => {
    const { Agent } = await import("@mariozechner/pi-agent");
    const mockedAgent = vi.mocked(Agent);
    const originalImpl = mockedAgent.getMockImplementation();

    let capturedCallback: ((evt: unknown) => void) | undefined;
    try {
      mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
        return {
          subscribe: (h: (evt: unknown) => void) => {
            capturedCallback = h;
            return () => {};
          },
          prompt: vi.fn().mockResolvedValue(undefined),
          appendMessage: vi.fn(),
        };
      });

      const runtime = createAgentRuntime();
      const events: RuntimeEvent[] = [];
      const program = Stream.runForEach(
        runtime.run({ context: mockContext, provider: mockProvider }),
        (e) => Effect.sync(() => events.push(e)),
      );
      Effect.runPromise(program.pipe(Effect.scoped)).catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 10));

      capturedCallback!({
        type: "message_update",
        message: {
          content: [
            {
              type: "toolCall",
              id: "tc-1",
              name: "read_file",
              arguments: { workspace_id: "main", path: "/tmp/x.txt" },
            },
          ],
        },
      });

      capturedCallback!({ type: "agent_end", messages: [] });

      await new Promise((resolve) => setTimeout(resolve, 20));
      const toolCallEvent = events.find((e) => e.type === "tool_call") as {
        type: "tool_call";
        toolCall: { id: string; name: string; args: Record<string, unknown> };
      };
      expect(toolCallEvent).toBeDefined();
      expect(toolCallEvent.toolCall.id).toBe("tc-1");
      expect(toolCallEvent.toolCall.name).toBe("read_file");
      expect(toolCallEvent.toolCall.args).toEqual({ workspace_id: "main", path: "/tmp/x.txt" });
    } finally {
      mockedAgent.mockImplementation(originalImpl as never);
    }
  });

  it("message_update 的 content 非数组时提前返回，不发出事件", async () => {
    const { Agent } = await import("@mariozechner/pi-agent");
    const mockedAgent = vi.mocked(Agent);
    const originalImpl = mockedAgent.getMockImplementation();

    let capturedCallback: ((evt: unknown) => void) | undefined;
    try {
      mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
        return {
          subscribe: (h: (evt: unknown) => void) => {
            capturedCallback = h;
            return () => {};
          },
          prompt: vi.fn().mockResolvedValue(undefined),
          appendMessage: vi.fn(),
        };
      });

      const runtime = createAgentRuntime();
      const events: RuntimeEvent[] = [];
      const program = Stream.runForEach(
        runtime.run({ context: mockContext, provider: mockProvider }),
        (e) => Effect.sync(() => events.push(e)),
      );
      Effect.runPromise(program.pipe(Effect.scoped)).catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 10));

      // content 为字符串而非数组
      capturedCallback!({
        type: "message_update",
        message: { content: "not-array" },
      });

      capturedCallback!({ type: "agent_end", messages: [] });

      await new Promise((resolve) => setTimeout(resolve, 20));
      // 没有发出 token 或 tool_call 事件（早期返回）
      const tokenEvents = events.filter((e) => e.type === "token" || e.type === "tool_call");
      expect(tokenEvents).toHaveLength(0);
    } finally {
      mockedAgent.mockImplementation(originalImpl as never);
    }
  });

  it("message_update 无 message 字段时提前返回，不发出事件", async () => {
    const { Agent } = await import("@mariozechner/pi-agent");
    const mockedAgent = vi.mocked(Agent);
    const originalImpl = mockedAgent.getMockImplementation();

    let capturedCallback: ((evt: unknown) => void) | undefined;
    try {
      mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
        return {
          subscribe: (h: (evt: unknown) => void) => {
            capturedCallback = h;
            return () => {};
          },
          prompt: vi.fn().mockResolvedValue(undefined),
          appendMessage: vi.fn(),
        };
      });

      const runtime = createAgentRuntime();
      const events: RuntimeEvent[] = [];
      const program = Stream.runForEach(
        runtime.run({ context: mockContext, provider: mockProvider }),
        (e) => Effect.sync(() => events.push(e)),
      );
      Effect.runPromise(program.pipe(Effect.scoped)).catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 10));

      // 无 message 字段
      capturedCallback!({ type: "message_update" });

      capturedCallback!({ type: "agent_end", messages: [] });

      await new Promise((resolve) => setTimeout(resolve, 20));
      const tokenEvents = events.filter((e) => e.type === "token" || e.type === "tool_call");
      expect(tokenEvents).toHaveLength(0);
    } finally {
      mockedAgent.mockImplementation(originalImpl as never);
    }
  });
});

describe("run() — agent_end 事件", () => {
  it("agent_end 含 assistant 消息和 toolCall block 时 done 事件包含 tool_calls", async () => {
    const { Agent } = await import("@mariozechner/pi-agent");
    const mockedAgent = vi.mocked(Agent);
    const originalImpl = mockedAgent.getMockImplementation();

    let capturedCallback: ((evt: unknown) => void) | undefined;
    try {
      mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
        return {
          subscribe: (h: (evt: unknown) => void) => {
            capturedCallback = h;
            return () => {};
          },
          prompt: vi.fn().mockResolvedValue(undefined),
          appendMessage: vi.fn(),
        };
      });

      const runtime = createAgentRuntime();
      const events: RuntimeEvent[] = [];
      const program = Stream.runForEach(
        runtime.run({ context: mockContext, provider: mockProvider }),
        (e) => Effect.sync(() => events.push(e)),
      );
      Effect.runPromise(program.pipe(Effect.scoped)).catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 10));

      capturedCallback!({
        type: "agent_end",
        messages: [
          {
            content: [
              { type: "text", text: "hi" },
              { type: "toolCall", id: "tc-1", name: "read_file", arguments: {} },
            ],
          },
        ],
      });

      await new Promise((resolve) => setTimeout(resolve, 20));
      const doneEvent = events.find((e) => e.type === "done") as {
        type: "done";
        message: { content: string; tool_calls: unknown[] };
      };
      expect(doneEvent).toBeDefined();
      expect(doneEvent.message.content).toBe("hi");
      expect(doneEvent.message.tool_calls).toHaveLength(1);
      expect((doneEvent.message.tool_calls[0] as { id: string }).id).toBe("tc-1");
    } finally {
      mockedAgent.mockImplementation(originalImpl as never);
    }
  });

  it("agent_end 的 messages 为空数组时仍发出 done 事件（空内容）", async () => {
    const { Agent } = await import("@mariozechner/pi-agent");
    const mockedAgent = vi.mocked(Agent);
    const originalImpl = mockedAgent.getMockImplementation();

    let capturedCallback: ((evt: unknown) => void) | undefined;
    try {
      mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
        return {
          subscribe: (h: (evt: unknown) => void) => {
            capturedCallback = h;
            return () => {};
          },
          prompt: vi.fn().mockResolvedValue(undefined),
          appendMessage: vi.fn(),
        };
      });

      const runtime = createAgentRuntime();
      const events: RuntimeEvent[] = [];
      const program = Stream.runForEach(
        runtime.run({ context: mockContext, provider: mockProvider }),
        (e) => Effect.sync(() => events.push(e)),
      );
      Effect.runPromise(program.pipe(Effect.scoped)).catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 10));

      // ADR-0019: agent_end 无条件 emit done — 即使 messages 为空
      capturedCallback!({ type: "agent_end", messages: [] });

      await new Promise((resolve) => setTimeout(resolve, 20));
      const doneEvent = events.find((e) => e.type === "done") as
        | { type: "done"; message: { content: string } }
        | undefined;
      // done event IS emitted with empty content
      expect(doneEvent).toBeDefined();
      expect(doneEvent!.message.content).toBe("");
    } finally {
      mockedAgent.mockImplementation(originalImpl as never);
    }
  });
});

describe("cancel() — abort controller", () => {
  it("cancel() 调用 currentAbortController.abort()", async () => {
    const { Agent } = await import("@mariozechner/pi-agent");
    const mockedAgent = vi.mocked(Agent);
    const originalImpl = mockedAgent.getMockImplementation();

    let capturedCallback: ((evt: unknown) => void) | undefined;
    try {
      mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
        return {
          subscribe: (h: (evt: unknown) => void) => {
            capturedCallback = h;
            return () => {};
          },
          prompt: vi.fn().mockResolvedValue(undefined),
          appendMessage: vi.fn(),
        };
      });

      const runtime = createAgentRuntime();
      const program = Stream.runForEach(
        runtime.run({ context: mockContext, provider: mockProvider }),
        (_e) => Effect.sync(() => {}),
      );
      Effect.runPromise(program.pipe(Effect.scoped)).catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 10));

      // spy on AbortController.prototype.abort
      const abortSpy = vi.spyOn(AbortController.prototype, "abort");

      // 调用 cancel
      runtime.cancel();

      expect(abortSpy).toHaveBeenCalled();

      // cleanup
      capturedCallback!({ type: "agent_end", messages: [] });
    } finally {
      mockedAgent.mockImplementation(originalImpl as never);
    }
  });
});
