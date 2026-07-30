import { describe, it, expect, vi, afterEach } from "vitest";
import {
    anthropicStream,
    parseSseLine,
    buildAnthropicRequestBody,
    parseSseStream,
} from "@codeman-frontend/features/chat/lib/anthropic-transport";
import type {
    AssistantMessageEvent,
    Context,
    Message,
    Model,
    SimpleStreamOptions,
    Tool,
} from "@earendil-works/pi-ai";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";



function makeMessage(role: Message["role"], content: unknown): Message {
    return {
        id: "msg-" + Math.random().toString(36).slice(2, 8),
        conversation_id: "conv-1",
        role,
        content,
        tool_calls: null,
        tool_results: null,
        created_at: Date.now(),
    } as unknown as Message;
}


function makeSseStream(text: string): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(text));
            controller.close();
        },
    });
}



const testModel: Model<"anthropic-messages"> = {
    id: "test-model",
    name: "test-model",
    api: "anthropic-messages",
    provider: "anthropic",
    baseUrl: "https://api.test",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
};

const testContext: Context = {
    systemPrompt: "system",
    messages: [],
    tools: undefined,
};

const testOptions: SimpleStreamOptions = {
    apiKey: "test-key",
};



describe("parseSseLine -- SSE line parser", () => {
    it("A1: empty string returns {}", () => {
        expect(parseSseLine("")).toEqual({});
    });

    it("A2: 'event: message_start' -> { event: 'message_start' }", () => {
        expect(parseSseLine("event: message_start")).toEqual({ event: "message_start" });
    });

    it("A3: 'data: {\"a\":1}' -> { data: '{\"a\":1}' }", () => {
        expect(parseSseLine('data: {"a":1}')).toEqual({ data: '{"a":1}' });
    });

    it("A4: 'data:{\"a\":1}' (no space) -> { data: '{\"a\":1}' }", () => {
        expect(parseSseLine('data:{"a":1}')).toEqual({ data: '{"a":1}' });
    });

    it("A5: random text 'foo' -> {} (no colon)", () => {
        expect(parseSseLine("foo")).toEqual({});
    });
});



describe("buildAnthropicRequestBody -- Anthropic request body", () => {
    it("B1: user role + string content -> role:'user', content:string", () => {
        const model = { id: "test-model" };
        const messages: Message[] = [makeMessage("user", "hello world")];
        const result = buildAnthropicRequestBody(model, "system", messages, []);
        expect(result.messages[0]).toMatchObject({ role: "user", content: "hello world" });
    });

    it("B2: user role + object content -> joins TextContent array as string", () => {
        const model = { id: "test-model" };
        const messages: Message[] = [
            makeMessage("user", [{ type: "text", text: "hi" }]),
        ];
        const result = buildAnthropicRequestBody(model, "system", messages, []);
        expect(result.messages[0].content).toBe("hi");
    });

    it("B3: assistant role + text block -> content:[{type:'text',...}]", () => {
        const model = { id: "test-model" };
        const assistantMsg = makeMessage("assistant", [
            { type: "text", text: "hi" },
        ]);
        const messages: Message[] = [assistantMsg];
        const result = buildAnthropicRequestBody(model, "system", messages, []);
        expect(result.messages[0]).toMatchObject({
            role: "assistant",
            content: [{ type: "text", text: "hi" }],
        });
    });

    it("B4: assistant role + toolCall block (id,name,arguments) -> content:[{type:'tool_use',...}]", () => {
        const model = { id: "test-model" };
        const assistantMsg = makeMessage("assistant", [
            {
                type: "toolCall",
                id: "tc-1",
                name: "read_file",
                arguments: { path: "/a" },
            },
        ]);
        const messages: Message[] = [assistantMsg];
        const result = buildAnthropicRequestBody(model, "system", messages, []);
        expect(result.messages[0]).toMatchObject({
            role: "assistant",
            content: [
                { type: "tool_use", id: "tc-1", name: "read_file", input: { path: "/a" } },
            ],
        });
    });

    it("B5: assistant role + EMPTY blocks array -> not pushed", () => {
        const model = { id: "test-model" };
        const assistantMsg = makeMessage("assistant", []);
        const messages: Message[] = [makeMessage("user", "hello"), assistantMsg];
        const result = buildAnthropicRequestBody(model, "system", messages, []);
        
        expect(result.messages.length).toBe(1);
        expect(result.messages[0].role).toBe("user");
    });

    it("B6: toolResult role -> role:'user', content:[{type:'tool_result',...}]", () => {
        const model = { id: "test-model" };
        const toolResultMsg = makeMessage("toolResult", [
            { type: "text", text: "file content" },
        ]) as Message & { toolCallId: string; isError?: boolean };
        toolResultMsg.toolCallId = "tc-1";
        const messages: Message[] = [toolResultMsg];
        const result = buildAnthropicRequestBody(model, "system", messages, []);
        expect(result.messages[0]).toMatchObject({
            role: "user",
            content: [
                {
                    type: "tool_result",
                    tool_use_id: "tc-1",
                    content: "file content",
                },
            ],
        });
    });

    
    
    
    
    
    
    
    
    
    
    
    
    it("G33: 2 consecutive toolResult messages → batched into 1 user message with 2 tool_results", () => {
        const model = { id: "test-model" };
        const tr1 = makeMessage("toolResult", [
            { type: "text", text: "r1" },
        ]) as Message & { toolCallId: string };
        tr1.toolCallId = "tc-1";
        const tr2 = makeMessage("toolResult", [
            { type: "text", text: "r2" },
        ]) as Message & { toolCallId: string };
        tr2.toolCallId = "tc-2";
        const messages: Message[] = [tr1, tr2];
        const result = buildAnthropicRequestBody(model, "system", messages, []);
        expect(result.messages).toHaveLength(1);
        expect(result.messages[0]).toMatchObject({
            role: "user",
            content: [
                { type: "tool_result", tool_use_id: "tc-1", content: "r1" },
                { type: "tool_result", tool_use_id: "tc-2", content: "r2" },
            ],
        });
    });

    it("B7: tools = [{ name, description, parameters }] -> input_schema = parameters", () => {
        const model = { id: "test-model" };
        const tools: Tool[] = [
            {
                name: "read_file",
                description: "read a file",
                parameters: { type: "object", properties: { path: { type: "string" } } },
            },
        ];
        const result = buildAnthropicRequestBody(model, "system", [], tools);
        expect(result.tools).toMatchObject([
            {
                name: "read_file",
                description: "read a file",
                input_schema: { type: "object", properties: { path: { type: "string" } } },
            },
        ]);
    });

    it("B8: tools = [] -> omit 'tools' key", () => {
        const model = { id: "test-model" };
        const result = buildAnthropicRequestBody(model, "system", [], []);
        expect("tools" in result).toBe(false);
    });

    it("B9: model.maxTokens undefined -> max_tokens = 8192", () => {
        const model = { id: "test-model" };
        const result = buildAnthropicRequestBody(model, "system", [], []);
        expect(result.max_tokens).toBe(8192);
    });
});



