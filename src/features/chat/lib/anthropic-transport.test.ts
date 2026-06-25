import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AnthropicTransport, parseSseLine, buildRequestBody } from "./anthropic-transport";
import type { Message } from "@mariozechner/pi-ai";
import type { AgentRunConfig } from "@mariozechner/pi-agent";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeMessage(role: Message["role"], content: Message["content"]): Message {
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

// ─── Group A — parseSseLine ──────────────────────────────────────────────────

describe("parseSseLine — SSE 行解析", () => {
  it("A1: 空字符串返回 {}", () => {
    expect(parseSseLine("")).toEqual({});
  });

  it("A2: 'event: message_start' → { event: 'message_start' }", () => {
    expect(parseSseLine("event: message_start")).toEqual({ event: "message_start" });
  });

  it("A3: 'data: {\"a\":1}' → { data: '{\"a\":1}' }", () => {
    expect(parseSseLine('data: {"a":1}')).toEqual({ data: '{"a":1}' });
  });

  it("A4: 'data:{\"a\":1}' (无空格) → { data: '{\"a\":1}' }", () => {
    expect(parseSseLine('data:{"a":1}')).toEqual({ data: '{"a":1}' });
  });

  it("A5: 随机文本 'foo' → {} (无冒号)", () => {
    expect(parseSseLine("foo")).toEqual({});
  });
});

// ─── Group B — buildRequestBody ───────────────────────────────────────────────

describe("buildRequestBody — Anthropic 请求体构造", () => {
  it("B1: user role + string content → role:'user', content:string", () => {
    const model = { id: "test-model" };
    const messages: Message[] = [makeMessage("user", "hello world")];
    const result = buildRequestBody(model, "system", messages, []);
    expect(result.messages[0]).toMatchObject({ role: "user", content: "hello world" });
  });

  it("B2: user role + object content → JSON.stringify fallback", () => {
    const model = { id: "test-model" };
    const messages: Message[] = [makeMessage("user", [{ type: "text", text: "hi" }])];
    const result = buildRequestBody(model, "system", messages, []);
    expect(result.messages[0].content).toBe(JSON.stringify([{ type: "text", text: "hi" }]));
  });

  it("B3: assistant role + text block → content:[{type:'text',...}]", () => {
    const model = { id: "test-model" };
    const assistantMsg = makeMessage("assistant", [{ type: "text", text: "hi" }]);
    const messages: Message[] = [assistantMsg];
    const result = buildRequestBody(model, "system", messages, []);
    expect(result.messages[0]).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "hi" }],
    });
  });

  it("B4: assistant role + toolCall block (id,name,arguments) → content:[{type:'tool_use',...}]", () => {
    const model = { id: "test-model" };
    const assistantMsg = makeMessage("assistant", [
      { type: "toolCall", id: "tc-1", name: "read_file", arguments: { path: "/a" } },
    ]);
    const messages: Message[] = [assistantMsg];
    const result = buildRequestBody(model, "system", messages, []);
    expect(result.messages[0]).toMatchObject({
      role: "assistant",
      content: [
        { type: "tool_use", id: "tc-1", name: "read_file", input: { path: "/a" } },
      ],
    });
  });

  it("B5: assistant role + EMPTY blocks array → 不推进", () => {
    const model = { id: "test-model" };
    const assistantMsg = makeMessage("assistant", []);
    const messages: Message[] = [makeMessage("user", "hello"), assistantMsg];
    const result = buildRequestBody(model, "system", messages, []);
    // only the user message should be present
    expect(result.messages.length).toBe(1);
    expect(result.messages[0].role).toBe("user");
  });

  it("B6: toolResult role → role:'user', content:[{type:'tool_result',...}]", () => {
    const model = { id: "test-model" };
    const toolResultMsg = makeMessage("toolResult", [
      { type: "text", text: "file content" },
    ]) as Message & { toolCallId: string; isError?: boolean };
    toolResultMsg.toolCallId = "tc-1";
    const messages: Message[] = [toolResultMsg];
    const result = buildRequestBody(model, "system", messages, []);
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

  it("B7: tools = [{ name, description, parameters }] → input_schema = parameters", () => {
    const model = { id: "test-model" };
    const tools = [
      {
        name: "read_file",
        description: "read a file",
        parameters: { type: "object", properties: { path: { type: "string" } } },
      },
    ];
    const result = buildRequestBody(model, "system", [], tools as unknown as AgentRunConfig["tools"]);
    expect(result.tools).toMatchObject([
      {
        name: "read_file",
        description: "read a file",
        input_schema: { type: "object", properties: { path: { type: "string" } } },
      },
    ]);
  });

  it("B8: tools = [] → 省略 'tools' key", () => {
    const model = { id: "test-model" };
    const result = buildRequestBody(model, "system", [], []);
    expect("tools" in result).toBe(false);
  });

  it("B9: model.maxTokens undefined → max_tokens = 8192", () => {
    const model = { id: "test-model" };
    const result = buildRequestBody(model, "system", [], []);
    expect(result.max_tokens).toBe(8192);
  });
});

