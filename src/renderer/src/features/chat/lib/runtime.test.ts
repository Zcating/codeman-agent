import { describe, it, expect } from "vitest";
import { createAgentRuntime, type ProviderConfig, type RuntimeEvent } from "@codeman-frontend/features/chat/lib/runtime";
import { Stream, Effect } from "effect";
import type { Message } from "@codeman-frontend/shared/lib/types";
import { vi } from "vitest";

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
    id: "test-provider",
    models: [{ id: "m1", label: "m1" }],
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
        const cfg: ProviderConfig = {
            baseUrl: "https://mock.local",
            defaultModel: "mock-model",
            systemPrompt: "You are a helpful assistant.",
            tools: [],
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
            const program = Stream.runForEach(
                runtime.run({ context: mockContext, provider: mockProvider }),
                (e) => Effect.sync(() => events.push(e)),
            );
            Effect.runPromise(program.pipe(Effect.scoped)).catch(() => {});

            await new Promise((resolve) => setTimeout(resolve, 10));

            capturedCallback!({
                type: "tool_execution_end",
                toolCallId: "tc-1",
                result: "failed-msg",
                isError: true,
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

            capturedCallback!({
                type: "message_update",
                message: { content: "not-array" },
            });

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

            expect(doneEvents).toHaveLength(2);

            expect(doneEvents[0]!.message.content).toBe("Let me search for TypeScript files.");
            expect(doneEvents[0]!.message.thinking).toBe(
                "user wants search files; calling search_files with *.ts",
            );
            expect(doneEvents[0]!.message.toolCalls).not.toBeNull();
            expect(doneEvents[0]!.message.toolCalls).toHaveLength(1);
            expect(doneEvents[0]!.message.toolCalls![0]!.id).toBe("toolu_turn1_search");
            expect(doneEvents[0]!.message.toolCalls![0]!.name).toBe("search_files");
            expect(doneEvents[0]!.message.toolCalls![0]!.args).toEqual({ pattern: "*.ts" });

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

            runtime.cancel();

            expect(abortFn).toHaveBeenCalled();
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });
});


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
            const program = Stream.runForEach(
                stream,
                () => Effect.succeed(undefined),
            );
            Effect.runPromise(program.pipe(Effect.scoped)).catch(() => {});
            await new Promise((resolve) => setTimeout(resolve, 10));

            expect(capturedConfig).toBeDefined();
            const cfg = capturedConfig as {
                initialState?: {
                    thinkingLevel?: string;
                    model?: { reasoning?: boolean; id?: string };
                };
            };
            expect(cfg.initialState?.thinkingLevel).toBe("medium");
            expect(cfg.initialState?.model?.reasoning).toBe(true);
            expect(cfg.initialState?.model?.id).toBe(mockProvider.defaultModel);
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });
});

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

            expect(doneEvents).toHaveLength(2);

            expect(doneEvents[0]!.message.content).toBe("Let me search.");
            expect(doneEvents[0]!.message.thinking).toBe("Searching files.");
            expect(doneEvents[0]!.message.toolCalls).not.toBeNull();
            expect(doneEvents[0]!.message.toolCalls![0]!.name).toBe("search_files");

            expect(doneEvents[1]!.message.content).toBe("Found 50 files.");
            expect(doneEvents[1]!.message.thinking).toBeNull(); 
            expect(doneEvents[1]!.message.toolCalls).toBeNull(); 
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

            capturedCallback!({
                type: "agent_end",
                messages: [{ content: [{ type: "text", text: "orphan" }] }],
            });

            await new Promise((resolve) => setTimeout(resolve, 20));
            const doneEvents = events.filter((e) => e.type === "done");
            expect(doneEvents).toHaveLength(0); 
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });
});

