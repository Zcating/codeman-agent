// http-handler.test.ts — handleRequest 的 end-to-end 集成测试(拆自 src/main/mock-server.test.ts)
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync } from "node:fs";
import { loadQaTable, resetQaLoaderForTest } from "./qa-loader";
import { startMockServerForTest } from "./__test-helpers__/lifecycle";
import type { MockServerTestContext } from "./__test-helpers__/lifecycle";

describe("mock-server HTTP — POST /mock/anthropic/v1/messages", () => {
  let ctx: MockServerTestContext;
  let qaPath: string;
  const TEST_PORT = 50003;
  const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

  beforeAll(async () => {
    ctx = await startMockServerForTest(TEST_PORT);
    qaPath = ctx.qaPath;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("T23: single-turn entry WITHOUT done + asstCount>=1 → serves turns[0] AGAIN (capped, no short-circuit — legacy loop behavior)", async () => {
    writeFileSync(
      qaPath,
      JSON.stringify([
        {
          question: "tool",
          turns: [
            {
              text: "Reading the file now.",
              toolUses: [{ name: "read_file", input: { path: "README.md" } }],
            },
          ],
        },
      ]),
    );
    resetQaLoaderForTest();
    loadQaTable();

    const res = await fetch(`${BASE_URL}/mock/anthropic/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "m",
        messages: [
          { role: "user", content: "tool" },
          { role: "assistant", content: [{ type: "tool_use", name: "read_file", input: { path: "x" } }] },
          { role: "toolResult", content: [{ type: "text", text: "result of read_file" }] },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('"text":"R"');
    expect(body).toContain('"text":"i"');
    expect(body).toContain('"text":"n"');
    expect(body).toContain('"text":"g"');
    expect((body.match(/"text":"[A-Za-z. ]"/g) ?? []).length).toBe(21);
    expect(body).not.toContain("(mock) Script complete.");
    expect(body).not.toContain("(mock) Tool execution acknowledged");
    expect(body).toContain('"type":"tool_use"');
    expect(body).toContain('"name":"read_file"');
    expect(body).toContain('"stop_reason":"tool_use"');
  });

  it("T28a: single-turn entry WITH done:true + asstCount>=1 → synthesize end_turn '(mock) Script complete.'", async () => {
    writeFileSync(
      qaPath,
      JSON.stringify([
        {
          question: "tool",
          turns: [
            {
              text: "Reading the file now.",
              toolUses: [{ name: "read_file", input: { path: "README.md" } }],
              done: true,
            },
          ],
        },
      ]),
    );
    resetQaLoaderForTest();
    loadQaTable();

    const res = await fetch(`${BASE_URL}/mock/anthropic/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "m",
        messages: [
          { role: "user", content: "tool" },
          { role: "assistant", content: [{ type: "tool_use", name: "read_file", input: { path: "x" } }] },
          { role: "user", content: [{ type: "tool_result", tool_use_id: "tc-1", content: "result of read_file" }] },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('"text":"(mock) Script complete."');
    expect((body.match(/\(mock\) Script complete\./g) ?? []).length).toBe(1);
    expect(body).not.toContain('"type":"tool_use"');
    expect(body).not.toContain('"name":"read_file"');
    expect(body).toContain('"stop_reason":"end_turn"');
  });

  it("T28a-thinking: short-circuit 保留 lastTurn.thinking(让 UI 看到 thinking block,不丢 reasoning)", async () => {
    writeFileSync(
      qaPath,
      JSON.stringify([
        {
          question: "tool",
          turns: [
            {
              thinking: "I called read_file on README.md. Now synthesizing final answer.",
              text: "Reading the file now.",
              toolUses: [{ name: "read_file", input: { path: "README.md" } }],
              done: true,
            },
          ],
        },
      ]),
    );
    resetQaLoaderForTest();
    loadQaTable();

    const res = await fetch(`${BASE_URL}/mock/anthropic/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "m",
        messages: [
          { role: "user", content: "tool" },
          { role: "assistant", content: [{ type: "tool_use", name: "read_file", input: { path: "x" } }] },
          { role: "user", content: [{ type: "tool_result", tool_use_id: "tc-1", content: "result of read_file" }] },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('"text":"(mock) Script complete."');
    expect(body).toContain('"type":"thinking_delta"');
    expect(body).toContain(
      '"thinking":"I called read_file on README.md. Now synthesizing final answer."',
    );
    const thinkingIdx = body.indexOf('"type":"thinking_delta"');
    const textIdx = body.indexOf('"text":"(mock) Script complete."');
    expect(thinkingIdx).toBeGreaterThan(-1);
    expect(textIdx).toBeGreaterThan(thinkingIdx);
  });

  it("T28b: single-turn entry WITH done:true + asstCount=0 (initial request) → still serves turns[0] (短对话不触发)", async () => {
    writeFileSync(
      qaPath,
      JSON.stringify([
        {
          question: "tool",
          turns: [
            {
              text: "Reading the file now.",
              toolUses: [{ name: "read_file", input: { path: "README.md" } }],
              done: true,
            },
          ],
        },
      ]),
    );
    resetQaLoaderForTest();
    loadQaTable();

    const res = await fetch(`${BASE_URL}/mock/anthropic/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "m",
        messages: [{ role: "user", content: "tool" }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('"text":"R"');
    expect(body).toContain('"type":"tool_use"');
    expect(body).toContain('"name":"read_file"');
    expect(body).toContain('"stop_reason":"tool_use"');
    expect(body).not.toContain("(mock) Script complete.");
  });
});
