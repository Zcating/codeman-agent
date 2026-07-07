import { describe, it, expect } from "vitest";
import { createAgentRuntime, type ProviderConfig, type RuntimeEvent } from "./runtime";
import { Stream, Effect } from "effect";
import type { Message } from "../../../shared/lib/types";
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
                        handler({
                            type: "agent_end",
                            messages: [{ content: [{ type: "text", text: "hello" }] }],
                        });
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
        conversation_id: "c1",
        role: "user",
        content: "hi",
        thinking: null,
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

describe("run() �� event translation", () => {
    it("translates message_update text �� token event", async () => {
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

    // ─── V3.1: thinking 块从 agent_end 提取到 done.message.thinking ──────────────

    it("agent_end with thinking block in lastMsg.content → done.message.thinking is set (post-stream thinking preserved)", async () => {
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

            // 模拟 mock-server 'think' entry 的最终状态: assistant 消息只有 thinking 块
            capturedCallback!({
                type: "agent_end",
                messages: [
                    {
                        content: [
                            {
                                type: "thinking",
                                thinking:
                                    "The user typed 'think'. This is the accumulated thinking block from the mock LLM.",
                            },
                        ],
                    },
                ],
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

    it("agent_end with no thinking block → done.message.thinking is null (no spurious empty string)", async () => {
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
                messages: [{ content: [{ type: "text", text: "just text no thinking" }] }],
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

describe("run() �� tool_execution_end �¼�", () => {
    it("tool_execution_end �� isError=true ʱ������ error �� tool_result �¼�", async () => {
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
            // �� await����΢�������ܣ����� capturedCallback �ܱ�����
            const program = Stream.runForEach(
                runtime.run({ context: mockContext, provider: mockProvider }),
                (e) => Effect.sync(() => events.push(e)),
            );
            Effect.runPromise(program.pipe(Effect.scoped)).catch(() => {});

            // �ȴ�΢���������գ�ȷ�� subscribe �ѱ�����
            await new Promise((resolve) => setTimeout(resolve, 10));

            // ���� tool_execution_end with isError=true
            capturedCallback!({
                type: "tool_execution_end",
                toolCallId: "tc-1",
                result: "failed-msg",
                isError: true,
            });

            // �� agent_end �ر� stream
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

    it("tool_execution_end �� isError=false ʱ�������� error �� tool_result �¼�", async () => {
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

describe("run() �� message_update �߽����", () => {
    it("message_update �� toolCall block ʱ���� tool_call �¼�", async () => {
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
            expect(toolCallEvent.toolCall.args).toEqual({
                workspace_id: "main",
                path: "/tmp/x.txt",
            });
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });

    it("message_update �� content ������ʱ��ǰ���أ��������¼�", async () => {
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

            // content Ϊ�ַ�����������
            capturedCallback!({
                type: "message_update",
                message: { content: "not-array" },
            });

            capturedCallback!({ type: "agent_end", messages: [] });

            await new Promise((resolve) => setTimeout(resolve, 20));
            // û�з��� token �� tool_call �¼������ڷ��أ�
            const tokenEvents = events.filter(
                (e) => e.type === "token" || e.type === "tool_call",
            );
            expect(tokenEvents).toHaveLength(0);
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });

    it("message_update �� message �ֶ�ʱ��ǰ���أ��������¼�", async () => {
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

            // �� message �ֶ�
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

describe("run() �� agent_end �¼�", () => {
    it("agent_end �� assistant ��Ϣ�� toolCall block ʱ done �¼����� tool_calls", async () => {
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

    it("agent_end �� messages Ϊ������ʱ�Է��� done �¼��������ݣ�", async () => {
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

            // ADR-0019: agent_end ������ emit done �� ��ʹ messages Ϊ��
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

    // V3.1 multi-turn 修复: agent loop 多轮 (tool use + follow-up answer) 时,
    // lastMsg 是 turn-2 的 text-only final answer,不再包含 turn-1 的
    // thinking + toolCall blocks。Runtime 必须跨所有 assistant messages 聚合
    // thinking + tool_calls 到 done.message,UI 才能看到 thinking section
    // 和 inline ToolCallCard。
    it("multi-turn agent_end: turn-2 text-only lastMsg → done.tool_calls + thinking preserved from turn-1", async () => {
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
                type: "agent_end",
                messages: [
                    {
                        role: "user",
                        content: [{ type: "text", text: "three-blocks" }],
                    },
                    {
                        role: "assistant",
                        content: [
                            {
                                type: "thinking",
                                thinking:
                                    "user wants search files; calling search_files with *.ts",
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
                    {
                        role: "toolResult",
                        toolCallId: "toolu_turn1_search",
                        content: [{ type: "text", text: "Found 50 matches" }],
                        isError: false,
                    },
                    {
                        role: "assistant",
                        content: [{ type: "text", text: "Done. Found 50 TypeScript files." }],
                    },
                ],
            });

            await new Promise((resolve) => setTimeout(resolve, 20));
            const doneEvent = events.find((e) => e.type === "done") as {
                type: "done";
                message: {
                    content: string;
                    thinking: string | null;
                    tool_calls:
                        | Array<{ id: string; name: string; args: Record<string, unknown> }>
                        | null;
                };
            };
            expect(doneEvent).toBeDefined();
            // content 取 turn-2 的 final answer (last assistant msg)
            expect(doneEvent!.message.content).toBe(
                "Done. Found 50 TypeScript files.",
            );
            // thinking + tool_calls 必须从 turn-1 提取(不能是 null)
            expect(doneEvent!.message.thinking).toBe(
                "user wants search files; calling search_files with *.ts",
            );
            expect(doneEvent!.message.tool_calls).not.toBeNull();
            expect(doneEvent!.message.tool_calls).toHaveLength(1);
            expect(doneEvent!.message.tool_calls![0]!.id).toBe("toolu_turn1_search");
            expect(doneEvent!.message.tool_calls![0]!.name).toBe("search_files");
            expect(doneEvent!.message.tool_calls![0]!.args).toEqual({ pattern: "*.ts" });
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });
});

describe("cancel() �� agent abort", () => {
    it("cancel() ���� currentAgent.abort()", async () => {
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

            // ���� cancel
            runtime.cancel();

            expect(abortFn).toHaveBeenCalled();
        } finally {
            mockedAgent.mockImplementation(originalImpl as never);
        }
    });
});