// ─── Group C — streamTurn HTTP error ─────────────────────────────────────────

// NOTE: streamTurn HTTP error path (C1) not testable in jsdom because
// vi.spyOn(globalThis, "fetch") cannot intercept jsdom's fetch implementation.
// Per task fallback strategy, coverage from mockStreamTurn + run() + parseSseLine
// + buildRequestBody should reach ≥90%.

// ─── Group D — mockStreamTurn ────────────────────────────────────────────────

describe("mockStreamTurn — Mock 模式流", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let g: any;
  beforeEach(() => {
    g = globalThis as unknown as { __MOCK_LLM_QUEUE__?: unknown[] };
    g.__MOCK_LLM_QUEUE__ = [];
  });
  afterEach(() => {
    g.__MOCK_LLM_QUEUE__ = [];
  });

  it("D1: __MOCK_LLM_QUEUE__ 空 → 警告 + 输出 'no canned response queued' 文本", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const transport = new AnthropicTransport({ getApiKey: async () => "test-key" });

    const events: unknown[] = [];
    const gen = transport.run(
      [],
      makeMessage("user", "hi"),
      {
        model: { id: "mock-model", baseUrl: "mock://test", maxTokens: 100 },
        systemPrompt: "",
        tools: [],
      } as unknown as AgentRunConfig,
    );
    for await (const evt of gen) {
      events.push(evt);
    }

    const textEvents = events.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e: any) => e.type === "message_update" && e.message?.content?.[0]?.text?.includes("no canned response"),
    );
    expect(textEvents.length).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });

  it("D2: 队列仅含 text → 分块输出 (每次 4 字符)", async () => {
    const transport = new AnthropicTransport({ getApiKey: async () => "test-key" });
    g.__MOCK_LLM_QUEUE__ = [{ text: "hello" }];

    const events: unknown[] = [];
    const gen = transport.run(
      [],
      makeMessage("user", "hi"),
      {
        model: { id: "mock-model", baseUrl: "mock://test", maxTokens: 100 },
        systemPrompt: "",
        tools: [],
      } as unknown as AgentRunConfig,
    );
    for await (const evt of gen) {
      events.push(evt);
    }

    // Should have multiple message_update events (chunked)
    const updates = events.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e: any) => e.type === "message_update",
    );
    expect(updates.length).toBeGreaterThan(1);
    // Final message should have the complete text
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastUpdate = updates[updates.length - 1] as any;
    expect(lastUpdate.message.content[0].text).toBe("hello");
  });

  it("D3: 队列含 toolCalls → 输出带 mock_tool_ id 的 toolCall blocks", async () => {
    const transport = new AnthropicTransport({ getApiKey: async () => "test-key" });
    g.__MOCK_LLM_QUEUE__ = [{ toolCalls: [{ name: "read_file", input: { path: "/a" } }] }];

    const events: unknown[] = [];
    const gen = transport.run(
      [],
      makeMessage("user", "hi"),
      {
        model: { id: "mock-model", baseUrl: "mock://test", maxTokens: 100 },
        systemPrompt: "",
        tools: [{ name: "read_file", description: "", parameters: {} }],
      } as unknown as AgentRunConfig,
    );
    for await (const evt of gen) {
      events.push(evt);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolCalls = events.filter((e: any) =>
      e.type === "message_update" &&
      e.message?.content?.some?.((b: any) => b.type === "toolCall"),
    );
    expect(toolCalls.length).toBeGreaterThan(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastUpdate = toolCalls[toolCalls.length - 1] as any;
    const toolBlock = lastUpdate.message.content.find((b: any) => b.type === "toolCall");
    expect(toolBlock.name).toBe("read_file");
    expect(toolBlock.id).toMatch(/^mock_tool_/);
  });

  it("D4: mockStreamTurn toolCalls 循环中 signal.aborted 路径", async () => {
    // Pass an already-aborted signal to exercise the signal?.aborted check branch in toolCalls loop
    const ctrl = new AbortController();
    ctrl.abort();
    const transport = new AnthropicTransport({ getApiKey: async () => "test-key", signal: ctrl.signal });
    g.__MOCK_LLM_QUEUE__ = [{ toolCalls: [{ name: "read_file", input: {} }] }];

    const gen = transport.run(
      [],
      makeMessage("user", "hi"),
      {
        model: { id: "mock-model", baseUrl: "mock://test", maxTokens: 100 },
        systemPrompt: "",
        tools: [{ name: "read_file", description: "read", parameters: {} }],
      } as unknown as AgentRunConfig,
    );

    // With already-aborted signal, mockStreamTurn yields message_start (before loop),
    // then throws AbortError when entering the toolCalls loop (signal check).
    // The for-await-of catches this as a terminal error — that's the signal.aborted branch.
    await expect(async () => {
      for await (const _evt of gen) { /* consume */ }
    }).rejects.toThrow("Aborted");
  });
});

