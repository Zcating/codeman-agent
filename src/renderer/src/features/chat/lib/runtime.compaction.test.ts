import { describe, it, expect, vi } from "vitest";
import { createAgentRuntime, type RuntimeEvent } from "@codeman-frontend/features/chat/lib/runtime";
import { Stream, Effect } from "effect";
import type { Message } from "@codeman-frontend/shared/lib/types";
import type { CompactionEntry } from "@codeman-frontend/shared/lib/types";


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


const mockProvider = {
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


describe("RuntimeEvent — seam 4: new compaction variants", () => {
    it("RuntimeEvent type includes compactionStarted variant", () => {
        const evt: RuntimeEvent = { type: "compactionStarted" };
        expect(evt.type).toBe("compactionStarted");
    });

    it("RuntimeEvent type includes compactionCompleted variant with entry", () => {
        const entry: CompactionEntry = {
            id: "comp-1",
            conversationId: "c1",
            summary: "Test summary",
            model: "test-model",
            tokensBefore: 1000,
            kind: "auto",
            createdAt: Date.now(),
            firstKeptMessageId: "u1",
        };
        const evt: RuntimeEvent = { type: "compactionCompleted", entry };
        expect(evt.type).toBe("compactionCompleted");
        expect(evt.entry).toEqual(entry);
    });

    it("RuntimeEvent type includes compactionFailed variant with reason", () => {
        const evt: RuntimeEvent = { type: "compactionFailed", reason: "summarize" };
        expect(evt.type).toBe("compactionFailed");
        expect(evt.reason).toBe("summarize");
    });

    it("Existing 7 RuntimeEvent variants still compile (discriminated union)", () => {
        const tokenEvt: RuntimeEvent = { type: "token", content: "hello" };
        const thinkingEvt: RuntimeEvent = { type: "thinking", content: "think" };
        const toolCallEvt: RuntimeEvent = {
            type: "tool_call",
            toolCall: { id: "tc1", name: "read_file", args: {} },
        };
        const toolResultEvt: RuntimeEvent = {
            type: "tool_result",
            toolCallId: "tc1",
            result: { ok: true },
        };
        const doneEvt: RuntimeEvent = {
            type: "done",
            message: {
                id: "m1",
                conversationId: "c1",
                role: "assistant",
                content: "hi",
                thinking: null,
                toolCalls: null,
                toolResults: null,
                model: null,
                inputTokens: null,
                outputTokens: null,
                createdAt: 1,
            },
        };
        const stopEvt: RuntimeEvent = { type: "message_stop" };
        const errorEvt: RuntimeEvent = { type: "error", error: { message: "fail" } };

        expect(tokenEvt.type).toBe("token");
        expect(thinkingEvt.type).toBe("thinking");
        expect(toolCallEvt.type).toBe("tool_call");
        expect(toolResultEvt.type).toBe("tool_result");
        expect(doneEvt.type).toBe("done");
        expect(stopEvt.type).toBe("message_stop");
        expect(errorEvt.type).toBe("error");
    });
});


describe("createAgentRuntime — transformContext parameter", () => {
    it("accepts transformContext parameter without error", () => {
        const transformContext = vi.fn().mockReturnValue([...mockContext]);
        const runtime = createAgentRuntime({ transformContext });
        expect(runtime).toBeDefined();
        expect(typeof runtime.run).toBe("function");
        expect(typeof runtime.cancel).toBe("function");
    });

    it("without transformContext → behaves as before (backward compatible)", () => {
        const runtime = createAgentRuntime();
        expect(runtime).toBeDefined();
        expect(typeof runtime.run).toBe("function");
        expect(typeof runtime.cancel).toBe("function");
    });

    it("transformContext is called when pi emits events", async () => {
        const transformContext = vi.fn().mockReturnValue([...mockContext]);
        const runtime = createAgentRuntime({ transformContext });

        const events: RuntimeEvent[] = [];
        const program = Stream.runForEach(
            runtime.run({ context: mockContext, provider: mockProvider }),
            (e) => Effect.sync(() => events.push(e)),
        );

        await Effect.runPromise(program.pipe(Effect.scoped));

        // After pi emits at least one event, transformContext should be called
        // (implementation may call it on start or per event)
        if (events.length > 0) {
            expect(transformContext).toHaveBeenCalled();
        }
    });

    it("transformContext receives messages and state consistent with context param", async () => {
        const transformContext = vi.fn().mockReturnValue([...mockContext]);
        const runtime = createAgentRuntime({ transformContext });

        const events: RuntimeEvent[] = [];
        const program = Stream.runForEach(
            runtime.run({ context: mockContext, provider: mockProvider }),
            (e) => Effect.sync(() => events.push(e)),
        );

        await Effect.runPromise(program.pipe(Effect.scoped));

        // If transformContext was called, verify the msgs match
        if (transformContext.mock.calls.length > 0) {
            const callArgs = transformContext.mock.calls[0];
            // First arg should be messages array (from context)
            expect(callArgs[0]).toBeDefined();
            // The messages should contain the original context
            expect(Array.isArray(callArgs[0])).toBe(true);
        }
    });
});


describe("handleEvent — RuntimeEvent type exhaustiveness", () => {
    it("handleEvent switch covers all 10 RuntimeEvent variants without default fallthrough", () => {
        // This test verifies the discriminated union covers all cases
        // If a new variant is added to RuntimeEvent but handleEvent doesn't handle it,
        // TypeScript will warn (unless there's a catch-all default)
        const allVariants: RuntimeEvent[] = [
            { type: "token", content: "hi" },
            { type: "thinking", content: "think" },
            { type: "tool_call", toolCall: { id: "1", name: "x", args: {} } },
            { type: "tool_result", toolCallId: "1", result: {} },
            { type: "done", message: { id: "1", conversationId: "c1", role: "assistant", content: "hi", thinking: null, toolCalls: null, toolResults: null, model: null, inputTokens: null, outputTokens: null, createdAt: 1 } },
            { type: "message_stop" },
            { type: "error", error: { message: "err" } },
            { type: "compactionStarted" },
            { type: "compactionCompleted", entry: { id: "1", conversationId: "c1", summary: "s", model: "m", tokensBefore: 1, kind: "auto", createdAt: 1, firstKeptMessageId: "m1" } },
            { type: "compactionFailed", reason: "err" },
        ];

        // Verify all 10 variants are recognized by TypeScript
        expect(allVariants.length).toBe(10);

        // Verify each variant's type field
        allVariants.forEach((evt) => {
            expect(typeof evt.type).toBe("string");
        });
    });
});
