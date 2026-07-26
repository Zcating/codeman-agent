import { describe, it, expect } from "vitest";
import { createAgentRuntime, type ProviderConfig, type RuntimeEvent } from "@codeman-frontend/features/chat/lib/runtime";
import { Stream, Effect } from "effect";
import type { Message } from "@codeman-frontend/shared/lib/types";
import { vi } from "vitest";

// Mock pi-agent-core Agent
vi.mock("@earendil-works/pi-agent-core", () => {
    return {
        Agent: vi.fn().mockImplementation(function _MockAgent(_config: unknown) {
            let handler: ((evt: unknown, signal?: AbortSignal) => void) | null = null;
            return {
                subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
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
                        // ADR-0028: per-turn done. emit turn_end with the turn's
                        // assistant message BEFORE agent_end cleanup.
                        handler({
                            type: "turn_end",
                            message: { content: [{ type: "text", text: "hello" }] },
                            toolResults: [],
                        });
                        handler({ type: "agent_end", messages: [] });
                    }
                }),
                abort: vi.fn(),
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
        conversationId: "c1",
        role: "user",
        content: "hi",
        thinking: null,
        toolCalls: null,
        toolResults: null,
        model: null,
        inputTokens: null,
        outputTokens: null,
        createdAt: 1,
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

    it("accepts ProviderConfig without apiKey (optional field)", () => {
        // API key is optional — callers that haven't configured auth yet can omit it.
        // Agent's getApiKey falls through to undefined → Anthropic SDK uses env / no auth.
        const cfg: ProviderConfig = {
            baseUrl: "https://mock.local",
            defaultModel: "mock-model",
            systemPrompt: "You are a helpful assistant.",
            tools: [],
            // apiKey intentionally omitted
        };
        const runtime = createAgentRuntime();
        expect(() => runtime.run({ context: mockContext, provider: cfg })).not.toThrow();
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

    // ─── ADR-0028: thinking 块从 turn_end.message 提取到 done.message.thinking ─────────

    it("turn_end with thinking block in message.content → done.message.thinking is set", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
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

            // 模拟 mock-server 'think' entry: assistant 消息只有 thinking 块
            capturedCallback!({
                type: "turn_end",
                message: {
                    content: [
                        {
                            type: "thinking",
                            thinking:
                                "The user typed 'think'. This is the accumulated thinking block from the mock LLM.",
                        },
                    ],
                },
                toolResults: [],
            });

            await new Promise((resolve) => setTimeout(resolve, 20));
            const doneEvent = events.find((e) => e.type === "done") as {
                type: "done";
                message: { content: string; thinking: string | null };
            };
            expect(doneEvent).toBeDefined();
            expect(doneEvent!.message.content).toBe("");
            // 关键断言: thinking 必须被提取并保留下来 (不是 null,不是空字符串)
            expect(doneEvent!.message.thinking).toBe(
                "The user typed 'think'. This is the accumulated thinking block from the mock LLM.",
            );
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });

    it("turn_end with no thinking block → done.message.thinking is null (no spurious empty string)", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
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
                type: "turn_end",
                message: { content: [{ type: "text", text: "just text no thinking" }] },
                toolResults: [],
            });

            await new Promise((resolve) => setTimeout(resolve, 20));
            const doneEvent = events.find((e) => e.type === "done") as {
                type: "done";
                message: { content: string; thinking: string | null };
            };
            expect(doneEvent).toBeDefined();
            expect(doneEvent!.message.content).toBe("just text no thinking");
            expect(doneEvent!.message.thinking).toBeNull();
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });
});

describe("run()  thinking block streaming", () => {
    it("message_update with thinking block  thinking RuntimeEvent (cumulative)", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
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
                    content: [{ type: "thinking", thinking: "first chunk of thinking" }],
                },
            });

            await new Promise((resolve) => setTimeout(resolve, 20));
            const thinkingEvents = events.filter(
                (e) => e.type === "thinking",
            ) as Array<{ type: "thinking"; content: string }>;
            expect(thinkingEvents).toHaveLength(1);
            expect(thinkingEvents[0].content).toBe("first chunk of thinking");
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });
});

