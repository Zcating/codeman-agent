// http-handler.test.ts — handleRequest 的 end-to-end 集成测试(拆自 src/main/mock-server.test.ts)
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync } from "node:fs";
import { loadQaTable, resetQaLoaderForTest } from "./qa-loader";
import { startMockServerForTest } from "./__test-helpers__/lifecycle";
import type { MockServerTestContext } from "./__test-helpers__/lifecycle";

describe("mock-server HTTP — POST /mock/anthropic/v1/messages", () => {
  let ctx: MockServerTestContext;
  let qaPath: string;
  const TEST_PORT = 50002;
  const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

  beforeAll(async () => {
    ctx = await startMockServerForTest(TEST_PORT);
    qaPath = ctx.qaPath;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("T20: POST + 'think' entry → SSE with thinking_delta + signature_delta, no text block, stop_reason=end_turn", async () => {
    writeFileSync(
      qaPath,
      JSON.stringify([
        {
          question: "think",
          turns: [{ text: "", thinking: "Let me think carefully about this." }],
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
        messages: [{ role: "user", content: "think" }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('"type":"thinking"');
    expect(body).toContain('"thinking_delta"');
    expect(body).toContain("Let me think carefully about this.");
    expect(body).toContain('"signature_delta"');
    expect(body).not.toContain('"type":"text"');
    expect(body).toContain('"stop_reason":"end_turn"');

    writeFileSync(
      qaPath,
      JSON.stringify([
        { question: "hello", turns: [{ text: "world" }] },
        { question: "ping", turns: [{ text: "pong" }] },
        { question: "*", turns: [{ text: "default-text" }], default: true },
      ]),
    );
    resetQaLoaderForTest();
    loadQaTable();
  });

  it("T21: POST + 'tool' entry → SSE with tool_use block, stop_reason=tool_use", async () => {
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
        messages: [{ role: "user", content: "tool" }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('"type":"text"');
    expect((body.match(/"text":"[A-Za-z]"/g) ?? []).length).toBe(17);
    expect(body).toContain('"type":"tool_use"');
    expect(body).toContain('"name":"read_file"');
    expect(body).toContain('"id":"toolu_mock_1_');
    expect(body).toContain('"input_json_delta"');
    expect(body).toContain("README.md");
    expect(body).toContain('"stop_reason":"tool_use"');
    expect(body).not.toContain('"stop_reason":"end_turn"');

    writeFileSync(
      qaPath,
      JSON.stringify([
        { question: "hello", turns: [{ text: "world" }] },
        { question: "ping", turns: [{ text: "pong" }] },
        { question: "*", turns: [{ text: "default-text" }], default: true },
      ]),
    );
    resetQaLoaderForTest();
    loadQaTable();
  });

  it("T22: POST + 'three-blocks' entry → SSE with thinking + text + tool_use (all 3 blocks)", async () => {
    writeFileSync(
      qaPath,
      JSON.stringify([
        {
          question: "three-blocks",
          turns: [
            {
              text: "ok",
              thinking: "hmm",
              toolUses: [{ name: "search_files", input: { pattern: "*.ts" } }],
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
        messages: [{ role: "user", content: "three-blocks" }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('"thinking_delta"');
    expect(body).toContain('"type":"text"');
    expect(body).toContain('"type":"tool_use"');
    expect(body).toContain('"name":"search_files"');
    expect(body).toContain("*.ts");
    expect(body).toContain("search_files");
    expect(body).toContain('"stop_reason":"tool_use"');

    writeFileSync(
      qaPath,
      JSON.stringify([
        { question: "hello", turns: [{ text: "world" }] },
        { question: "ping", turns: [{ text: "pong" }] },
        { question: "*", turns: [{ text: "default-text" }], default: true },
      ]),
    );
    resetQaLoaderForTest();
    loadQaTable();
  });

  it("T28: POST + single-turn entry + asstCount=1 → serves turns[0] AGAIN (capped, no short-circuit)", async () => {
    writeFileSync(
      qaPath,
      JSON.stringify([
        {
          question: "hello",
          turns: [{ text: "world" }],
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
          { role: "user", content: "hello" },
          { role: "assistant", content: "world" },
          { role: "user", content: "hello again please" },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('"text":"w"');
    expect(body).toContain('"text":"o"');
    expect(body).toContain('"text":"r"');
    expect(body).toContain('"text":"l"');
    expect(body).toContain('"text":"d"');
    expect(body).not.toContain("(mock) Script complete.");
    expect(body).toContain('"stop_reason":"end_turn"');
  });
});