// ─── Group E — simulateChunkDelay (via mockStreamTurn abort path) ───────────

describe("simulateChunkDelay", () => {
  it("E1: ms=0 → 立即 resolve", async () => {
    const transport = new AnthropicTransport({ getApiKey: async () => "test-key" });
    const w = globalThis as unknown as { __MOCK_LLM_QUEUE__?: unknown[] };
    // delayMs=0 triggers the early return path in simulateChunkDelay
    w.__MOCK_LLM_QUEUE__ = [{ text: "a", delayMs: 0 }];

    const start = Date.now();
    const gen = transport.run(
      [],
      makeMessage("user", "hi"),
      {
        model: { id: "mock-model", baseUrl: "mock://test", maxTokens: 100 },
        systemPrompt: "",
        tools: [],
      } as unknown as AgentRunConfig,
    );
    for await (const _ of gen) { /* consume */ }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(20);
  });

  it("E2: ms>0 + 已 abort 的 signal → signal.aborted 检查路径", async () => {
    // With already-aborted signal, signal?.aborted returns true → throw in loop
    // jsdom: abort event only fires when abort() called AFTER addEventListener
    const ctrl = new AbortController();
    ctrl.abort();
    const transport = new AnthropicTransport({ getApiKey: async () => "test-key", signal: ctrl.signal });
    const w = globalThis as unknown as { __MOCK_LLM_QUEUE__?: unknown[] };
    w.__MOCK_LLM_QUEUE__ = [{ text: "hello", delayMs: 100 }];

    const gen = transport.run(
      [],
      makeMessage("user", "hi"),
      {
        model: { id: "mock-model", baseUrl: "mock://test", maxTokens: 100 },
        systemPrompt: "",
        tools: [],
      } as unknown as AgentRunConfig,
    );

    // The for-await-of catches any terminal error (AbortError throws)
    let caught = false;
    try {
      for await (const _ of gen) { /* consume */ }
    } catch (e) {
      caught = true;
      expect((e as Error).message).toMatch(/AbortError|abort/i);
    }
    // Either we caught an error from the aborted signal, or loop ended normally
    // Either way, the signal.aborted branch was exercised
    expect(caught).toBe(true);
  });
});

// ─── Group F — run() agent loop ──────────────────────────────────────────────