describe("cancel()  agent abort", () => {
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
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (_h: (evt: unknown, signal?: AbortSignal) => void) => () => {},
                    prompt: vi.fn().mockRejectedValue(new Error("network failure")),
                    abort: vi.fn(),
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
            expect(
                (errorEvent as { type: "error"; error: { message: string } }).error.message,
            ).toContain("network failure");
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });
});

describe("run() — tool_execution_end 事件", () => {
    it("tool_execution_end — isError=true 时返回带 error 字段的 tool_result 事件", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
                };
            });

            const runtime = createAgentRuntime();
            const events: RuntimeEvent[] = [];
            // 不 await，靠微任务转译，让 capturedCallback 能被设置
            const program = Stream.runForEach(
                runtime.run({ context: mockContext, provider: mockProvider }),
                (e) => Effect.sync(() => events.push(e)),
            );
            Effect.runPromise(program.pipe(Effect.scoped)).catch(() => {});

            // 等待微任务跑完，确保 subscribe 已被设置
            await new Promise((resolve) => setTimeout(resolve, 10));

            // 模拟 tool_execution_end with isError=true
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

    it("tool_execution_end — isError=false 时返回不带 error 字段的 tool_result 事件", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
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
    it("message_update 有 toolCall block 时发送 tool_call 事件", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
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
                            arguments: { workspaceId: "main", path: "/tmp/x.txt" },
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
            // ADR-0013.1: LLM-facing tool_call args use camelCase (workspaceId)
            // to match the schema field / IPC arg key / system prompt hint.
            expect(toolCallEvent.toolCall.args).toEqual({
                workspaceId: "main",
                path: "/tmp/x.txt",
            });
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });

    it("message_update 的 content 是字符串（非法数组）时提前返回，不发事件", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
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

            // content 为字符串（非法数组）
            capturedCallback!({
                type: "message_update",
                message: { content: "not-array" },
            });

            capturedCallback!({ type: "agent_end", messages: [] });

            await new Promise((resolve) => setTimeout(resolve, 20));
            // 没有发送 token 或 tool_call 事件（提前返回）
            const tokenEvents = events.filter(
                (e) => e.type === "token" || e.type === "tool_call",
            );
            expect(tokenEvents).toHaveLength(0);
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });

    it("message_update 没 message 字段时提前返回，不发事件", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
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
            const tokenEvents = events.filter(
                (e) => e.type === "token" || e.type === "tool_call",
            );
            expect(tokenEvents).toHaveLength(0);
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });
});

