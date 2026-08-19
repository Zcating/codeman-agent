// http-handler.test.ts — handleRequest 的 end-to-end 集成测试(拆自 src/main/mock-server.test.ts)
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync } from "node:fs";
import { loadQaTable, resetQaLoaderForTest } from "./qa-loader";
import { startMockServerForTest } from "./__test-helpers__/lifecycle";
import type { MockServerTestContext } from "./__test-helpers__/lifecycle";

describe("mock-server HTTP — POST /mock/anthropic/v1/messages", () => {
  let ctx: MockServerTestContext;
  let qaPath: string;
  const TEST_PORT = 50004;
  const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

  beforeAll(async () => {
    ctx = await startMockServerForTest(TEST_PORT);
    qaPath = ctx.qaPath;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("T24: POST + multi-turn 'summarize' entry (initial, 0 asst) → serves turns[0] (read_file)", async () => {
    writeFileSync(
      qaPath,
      JSON.stringify([
        {
          question: "summarize",
          turns: [
            {
              text: "Reading the file.",
              toolUses: [{ name: "read_file", input: { path: "package.json" } }],
            },
            {
              text: "Searching.",
              toolUses: [{ name: "search_files", input: { pattern: "*.ts" } }],
            },
            { thinking: "All done.", text: "Summary complete." },
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
        messages: [{ role: "user", content: "please summarize" }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('"text":"R"');
    expect(body).toContain('"text":"e"');
    expect(body).toContain('"text":"."');
    expect((body.match(/"text":"[A-Za-z. ]"/g) ?? []).length).toBe(17);
    expect(body).toContain('"type":"tool_use"');
    expect(body).toContain('"name":"read_file"');
    expect(body).toContain('"id":"toolu_mock_1_');
    expect(body).toContain("package.json");
    expect(body).toContain('"stop_reason":"tool_use"');
    expect(body).not.toContain("Searching.");
    expect(body).not.toContain("search_files");
    expect(body).not.toContain("Summary complete.");
  });

  it("T25: POST + multi-turn 'summarize' (1 asst) → serves turns[1] (search_files)", async () => {
    const res = await fetch(`${BASE_URL}/mock/anthropic/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "m",
        messages: [
          { role: "user", content: "please summarize" },
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "toolu_mock_1_x",
                name: "read_file",
                input: { path: "package.json" },
              },
            ],
          },
          { role: "toolResult", content: [{ type: "text", text: "{\"name\":\"x\"}" }] },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('"text":"S"');
    expect(body).toContain('"text":"."');
    expect(body).toContain('"type":"tool_use"');
    expect(body).toContain('"name":"search_files"');
    expect(body).toContain("*.ts");
    expect(body).toContain('"stop_reason":"tool_use"');
    expect(body).not.toContain("Reading the file.");
    expect(body).not.toContain("package.json");
    expect(body).not.toContain("Summary complete.");
  });

  it("T26: POST + multi-turn 'summarize' (2 asst) → serves turns[2] (final summary)", async () => {
    const res = await fetch(`${BASE_URL}/mock/anthropic/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "m",
        messages: [
          { role: "user", content: "please summarize" },
          {
            role: "assistant",
            content: [{ type: "tool_use", id: "t1", name: "read_file", input: {} }],
          },
          { role: "toolResult", content: [{ type: "text", text: "data" }] },
          {
            role: "assistant",
            content: [{ type: "tool_use", id: "t2", name: "search_files", input: {} }],
          },
          { role: "toolResult", content: [{ type: "text", text: "results" }] },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('"thinking_delta"');
    expect(body).toContain("All done.");
    expect(body).toContain('"text":"S"');
    expect(body).toContain('"text":"."');
    expect(body).toContain('"stop_reason":"end_turn"');
    expect(body).not.toContain('"type":"tool_use"');
    expect(body).not.toContain("Reading the file.");
    expect(body).not.toContain("Searching.");
  });

  it("T27: POST + multi-turn 'summarize' (3 asst, capped to last) → serves turns[2]", async () => {
    const res = await fetch(`${BASE_URL}/mock/anthropic/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "m",
        messages: [
          { role: "user", content: "please summarize" },
          { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "a", input: {} }] },
          { role: "toolResult", content: [{ type: "text", text: "x" }] },
          { role: "assistant", content: [{ type: "tool_use", id: "t2", name: "b", input: {} }] },
          { role: "toolResult", content: [{ type: "text", text: "y" }] },
          { role: "assistant", content: "final summary" },
          { role: "user", content: "summarize again please" },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('"text":"S"');
    expect(body).toContain('"text":"u"');
    expect(body).toContain('"text":"r"');
    expect(body).toContain('"thinking_delta"');
    expect(body).toContain("All done.");
    expect(body).toContain('"stop_reason":"end_turn"');
    expect(body).not.toContain("(mock) Script complete.");
    expect(body).not.toContain("Reading the file.");
    expect(body).not.toContain("Searching.");
    expect(body).not.toContain('"type":"tool_use"');
  });
});