describe("run() agent loop — Agent 主循环", () => {
  it("F1: 无 apiKey (getApiKey 返回 undefined) → 抛出 'AnthropicTransport: 缺 apiKey'", async () => {
    const transport = new AnthropicTransport({ getApiKey: async () => undefined });
    const gen = transport.run(
      [],
      makeMessage("user", "hi"),
      {
        model: { id: "model", baseUrl: "https://api.test", maxTokens: 100 },
        systemPrompt: "",
        tools: [],
      } as unknown as AgentRunConfig,
    );
    await expect(() => gen.next()).rejects.toThrow("AnthropicTransport: 缺 apiKey");
  });

  it("F2: mock 模式单轮，无 tool calls → 输出 agent_start → ... → agent_end", async () => {
    const w = globalThis as unknown as { __MOCK_LLM_QUEUE__?: unknown[] };
    w.__MOCK_LLM_QUEUE__ = [{ text: "hello" }];

    const transport = new AnthropicTransport({ getApiKey: async () => "test-key" });
    const events: unknown[] = [];
    const gen = transport.run(
      [],
      makeMessage("user", "hi"),
      {
        model: { id: "mock-model", baseUrl: "mock://test", maxTokens: 100 },
        systemPrompt: "",
        tools: [],
      } as unknown as AgentRunConfig,
    );
    for await (const evt of gen) {
      events.push(evt);
    }

    const types = events.map((e: unknown) => (e as { type?: string }).type);
    expect(types).toContain("agent_start");
    expect(types).toContain("agent_end");
    expect(types).toContain("turn_start");
    expect(types).toContain("turn_end");
    // Should NOT have tool_execution events
    expect(types).not.toContain("tool_execution_start");
  });

  it("F3: tool 执行成功 → tool_execution_start/end + toolResult 在 currentMessages 中", async () => {
    const w = globalThis as unknown as { __MOCK_LLM_QUEUE__?: unknown[] };
    w.__MOCK_LLM_QUEUE__ = [
      { toolCalls: [{ name: "read_file", input: { path: "/a" } }] },
    ];

    const readFileTool = {
      name: "read_file",
      description: "read a file",
      parameters: { type: "object" },
      execute: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "file contents" }] }),
    };

    const transport = new AnthropicTransport({ getApiKey: async () => "test-key" });
    const events: unknown[] = [];
    const gen = transport.run(
      [],
      makeMessage("user", "read the file"),
      {
        model: { id: "mock-model", baseUrl: "mock://test", maxTokens: 100 },
        systemPrompt: "",
        tools: [readFileTool],
      } as unknown as AgentRunConfig,
    );
    for await (const evt of gen) {
      events.push(evt);
    }

    const types = events.map((e: unknown) => (e as { type?: string }).type);
    expect(types).toContain("tool_execution_start");
    expect(types).toContain("tool_execution_end");
    expect(readFileTool.execute).toHaveBeenCalled();

    // Final agent_end should carry the tool result in messages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentEnd = events.find((e: any) => e.type === "agent_end") as any;
    expect(agentEnd).toBeDefined();
    expect(agentEnd.messages.length).toBeGreaterThan(0);
  });

  it("F4: tool 执行抛出异常 → tool_execution_end 中 isError=true", async () => {
    const w = globalThis as unknown as { __MOCK_LLM_QUEUE__?: unknown[] };
    w.__MOCK_LLM_QUEUE__ = [
      { toolCalls: [{ name: "read_file", input: { path: "/a" } }] },
    ];

    const readFileTool = {
      name: "read_file",
      description: "read a file",
      parameters: { type: "object" },
      execute: vi.fn().mockRejectedValue(new Error("file not found")),
    };

    const transport = new AnthropicTransport({ getApiKey: async () => "test-key" });
    const events: unknown[] = [];
    const gen = transport.run(
      [],
      makeMessage("user", "read the file"),
      {
        model: { id: "mock-model", baseUrl: "mock://test", maxTokens: 100 },
        systemPrompt: "",
        tools: [readFileTool],
      } as unknown as AgentRunConfig,
    );
    for await (const evt of gen) {
      events.push(evt);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolEnd = events.find((e: any) => e.type === "tool_execution_end") as any;
    expect(toolEnd.isError).toBe(true);
  });

  it("F5: 达到 MAX_TURNS=16 (队列 17 轮) → 终止并警告", async () => {
    const w = globalThis as unknown as { __MOCK_LLM_QUEUE__?: unknown[] };
    // 17 tool calls = 17 turns (exceeds MAX_TURNS=16)
    w.__MOCK_LLM_QUEUE__ = Array.from({ length: 17 }, (_, i) => ({
      toolCalls: [{ name: "read_file", input: { path: `/a${i}` } }],
    }));

    const readFileTool = {
      name: "read_file",
      description: "read a file",
      parameters: { type: "object" },
      execute: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] }),
    };

    vi.spyOn(console, "warn").mockImplementation(() => {});

    const transport = new AnthropicTransport({ getApiKey: async () => "test-key" });
    const events: unknown[] = [];
    const gen = transport.run(
      [],
      makeMessage("user", "read files"),
      {
        model: { id: "mock-model", baseUrl: "mock://test", maxTokens: 100 },
        systemPrompt: "",
        tools: [readFileTool],
      } as unknown as AgentRunConfig,
    );
    for await (const evt of gen) {
      events.push(evt);
    }

    // Should have been terminated before 17th turn
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const turnStarts = events.filter((e: any) => e.type === "turn_start");
    expect(turnStarts.length).toBeLessThanOrEqual(16);

    // Should have warned about MAX_TURNS
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("MAX_TURNS"),
    );
    vi.restoreAllMocks();
  });

  it("F6: tool 未找到 → tool_execution_end 置 isError=true", async () => {
    const w = globalThis as unknown as { __MOCK_LLM_QUEUE__?: unknown[] };
    // Queue a toolCall for "unknown_tool" but DON'T include it in tools array
    w.__MOCK_LLM_QUEUE__ = [
      { toolCalls: [{ name: "unknown_tool", input: { arg: 1 } }] },
    ];

    const transport = new AnthropicTransport({ getApiKey: async () => "test-key" });
    const events: unknown[] = [];
    const gen = transport.run(
      [],
      makeMessage("user", "do something"),
      {
        model: { id: "mock-model", baseUrl: "mock://test", maxTokens: 100 },
        systemPrompt: "",
        tools: [], // No tools registered
      } as unknown as AgentRunConfig,
    );
    for await (const evt of gen) {
      events.push(evt);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolEnd = events.find((e: any) => e.type === "tool_execution_end") as any;
    expect(toolEnd).toBeDefined();
    expect(toolEnd.isError).toBe(true);
    expect(toolEnd.result).toContain("not found");
  });
});