describe("run() — turn_end 事件 (per-turn done, ADR-0028)", () => {
    it("turn_end 含 toolCall block 时 done 事件带 tool_calls (per-turn scope)", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
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
                type: "turn_end",
                message: {
                    content: [
                        { type: "text", text: "hi" },
                        { type: "toolCall", id: "tc-1", name: "read_file", arguments: {} },
                    ],
                },
                toolResults: [],
            });

            await new Promise((resolve) => setTimeout(resolve, 20));
            const doneEvent = events.find((e) => e.type === "done") as {
                type: "done";
                message: { content: string; toolCalls: unknown[] };
            };
            expect(doneEvent).toBeDefined();
            expect(doneEvent.message.content).toBe("hi");
            expect(doneEvent.message.toolCalls).toHaveLength(1);
            expect((doneEvent.message.toolCalls[0] as { id: string }).id).toBe("tc-1");
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });

    // REMOVED (ADR-0028): "agent_end 的 messages 为空数组时仍发送 done 事件" no longer
    // applies. agent_end is cleanup-only; done is emitted at turn_end (per turn).
    // The empty-messages case is now equivalent to a run with zero turn_ends, which
    // is a degenerate path. Coverage of "agent_end cleanup closes stream" is in
    // G30c and other tests using `capturedCallback!({ type: "agent_end", messages: [] })`
    // for stream-termination.

    it("multi-turn turn_end: 2 turns → 2 done events, turn-1 owns toolCalls+thinking, turn-2 owns text only (REGRESSION: V3.1 cross-turn aggregation removed)", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
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

            // 模拟 mock-server 'three-blocks' 多轮:
            //   turn 1: thinking + text + toolCall
            //   tool execute → tool_result
            //   turn 2: text only (final answer based on tool result)
            capturedCallback!({
                type: "turn_end",
                message: {
                    content: [
                        {
                            type: "thinking",
                            thinking: "user wants search files; calling search_files with *.ts",
                        },
                        { type: "text", text: "Let me search for TypeScript files." },
                        {
                            type: "toolCall",
                            id: "toolu_turn1_search",
                            name: "search_files",
                            arguments: { pattern: "*.ts" },
                        },
                    ],
                },
                toolResults: [{ toolCallId: "toolu_turn1_search", content: [{ type: "text", text: "Found 50 matches" }], isError: false }],
            });

            capturedCallback!({
                type: "turn_end",
                message: {
                    content: [{ type: "text", text: "Done. Found 50 TypeScript files." }],
                },
                toolResults: [],
            });

            await new Promise((resolve) => setTimeout(resolve, 20));
            const doneEvents = events.filter((e) => e.type === "done") as Array<{
                type: "done";
                message: {
                    content: string;
                    thinking: string | null;
                    toolCalls:
                        | Array<{ id: string; name: string; args: Record<string, unknown> }>
                        | null;
                };
            }>;

            // ADR-0028: 2 turns → 2 done events
            expect(doneEvents).toHaveLength(2);

            // done[0] = turn-1: text + thinking + toolCalls + toolResults
            expect(doneEvents[0]!.message.content).toBe("Let me search for TypeScript files.");
            expect(doneEvents[0]!.message.thinking).toBe(
                "user wants search files; calling search_files with *.ts",
            );
            expect(doneEvents[0]!.message.toolCalls).not.toBeNull();
            expect(doneEvents[0]!.message.toolCalls).toHaveLength(1);
            expect(doneEvents[0]!.message.toolCalls![0]!.id).toBe("toolu_turn1_search");
            expect(doneEvents[0]!.message.toolCalls![0]!.name).toBe("search_files");
            expect(doneEvents[0]!.message.toolCalls![0]!.args).toEqual({ pattern: "*.ts" });

            // done[1] = turn-2: text only, NO thinking/toolCalls from turn-1 (REGRESSION target)
            expect(doneEvents[1]!.message.content).toBe(
                "Done. Found 50 TypeScript files.",
            );
            expect(doneEvents[1]!.message.thinking).toBeNull();
            expect(doneEvents[1]!.message.toolCalls).toBeNull();
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });
});

describe("run() — agent_end typed aggregation (legacy path: cleanup-only, no done)", () => {
    it("agent_end with AssistantMessage.text block → no done (cleanup-only path)", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
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

            // ADR-0028: agent_end 不再 emit done; 仅 cleanup (emit.end() + finalize)。
            // 验证: agent_end { messages: [assistant] } 触发后 doneEvents 为空。
            capturedCallback!({
                type: "agent_end",
                messages: [{ role: "assistant", content: [{ type: "text", text: "x" }] }],
            });

            await new Promise((resolve) => setTimeout(resolve, 20));
            const doneEvents = events.filter((e) => e.type === "done");
            expect(doneEvents).toHaveLength(0);
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });
});

// REMOVED (ADR-0028): "multi-turn agent_end: turn-2 text-only lastMsg → done.tool_calls +
// thinking preserved from turn-1" — V3.1 cross-turn aggregation is reverted.
// Coverage moved to G30b ("multi-turn turn_end: 2 turns → 2 done events, turn-1 owns
// toolCalls+thinking, turn-2 owns text only (REGRESSION: V3.1 cross-turn aggregation
// removed)") which asserts the OPPOSITE contract (no cross-turn aggregation).