describe("anthropicStream -- real HTTP path (mocked fetch + ReadableStream)", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    afterEach(() => {
        if (fetchSpy) {
            fetchSpy.mockRestore();
        }
    });

    it("G1: response.ok=false -> push error event containing 'Anthropic API 500'", async () => {
        fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response("error body", { status: 500 }) as unknown as Response);

        const stream = await anthropicStream(testModel, testContext, testOptions);
        const events: AssistantMessageEvent[] = [];
        for await (const evt of stream) {
            events.push(evt);
        }

        const errorEvent = events.find((e) => e.type === "error");
        expect(errorEvent).toBeDefined();
        if (errorEvent && errorEvent.type === "error") {
            expect(errorEvent.error.errorMessage).toContain("Anthropic API 500");
        }
    });

    it("G2: full SSE happy path -> start + text_start + text_delta + text_end + done", async () => {
        const sse =
            "event: message_start\ndata: {\"type\":\"message_start\"}\n\n" +
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n" +
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"hello\"}}\n\n" +
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\" world\"}}\n\n" +
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n" +
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"}}\n\n" +
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n";
        fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response(makeSseStream(sse), { status: 200 }) as unknown as Response);

        const stream = await anthropicStream(testModel, testContext, testOptions);
        const events: AssistantMessageEvent[] = [];
        for await (const evt of stream) {
            events.push(evt);
        }

        const types = events.map((e) => e.type);
        expect(types).toContain("start");
        expect(types).toContain("text_start");
        expect(types).toContain("text_delta");
        expect(types).toContain("text_end");
        expect(types).toContain("done");

        const doneEvent = events.find((e) => e.type === "done");
        expect(doneEvent).toBeDefined();
        if (doneEvent && doneEvent.type === "done") {
            const textBlock = doneEvent.message.content.find(
                (b) => b.type === "text",
            ) as { type: "text"; text: string } | undefined;
            expect(textBlock?.text).toBe("hello world");
            expect(doneEvent.message.stopReason).toBe("stop");
        }
    });

    it("G3: tool_use parsing -- toolcall_start + toolcall_end + done with toolCall block", async () => {
        const sse =
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"tool_use\",\"id\":\"tc_1\",\"name\":\"read_file\"}}\n\n" +
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"path\\\":\"}}\n\n" +
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"\\\"/a\\\"}\"}}\n\n" +
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n" +
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\"}}\n\n" +
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n";
        fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response(makeSseStream(sse), { status: 200 }) as unknown as Response);

        const stream = await anthropicStream(testModel, testContext, testOptions);
        const events: AssistantMessageEvent[] = [];
        for await (const evt of stream) {
            events.push(evt);
        }

        const toolcallEnd = events.find((e) => e.type === "toolcall_end");
        expect(toolcallEnd).toBeDefined();
        if (toolcallEnd && toolcallEnd.type === "toolcall_end") {
            expect(toolcallEnd.toolCall).toMatchObject({
                type: "toolCall",
                id: "tc_1",
                name: "read_file",
            });
            expect(toolcallEnd.toolCall.arguments).toEqual({ path: "/a" });
        }

        const doneEvent = events.find((e) => e.type === "done");
        expect(doneEvent).toBeDefined();
        if (doneEvent && doneEvent.type === "done") {
            expect(doneEvent.message.stopReason).toBe("toolUse");
            const toolCallBlock = doneEvent.message.content.find(
                (b) => b.type === "toolCall",
            ) as
                | { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> }
                | undefined;
            expect(toolCallBlock).toBeDefined();
            expect(toolCallBlock?.arguments).toEqual({ path: "/a" });
        }
    });

    it("G4: invalid JSON in sseDataBuf -> caught + sseDataBuf reset (no throw)", async () => {
        const sse =
            "event: garbage\ndata: not-valid-json\n\n" +
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n";
        fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response(makeSseStream(sse), { status: 200 }) as unknown as Response);

        const stream = await anthropicStream(testModel, testContext, testOptions);
        const events: AssistantMessageEvent[] = [];
        
        for await (const evt of stream) {
            events.push(evt);
        }
        
        const doneEvent = events.find((e) => e.type === "done");
        expect(doneEvent).toBeDefined();
    });

    it("G5: invalid JSON for tool_use args -> parsedArgs = {}", async () => {
        const sse =
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"tool_use\",\"id\":\"tc_1\",\"name\":\"x\"}}\n\n" +
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"not-valid-json\"}}\n\n" +
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n" +
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\"}}\n\n" +
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n";
        fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response(makeSseStream(sse), { status: 200 }) as unknown as Response);

        const stream = await anthropicStream(testModel, testContext, testOptions);
        const events: AssistantMessageEvent[] = [];
        for await (const evt of stream) {
            events.push(evt);
        }

        const toolcallEnd = events.find((e) => e.type === "toolcall_end");
        expect(toolcallEnd).toBeDefined();
        if (toolcallEnd && toolcallEnd.type === "toolcall_end") {
            expect(toolcallEnd.toolCall.arguments).toEqual({});
        }
    });

    it("G6: thinking block -- thinking_start + thinking_delta + thinking_end + done", async () => {
        const sse =
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"thinking\"}}\n\n" +
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"hmm\"}}\n\n" +
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n" +
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"}}\n\n" +
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n";
        fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response(makeSseStream(sse), { status: 200 }) as unknown as Response);

        const stream = await anthropicStream(testModel, testContext, testOptions);
        const events: AssistantMessageEvent[] = [];
        for await (const evt of stream) {
            events.push(evt);
        }

        const types = events.map((e) => e.type);
        expect(types).toContain("thinking_start");
        expect(types).toContain("thinking_delta");
        expect(types).toContain("thinking_end");

        const doneEvent = events.find((e) => e.type === "done");
        expect(doneEvent).toBeDefined();
        if (doneEvent && doneEvent.type === "done") {
            const thinkingBlock = doneEvent.message.content.find(
                (b) => b.type === "thinking",
            ) as { type: "thinking"; thinking: string } | undefined;
            expect(thinkingBlock).toBeDefined();
            expect(thinkingBlock?.thinking).toBe("hmm");
        }
    });

    it("G7: response.body=null -> push error event containing 'Anthropic API 200'", async () => {
        
        const mockResp = { ok: true, status: 200, body: null, text: async () => "" };
        fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(mockResp as unknown as Response);

        const stream = await anthropicStream(testModel, testContext, testOptions);
        const events: AssistantMessageEvent[] = [];
        for await (const evt of stream) {
            events.push(evt);
        }

        const errorEvent = events.find((e) => e.type === "error");
        expect(errorEvent).toBeDefined();
        if (errorEvent && errorEvent.type === "error") {
            expect(errorEvent.error.errorMessage).toContain("Anthropic API 200");
        }
    });

    
    
    
    
    
    
    
    it("G8: lenient init -- content_block_delta WITHOUT preceding content_block_start still produces text block", async () => {
        const sse =
            "event: message_start\n" +
            'data: {"type":"message_start"}\n' +
            "\n" +
            "event: content_block_delta\n" +
            'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi from mock"}}\n' +
            "\n" +
            "event: message_stop\n" +
            'data: {"type":"message_stop"}\n' +
            "\n";
        fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response(makeSseStream(sse), { status: 200 }) as unknown as Response);

        const stream = await anthropicStream(testModel, testContext, testOptions);
        const events: AssistantMessageEvent[] = [];
        for await (const evt of stream) {
            events.push(evt);
        }

        const textDeltaEvents = events.filter((e) => e.type === "text_delta");
        expect(textDeltaEvents.length).toBeGreaterThan(0);

        const doneEvent = events.find((e) => e.type === "done");
        expect(doneEvent).toBeDefined();
        if (doneEvent && doneEvent.type === "done") {
            const textBlock = doneEvent.message.content.find(
                (b) => b.type === "text",
            ) as { type: "text"; text: string } | undefined;
            expect(textBlock?.text).toBe("hi from mock");
        }
    });
});



