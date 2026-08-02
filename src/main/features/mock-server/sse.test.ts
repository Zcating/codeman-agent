// sse.test.ts — buildSseTurnEvents / buildSseEvents 的 unit 测试(拆自 src/main/mock-server.test.ts)
import { describe, it, expect } from "vitest";
import { buildSseEvents, buildSseTurnEvents } from "./sse";
import type { QaTurn } from "./qa-loader";

describe("buildSseTurnEvents — per-character SSE 流构造", () => {
  it("T7a: 输入 N chars → 返回 (5 + N) 个 SSE events", () => {
    const events = buildSseTurnEvents({ text: "abc" }, 1);
    expect(events.length).toBe(8);
    expect(events[0]).toContain("event: message_start");
    expect(events[1]).toContain("event: content_block_start");
    expect(events[2]).toContain('"text":"a"');
    expect(events[3]).toContain('"text":"b"');
    expect(events[4]).toContain('"text":"c"');
    expect(events[5]).toContain("event: content_block_stop");
    expect(events[6]).toContain('"stop_reason":"end_turn"');
    expect(events[7]).toContain("event: message_stop");
  });

  it("T7b: deltaSize=3 → 每个 event 包含 3 chars,共 ceil(N/3) deltas", () => {
    const events = buildSseTurnEvents({ text: "abcdefg" }, 3);
    expect(events.length).toBe(8);
    expect(events[2]).toContain('"text":"abc"');
    expect(events[3]).toContain('"text":"def"');
    expect(events[4]).toContain('"text":"g"');
  });

  it("T7c: 空字符串 → 3 events (无 text/thinking/tool block,只 message_start/delta/stop)", () => {
    const events = buildSseTurnEvents({ text: "" }, 1);
    expect(events.length).toBe(3);
    const hasDelta = events.some((e) => e.includes("content_block_delta"));
    expect(hasDelta).toBe(false);
  });

  it("T7d: 每个 event 以 \\n\\n 结尾 (SSE separator)", () => {
    const events = buildSseTurnEvents({ text: "hi" }, 1);
    for (const evt of events) {
      expect(evt.endsWith("\n\n")).toBe(true);
    }
  });


  it("T7e: thinking-only turn → 7 events (thinking block at idx 0 + message wrappers, no text)", () => {
    const events = buildSseTurnEvents({ text: "", thinking: "Let me think..." }, 1);
    expect(events.length).toBe(7);
    expect(events[1]).toContain('"type":"thinking"');
    expect(events[2]).toContain('"thinking_delta"');
    expect(events[2]).toContain('"Let me think..."');
    expect(events[3]).toContain('"signature_delta"');
    expect(events[4]).toContain('"content_block_stop"');
    expect(events.join("")).not.toContain('"type":"text"');
    expect(events[5]).toContain('"stop_reason":"end_turn"');
  });

  it("T7f: toolUses only (no text, no thinking) → 6 events (tool_use block at idx 0)", () => {
    const events = buildSseTurnEvents(
      {
        text: "",
        toolUses: [{ name: "read_file", input: { path: "README.md" } }],
      },
      1,
    );
    expect(events.length).toBe(6);
    expect(events[1]).toContain('"type":"tool_use"');
    expect(events[1]).toContain('"name":"read_file"');
    expect(events[1]).toContain('"id":"toolu_mock_0_');
    expect(events[2]).toContain('"input_json_delta"');
    const dataLine = (events[2].match(/^data: (.+)$/m) ?? [undefined, ""])[1];
    const partialParsed = JSON.parse(dataLine) as {
      delta: { partial_json: string };
    };
    expect(JSON.parse(partialParsed.delta.partial_json)).toEqual({ path: "README.md" });
    expect(events[3]).toContain('"content_block_stop"');
    expect(events[4]).toContain('"stop_reason":"tool_use"');
  });

  it("T7g: thinking + text + toolUses (full) → 14 events (4 + 4 + 3 + 3 wrappers)", () => {
    const events = buildSseTurnEvents(
      {
        text: "ok",
        thinking: "hmm",
        toolUses: [{ name: "ping_tool", input: { k: "v" } }],
      },
      1,
    );
    expect(events.length).toBe(14);
    expect(events[1]).toContain('"index":0');
    expect(events[1]).toContain('"type":"thinking"');
    expect(events[2]).toContain('"thinking_delta"');
    expect(events[3]).toContain('"signature_delta"');
    expect(events[4]).toContain('"content_block_stop"');
    expect(events[4]).toContain('"index":0');
    expect(events[5]).toContain('"index":1');
    expect(events[5]).toContain('"type":"text"');
    expect(events[6]).toContain('"text":"o"');
    expect(events[7]).toContain('"text":"k"');
    expect(events[8]).toContain('"index":1');
    expect(events[9]).toContain('"index":2');
    expect(events[9]).toContain('"type":"tool_use"');
    expect(events[9]).toContain('"name":"ping_tool"');
    expect(events[10]).toContain('"input_json_delta"');
    expect(events[11]).toContain('"index":2');
    expect(events[12]).toContain('"stop_reason":"tool_use"');
  });


  it("T7i: message_delta includes input_tokens in usage (greater than 0)", () => {
    const turn: QaTurn = { text: "Hello world, this is a test response", thinking: "Let me think about this carefully" };
    const events = buildSseTurnEvents(turn, 100);
    const deltaEvent = events.find(e => e.includes('"message_delta"'));
    expect(deltaEvent).toBeDefined();
    const dataLine = (deltaEvent!.match(/^data: (.+)$/m) ?? [undefined, ""])[1];
    const parsed = JSON.parse(dataLine) as { usage: { input_tokens?: number; output_tokens: number } };
    expect(parsed.usage.input_tokens).toBeDefined();
    expect(parsed.usage.input_tokens).toBeGreaterThan(0);
  });

  it("T7j: message_delta usage has both input_tokens and output_tokens", () => {
    const turn: QaTurn = { text: "Response text" };
    const events = buildSseTurnEvents(turn, 10);
    const deltaEvent = events.find(e => e.includes('"message_delta"'));
    expect(deltaEvent).toBeDefined();
    const dataLine = (deltaEvent!.match(/^data: (.+)$/m) ?? [undefined, ""])[1];
    const parsed = JSON.parse(dataLine) as { usage: { input_tokens?: number; output_tokens: number } };
    expect(parsed.usage.input_tokens).toBeGreaterThan(0);
    expect(parsed.usage.output_tokens).toBe(turn.text.length);
  });

  it("T7h: buildSseEvents(entry, delta) 等价于 buildSseTurnEvents(entry.turns[0], delta)", () => {
    const entry = {
      question: "demo",
      turns: [{ text: "hello" }, { text: "world" }],
    };
    const fromEntry = buildSseEvents(entry, 1);
    const fromTurn = buildSseTurnEvents(entry.turns[0], 1);
    expect(fromEntry.length).toBe(fromTurn.length);
    for (let i = 0; i < fromEntry.length; i++) {
      const norm = (s: string) => s.replace(/"id":"msg_mock_[0-9]+"/g, '"id":"X"');
      expect(norm(fromEntry[i])).toBe(norm(fromTurn[i]));
    }
  });
});