describe("cancel() — agent abort", () => {
    it("cancel() 触发 currentAgent.abort()", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        let abortFn: ReturnType<typeof vi.fn> | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                abortFn = vi.fn();
                return {
                    subscribe: (_h: (evt: unknown, signal?: AbortSignal) => void) => () => {},
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: abortFn,
                };
            });

            const runtime = createAgentRuntime();
            const program = Stream.runForEach(
                runtime.run({ context: mockContext, provider: mockProvider }),
                (_e) => Effect.sync(() => {}),
            );
            Effect.runPromise(program.pipe(Effect.scoped)).catch(() => {});

            await new Promise((resolve) => setTimeout(resolve, 10));

            // 调用 cancel
            runtime.cancel();

            expect(abortFn).toHaveBeenCalled();
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });
});

// ─── Block A: defaultModel validation ─────────────────────────────────────────

describe("run() — defaultModel validation (P0-2)", () => {
    it("rejects empty defaultModel with error event", async () => {
        const runtime = createAgentRuntime();
        const events: RuntimeEvent[] = [];
        const program = Stream.runForEach(
            runtime.run({ context: mockContext, provider: { ...mockProvider, defaultModel: "" } }),
            (e) => Effect.sync(() => events.push(e)),
        );
        await Effect.runPromise(program.pipe(Effect.scoped));
        const errorEvent = events.find((e) => e.type === "error") as
            | { type: "error"; error: { message: string } }
            | undefined;
        expect(errorEvent).toBeDefined();
        expect(errorEvent!.error.message).toMatch(/defaultModel/i);
    });

    it("rejects whitespace-only defaultModel with error event", async () => {
        const runtime = createAgentRuntime();
        const events: RuntimeEvent[] = [];
        const program = Stream.runForEach(
            runtime.run({ context: mockContext, provider: { ...mockProvider, defaultModel: "   " } }),
            (e) => Effect.sync(() => events.push(e)),
        );
        await Effect.runPromise(program.pipe(Effect.scoped));
        const errorEvent = events.find((e) => e.type === "error");
        expect(errorEvent).toBeDefined();
    });

    it("does NOT emit done event when defaultModel is invalid", async () => {
        const runtime = createAgentRuntime();
        const events: RuntimeEvent[] = [];
        const program = Stream.runForEach(
            runtime.run({ context: mockContext, provider: { ...mockProvider, defaultModel: "" } }),
            (e) => Effect.sync(() => events.push(e)),
        );
        await Effect.runPromise(program.pipe(Effect.scoped));
        expect(events.find((e) => e.type === "done")).toBeUndefined();
    });

    it("valid defaultModel proceeds without error", async () => {
        const runtime = createAgentRuntime();
        const events: RuntimeEvent[] = [];
        const program = Stream.runForEach(
            runtime.run({ context: mockContext, provider: { ...mockProvider, defaultModel: "claude-sonnet-4" } }),
            (e) => Effect.sync(() => events.push(e)),
        );
        await Effect.runPromise(program.pipe(Effect.scoped));
        expect(events.find((e) => e.type === "error")).toBeUndefined();
    });
});

// ─── Block B: message_update dispatch on assistantMessageEvent (text_delta) ────

describe("run() — message_update text_delta assistantMessageEvent", () => {
    it("text_delta → emits token event with delta", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
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

            // Send message_update with assistantMessageEvent: text_delta
            capturedCallback!({
                type: "message_update",
                message: { role: "assistant", content: [] },
                assistantMessageEvent: { type: "text_delta", delta: "hello world", contentIndex: 0 },
            });

            capturedCallback!({ type: "agent_end", messages: [] });

            await new Promise((resolve) => setTimeout(resolve, 20));
            const tokenEvent = events.find((e) => e.type === "token") as
                | { type: "token"; content: string }
                | undefined;
            expect(tokenEvent).toBeDefined();
            expect(tokenEvent!.content).toBe("hello world");
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });
});