describe("parseSseStream -- abort during cleanup race", () => {
    const testModel: Model<"anthropic-messages"> = {
        id: "test-model",
        name: "test-model",
        api: "anthropic-messages",
        provider: "anthropic",
        baseUrl: "https://api.test",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
    };

    

    it("H1: non-empty content → returns accumulated content regardless of abort state", async () => {
        
        
        
        const sse =
            "event: message_start\ndata: {\"type\":\"message_start\"}\n\n" +
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n" +
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"hello world\"}}\n\n" +
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n" +
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"}}\n\n" +
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n";

        const encoder = new TextEncoder();
        const readableStream = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode(sse));
                controller.close();
            },
        });

        const abortController = new AbortController();
        const { signal } = abortController;
        const eventStream = createAssistantMessageEventStream();

        
        
        
        setTimeout(() => abortController.abort(), 0);

        const result = await parseSseStream(readableStream, testModel, signal, eventStream);

        
        const textBlock = result.content.find(
            (b) => b.type === "text",
        ) as { type: "text"; text: string } | undefined;
        expect(textBlock?.text).toBe("hello world");
        
        
    });

    it("H2: empty content + abort → returns makeAbortedMessage (content: [])", async () => {
        
        
        const emptySse = "";

        const encoder = new TextEncoder();
        const readableStream = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode(emptySse));
                controller.close();
            },
        });

        const abortController = new AbortController();
        const { signal } = abortController;
        const eventStream = createAssistantMessageEventStream();

        setTimeout(() => abortController.abort(), 0);

        const result = await parseSseStream(readableStream, testModel, signal, eventStream);

        
        expect(result.content).toHaveLength(0);
        
    });

    it("H3: normal completion (no abort) → returns accumulated content with normal stopReason", async () => {
        
        const sse =
            "event: message_start\ndata: {\"type\":\"message_start\"}\n\n" +
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n" +
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"normal text\"}}\n\n" +
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n" +
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"}}\n\n" +
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n";

        const encoder = new TextEncoder();
        const readableStream = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode(sse));
                controller.close();
            },
        });

        
        const eventStream = createAssistantMessageEventStream();
        const result = await parseSseStream(readableStream, testModel, undefined, eventStream);

        const textBlock = result.content.find(
            (b) => b.type === "text",
        ) as { type: "text"; text: string } | undefined;
        expect(textBlock?.text).toBe("normal text");
        expect(result.stopReason).toBe("stop");
    });
});



describe("parseSseStream -- usage tracking from message_delta", () => {
    const testModel: Model<"anthropic-messages"> = {
        id: "test-model",
        name: "test-model",
        api: "anthropic-messages",
        provider: "anthropic",
        baseUrl: "https://api.test",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
    };

    function makeSseStream(text: string): ReadableStream<Uint8Array> {
        const encoder = new TextEncoder();
        return new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode(text));
                controller.close();
            },
        });
    }

    it("I1: tracks usage from message_delta SSE event", async () => {
        const sse =
            "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":\"test\",\"stop_reason\":null,\"stop_sequence\":null,\"usage\":{\"input_tokens\":0,\"output_tokens\":0}}}\n\n" +
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n" +
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello\"}}\n\n" +
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n" +
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"input_tokens\":100,\"output_tokens\":50}}\n\n" +
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n";

        const stream = makeSseStream(sse);
        const eventStream = createAssistantMessageEventStream();
        const result = await parseSseStream(stream, testModel, undefined, eventStream);

        expect(result.usage.input).toBe(100);
        expect(result.usage.output).toBe(50);
        expect(result.usage.totalTokens).toBe(150);
    });
});