// ─── Group G — streamTurn real HTTP path (mocked fetch + ReadableStream) ──────

/** Build a ReadableStream from a string (UTF-8). */
function makeSseStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

describe("streamTurn real HTTP path — 真实 HTTP 路径 (mocked fetch + ReadableStream)", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    if (fetchSpy) {
      fetchSpy.mockRestore();
    }
  });

  it("G1: response.ok=false → 抛出 'Anthropic API {status}'", async () => {
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("error body", { status: 500 }) as unknown as Response);

    const transport = new AnthropicTransport({ getApiKey: async () => "test-key" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const streamTurn = (transport as any).streamTurn.bind(transport);

    const gen = streamTurn(
      "test-key",
      "https://api.test",
      { id: "test-model" },
      "system",
      [],
      undefined,
      undefined,
    );

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of gen) {
        /* consume */
      }
    }).rejects.toThrow("Anthropic API 500");
  });

  it("G2: 完整 SSE 正常路径 → message_start + content_block_start (text) + deltas + content_block_stop + message_delta + message_stop", async () => {
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

    const transport = new AnthropicTransport({ getApiKey: async () => "test-key" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const streamTurn = (transport as any).streamTurn.bind(transport);

    const events: unknown[] = [];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const evt of streamTurn("test-key", "https://api.test", { id: "m" }, "", [], undefined, undefined)) {
      events.push(evt);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const types = events.map((e: any) => e.type);
    expect(types).toContain("message_start");
    expect(types).toContain("message_update");
    expect(types).toContain("message_end");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastUpdate = [...events].reverse().find((e: any) => e.type === "message_update") as any;
    expect(lastUpdate.message.content[0].text).toBe("hello world");
    expect(lastUpdate.message.stopReason).toBe("end_turn");
  });

  it("G3: tool_use 解析 — content_block_start(tool_use) + input_json_delta × N + content_block_stop", async () => {
    const sse =
      "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"tool_use\",\"id\":\"tc_1\",\"name\":\"read_file\"}}\n\n" +
      "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"path\\\":\"}}\n\n" +
      "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"\\\"/a\\\"}\"}}\n\n" +
      "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n" +
      "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n";
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(makeSseStream(sse), { status: 200 }) as unknown as Response);

    const transport = new AnthropicTransport({ getApiKey: async () => "test-key" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const streamTurn = (transport as any).streamTurn.bind(transport);

    const events: unknown[] = [];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const evt of streamTurn("test-key", "https://api.test", { id: "m" }, "", [], undefined, undefined)) {
      events.push(evt);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastUpdate = [...events].reverse().find((e: any) => e.type === "message_update") as any;
    expect(lastUpdate.message.content[0]).toMatchObject({
      type: "toolCall",
      id: "tc_1",
      name: "read_file",
    });
    expect(lastUpdate.message.content[0].arguments).toEqual({ path: "/a" });
  });

  it("G4: sseDataBuf 中无效 JSON → 捕获 + sseDataBuf 重置 (无抛出)", async () => {
    // Empty line triggers JSON parse, invalid JSON → catch branch (line 261-264)
    const sse = "event: garbage\ndata: not-valid-json\n\n" + "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n";
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(makeSseStream(sse), { status: 200 }) as unknown as Response);

    const transport = new AnthropicTransport({ getApiKey: async () => "test-key" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const streamTurn = (transport as any).streamTurn.bind(transport);

    const events: unknown[] = [];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const evt of streamTurn("test-key", "https://api.test", { id: "m" }, "", [], undefined, undefined)) {
      events.push(evt);
    }
    // Should NOT throw; invalid JSON is swallowed
    expect(events.length).toBeGreaterThan(0);
  });

  it("G5: tool_use 参数为无效 JSON → parsedArgs = {} (第 322-324 行 catch)", async () => {
    const sse =
      "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"tool_use\",\"id\":\"tc_1\",\"name\":\"x\"}}\n\n" +
      "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"not-valid-json\"}}\n\n" +
      "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n" +
      "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n";
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(makeSseStream(sse), { status: 200 }) as unknown as Response);

    const transport = new AnthropicTransport({ getApiKey: async () => "test-key" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const streamTurn = (transport as any).streamTurn.bind(transport);

    const events: unknown[] = [];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const evt of streamTurn("test-key", "https://api.test", { id: "m" }, "", [], undefined, undefined)) {
      events.push(evt);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastUpdate = [...events].reverse().find((e: any) => e.type === "message_update") as any;
    expect(lastUpdate.message.content[0].arguments).toEqual({});
  });

  it("G6: thinking block — content_block_start(thinking) + thinking_delta + content_block_stop", async () => {
    const sse =
      "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"thinking\"}}\n\n" +
      "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"hmm\"}}\n\n" +
      "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n" +
      "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n";
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(makeSseStream(sse), { status: 200 }) as unknown as Response);

    const transport = new AnthropicTransport({ getApiKey: async () => "test-key" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const streamTurn = (transport as any).streamTurn.bind(transport);

    const events: unknown[] = [];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const evt of streamTurn("test-key", "https://api.test", { id: "m" }, "", [], undefined, undefined)) {
      events.push(evt);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastUpdate = [...events].reverse().find((e: any) => e.type === "message_update") as any;
    expect(lastUpdate.message.content[0]).toMatchObject({ type: "thinking" });
  });

  it("G7: response.body=null → 抛出 'Anthropic API {status}' (early return)", async () => {
    // Use a plain object that has ok=true but body=null
    const mockResp = { ok: true, status: 200, body: null, text: async () => "" };
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(mockResp as unknown as Response);

    const transport = new AnthropicTransport({ getApiKey: async () => "test-key" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const streamTurn = (transport as any).streamTurn.bind(transport);

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of streamTurn("test-key", "https://api.test", { id: "m" }, "", [], undefined, undefined)) {
        /* consume */
      }
    }).rejects.toThrow("Anthropic API 200");
  });
});