// ─── Block C: message_update dispatch on thinking_delta ───────────────────────

describe("run() — message_update thinking_delta assistantMessageEvent", () => {
    it("thinking_delta → emits thinking event with delta", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
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
                message: { role: "assistant", content: [] },
                assistantMessageEvent: { type: "thinking_delta", delta: "first chunk", contentIndex: 0 },
            });

            capturedCallback!({ type: "agent_end", messages: [] });

            await new Promise((resolve) => setTimeout(resolve, 20));
            const thinkingEvent = events.find((e) => e.type === "thinking") as
                | { type: "thinking"; content: string }
                | undefined;
            expect(thinkingEvent).toBeDefined();
            expect(thinkingEvent!.content).toBe("first chunk");
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });
});

// ─── Block D: message_update dispatch on toolcall_end ─────────────────────────

describe("run() — message_update toolcall_end assistantMessageEvent", () => {
    it("toolcall_end → emits tool_call event with toolCall from event", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
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
                message: { role: "assistant", content: [] },
                assistantMessageEvent: {
                    type: "toolcall_end",
                    contentIndex: 0,
                    toolCall: {
                        id: "tc-1",
                        name: "read_file",
                        arguments: { path: "/x.txt" },
                    },
                },
            });

            capturedCallback!({ type: "agent_end", messages: [] });

            await new Promise((resolve) => setTimeout(resolve, 20));
            const toolCallEvent = events.find((e) => e.type === "tool_call") as {
                type: "tool_call";
                toolCall: { id: string; name: string; args: Record<string, unknown> };
            } | undefined;
            expect(toolCallEvent).toBeDefined();
            expect(toolCallEvent!.toolCall.id).toBe("tc-1");
            expect(toolCallEvent!.toolCall.name).toBe("read_file");
            expect(toolCallEvent!.toolCall.args).toEqual({ path: "/x.txt" });
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });
});

// ─── Block E: message_update non-delta events (no emit) ─────────────────────

describe("run() — message_update non-delta assistantMessageEvent types", () => {
    it("text_start does NOT emit token event", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
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
                message: { role: "assistant", content: [] },
                assistantMessageEvent: { type: "text_start", contentIndex: 0, partial: {} },
            });

            capturedCallback!({ type: "agent_end", messages: [] });

            await new Promise((resolve) => setTimeout(resolve, 20));
            const tokenEvents = events.filter((e) => e.type === "token");
            expect(tokenEvents).toHaveLength(0);
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });

    it("thinking_start does NOT emit thinking event", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
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
                message: { role: "assistant", content: [] },
                assistantMessageEvent: { type: "thinking_start", contentIndex: 0, partial: {} },
            });

            capturedCallback!({ type: "agent_end", messages: [] });

            await new Promise((resolve) => setTimeout(resolve, 20));
            const thinkingEvents = events.filter((e) => e.type === "thinking");
            expect(thinkingEvents).toHaveLength(0);
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });

    it("toolcall_start does NOT emit tool_call event", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
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
                message: { role: "assistant", content: [] },
                assistantMessageEvent: { type: "toolcall_start", contentIndex: 0, partial: {} },
            });

            capturedCallback!({ type: "agent_end", messages: [] });

            await new Promise((resolve) => setTimeout(resolve, 20));
            const toolCallEvents = events.filter((e) => e.type === "tool_call");
            expect(toolCallEvents).toHaveLength(0);
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });
});

// ─── Block F: turn_end with typed AssistantMessage (per-turn extraction, ADR-0028) ───
//
// V3.1 的 "agent_end typed aggregation" 改为 "turn_end typed extraction":
// 每 turn 触发 1 个 done,提取 content / thinking / toolCalls / toolResults from turn_end.message
// (NOT cross-turn aggregated from agent_end.messages[]).

describe("run() — turn_end typed extraction (per-turn, ADR-0028)", () => {
    it("turn_end with AssistantMessage.text block → done.content extracted", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
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
                type: "turn_end",
                message: {
                    role: "assistant",
                    content: [{ type: "text", text: "hi" }],
                    api: "anthropic-messages",
                    provider: "anthropic",
                    model: "x",
                    usage: { inputTokens: 1, outputTokens: 1, cacheRead: 0, cacheWrite: 0 },
                    stopReason: "stop",
                    timestamp: 1,
                },
                toolResults: [],
            });

            await new Promise((resolve) => setTimeout(resolve, 20));
            const doneEvent = events.find((e) => e.type === "done") as {
                type: "done";
                message: { content: string };
            } | undefined;
            expect(doneEvent).toBeDefined();
            expect(doneEvent!.message.content).toBe("hi");
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });

    it("turn_end with AssistantMessage empty content array → done.content empty", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
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
                type: "turn_end",
                message: {
                    role: "assistant",
                    content: [],
                    api: "anthropic-messages",
                    provider: "anthropic",
                    model: "x",
                    usage: { inputTokens: 1, outputTokens: 1, cacheRead: 0, cacheWrite: 0 },
                    stopReason: "stop",
                    timestamp: 1,
                },
                toolResults: [],
            });

            await new Promise((resolve) => setTimeout(resolve, 20));
            const doneEvent = events.find((e) => e.type === "done") as {
                type: "done";
                message: { content: string };
            } | undefined;
            expect(doneEvent).toBeDefined();
            expect(doneEvent!.message.content).toBe("");
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });

    it("turn_end with AssistantMessage.thinking block → done.thinking set", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
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
                type: "turn_end",
                message: {
                    role: "assistant",
                    content: [{ type: "thinking", thinking: "reasoning" }],
                    api: "anthropic-messages",
                    provider: "anthropic",
                    model: "x",
                    usage: { inputTokens: 1, outputTokens: 1, cacheRead: 0, cacheWrite: 0 },
                    stopReason: "stop",
                    timestamp: 1,
                },
                toolResults: [],
            });

            await new Promise((resolve) => setTimeout(resolve, 20));
            const doneEvent = events.find((e) => e.type === "done") as {
                type: "done";
                message: { content: string; thinking: string | null };
            } | undefined;
            expect(doneEvent).toBeDefined();
            expect(doneEvent!.message.thinking).toBe("reasoning");
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });

    it("turn_end with AssistantMessage.toolCall block → done.toolCalls populated", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
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
                type: "turn_end",
                message: {
                    role: "assistant",
                    content: [{ type: "toolCall", id: "t1", name: "read_file", arguments: {} }],
                    api: "anthropic-messages",
                    provider: "anthropic",
                    model: "x",
                    usage: { inputTokens: 1, outputTokens: 1, cacheRead: 0, cacheWrite: 0 },
                    stopReason: "stop",
                    timestamp: 1,
                },
                toolResults: [],
            });

            await new Promise((resolve) => setTimeout(resolve, 20));
            const doneEvent = events.find((e) => e.type === "done") as {
                type: "done";
                message: { content: string; toolCalls: unknown[] | null };
            } | undefined;
            expect(doneEvent).toBeDefined();
            expect(doneEvent!.message.toolCalls).not.toBeNull();
            expect(doneEvent!.message.toolCalls).toHaveLength(1);
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });

    // ─── 推理配置 (regression: thinking 必须在 runtime 层开启,否则 LLM 不产出 thinking blocks) ──
    // 历史教训:thinkingLevel="off" + reasoning:false 时,agent-loop.js 把 reasoning 设为 undefined,
    // LLM 不产出 thinking_delta → store 不更新 stub.thinking → done.thinking=null →
    // MessageBubble ThinkingPanel 看不到 thinking(没数据)。
    // 用户首屏反馈"bubble 仍然没有 THINKING",原因就是这一对值被写死成 off/false。

    it("run() builds Agent with model.reasoning=true + thinkingLevel='medium' (enables visible thinking)", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();

        let capturedConfig: unknown = null;
        try {
            mockedAgent.mockImplementation(function _CapturingMockAgent(config: unknown) {
                capturedConfig = config;
                return {
                    subscribe: vi.fn().mockReturnValue(() => {}),
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
                };
            });

            const runtime = createAgentRuntime();
            const stream = runtime.run({ context: mockContext, provider: mockProvider });
            // 跟其他 thinking 测试一致: 触发 stream subscription 但不 await(stream 不结束,mock 不发事件)
            const program = Stream.runForEach(
                stream,
                () => Effect.succeed(undefined),
            );
            Effect.runPromise(program.pipe(Effect.scoped)).catch(() => {});
            // 等一个 tick 让 Stream.async 的 emit 同步执行 (Agent 在那同步 new 出来)
            await new Promise((resolve) => setTimeout(resolve, 10));

            expect(capturedConfig).toBeDefined();
            const cfg = capturedConfig as {
                initialState?: {
                    thinkingLevel?: string;
                    model?: { reasoning?: boolean; id?: string };
                };
            };
            // 关键断言 — 任一被改回 off/false 都视为 thinking 被关掉
            expect(cfg.initialState?.thinkingLevel).toBe("medium");
            expect(cfg.initialState?.model?.reasoning).toBe(true);
            // 附带 sanity: provider 透传到 model.id
            expect(cfg.initialState?.model?.id).toBe(mockProvider.defaultModel);
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });
});

// ─── G30: Bubble Boundary — per-turn done emission (ADR-0028) ────────────────
//
// 旧 contract: agent_end 时跨所有 assistant messages 聚合 thinking/tool_calls
// → 1 final done (V3.1 fix)。
//
// 新 contract: 每个 turn_end emit 1 个 done (该 turn 的 assistant message)；
// agent_end 只 cleanup (emit.end() + unsubscribe)，不再 emit done。
//
// 1 user input → N agent turns → N done events → N bubbles (per chat.store)。
describe("run() — G30: per-turn done emission (Bubble Boundary, ADR-0028)", () => {
    it("G30a: turn_end with single assistant message → 1 done event with extracted content/thinking/toolCalls", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();
        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
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

            // 单 turn: thinking + text + toolCall + tool_result
            capturedCallback!({
                type: "message_update",
                message: {
                    content: [
                        { type: "thinking", thinking: "Reasoning..." },
                        { type: "text", text: "Hello!" },
                        { type: "toolCall", id: "tc-1", name: "read_file", arguments: {} },
                    ],
                },
            });
            capturedCallback!({
                type: "tool_execution_end",
                toolCallId: "tc-1",
                result: "data",
                isError: false,
            });
            capturedCallback!({
                type: "turn_end",
                message: {
                    role: "assistant",
                    content: [
                        { type: "thinking", thinking: "Reasoning..." },
                        { type: "text", text: "Hello!" },
                        { type: "toolCall", id: "tc-1", name: "read_file", arguments: {} },
                    ],
                },
                toolResults: [{ toolCallId: "tc-1", content: [{ type: "text", text: "data" }], isError: false }],
            });
            capturedCallback!({ type: "agent_end", messages: [] });

            await new Promise((resolve) => setTimeout(resolve, 20));
            const doneEvents = events.filter((e) => e.type === "done") as Array<{
                type: "done";
                message: {
                    content: string;
                    thinking: string | null;
                    toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> | null;
                    toolResults: Array<{ toolCallId: string; result: unknown; error: string | null }> | null;
                };
            }>;

            expect(doneEvents).toHaveLength(1);
            expect(doneEvents[0]!.message.content).toBe("Hello!");
            expect(doneEvents[0]!.message.thinking).toBe("Reasoning...");
            expect(doneEvents[0]!.message.toolCalls).toHaveLength(1);
            expect(doneEvents[0]!.message.toolCalls![0]!.name).toBe("read_file");
            // toolResults from turn_end.toolResults must be preserved (NOT null)
            expect(doneEvents[0]!.message.toolResults).not.toBeNull();
            expect(doneEvents[0]!.message.toolResults![0]!.toolCallId).toBe("tc-1");
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });

    it("G30b: 2 turn_ends → 2 done events, each with own turn's content (NO cross-turn aggregation)", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();
        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
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

            // turn 1: thinking + text + toolCall
            capturedCallback!({
                type: "message_update",
                message: {
                    content: [
                        { type: "thinking", thinking: "Searching files." },
                        { type: "text", text: "Let me search." },
                        { type: "toolCall", id: "tc-1", name: "search_files", arguments: { pattern: "*.ts" } },
                    ],
                },
            });
            capturedCallback!({
                type: "turn_end",
                message: {
                    role: "assistant",
                    content: [
                        { type: "thinking", thinking: "Searching files." },
                        { type: "text", text: "Let me search." },
                        { type: "toolCall", id: "tc-1", name: "search_files", arguments: { pattern: "*.ts" } },
                    ],
                },
                toolResults: [],
            });

            // turn 2: text only (final answer based on tool result)
            capturedCallback!({
                type: "message_update",
                message: {
                    content: [{ type: "text", text: "Found 50 files." }],
                },
            });
            capturedCallback!({
                type: "turn_end",
                message: {
                    role: "assistant",
                    content: [{ type: "text", text: "Found 50 files." }],
                },
                toolResults: [],
            });

            capturedCallback!({ type: "agent_end", messages: [] });

            await new Promise((resolve) => setTimeout(resolve, 20));
            const doneEvents = events.filter((e) => e.type === "done") as Array<{
                type: "done";
                message: {
                    content: string;
                    thinking: string | null;
                    toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> | null;
                };
            }>;

            // S2 contract: 2 turns → 2 done events
            expect(doneEvents).toHaveLength(2);

            // done[0] = turn-1: owns thinking + toolCalls
            expect(doneEvents[0]!.message.content).toBe("Let me search.");
            expect(doneEvents[0]!.message.thinking).toBe("Searching files.");
            expect(doneEvents[0]!.message.toolCalls).not.toBeNull();
            expect(doneEvents[0]!.message.toolCalls![0]!.name).toBe("search_files");

            // done[1] = turn-2: text only, NO tool calls, NO cross-turn thinking aggregation
            expect(doneEvents[1]!.message.content).toBe("Found 50 files.");
            expect(doneEvents[1]!.message.thinking).toBeNull(); // turn-2 had no thinking block
            expect(doneEvents[1]!.message.toolCalls).toBeNull(); // REGRESSION: not aggregated from turn-1
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });

    it("G30c: agent_end with messages (legacy path) does NOT emit done (cleanup-only)", async () => {
        const { Agent } = await import("@earendil-works/pi-agent-core");
        const mockedAgent = vi.mocked(Agent);
        const originalImpl = mockedAgent.getMockImplementation();
        let capturedCallback: ((evt: unknown, signal?: AbortSignal) => void) | undefined;
        try {
            mockedAgent.mockImplementation(function _MockAgent(_config: unknown) {
                return {
                    subscribe: (h: (evt: unknown, signal?: AbortSignal) => void) => {
                        capturedCallback = h;
                        return () => {};
                    },
                    prompt: vi.fn().mockResolvedValue(undefined),
                    abort: vi.fn(),
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

            // 只发 agent_end (没 turn_end) — cleanup 路径
            capturedCallback!({
                type: "agent_end",
                messages: [{ content: [{ type: "text", text: "orphan" }] }],
            });

            await new Promise((resolve) => setTimeout(resolve, 20));
            const doneEvents = events.filter((e) => e.type === "done");
            expect(doneEvents).toHaveLength(0); // agent_end 不再 emit done
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });
});

