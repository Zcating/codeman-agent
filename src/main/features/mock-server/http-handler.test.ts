// http-handler.test.ts — handleRequest 的 end-to-end 集成测试(拆自 src/main/mock-server.test.ts)
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync } from "node:fs";
import { loadQaTable, resetQaLoaderForTest } from "./qa-loader";
import { startMockServerForTest } from "./__test-helpers__/lifecycle";
import type { MockServerTestContext } from "./__test-helpers__/lifecycle";

describe("mock-server HTTP — POST /mock/anthropic/v1/messages", () => {
  let ctx: MockServerTestContext;
  let qaPath: string;
  const TEST_PORT = 50001;
  const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

  beforeAll(async () => {
    ctx = await startMockServerForTest(TEST_PORT);
    qaPath = ctx.qaPath;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("T12: POST + substring hit → 200 + SSE stream with per-char deltas", async () => {
    const res = await fetch(`${BASE_URL}/mock/anthropic/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "say hello world" }],
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/event-stream");
    const body = await res.text();
    expect(body).toContain("event: message_start");
    expect(body).toContain("event: content_block_start");
    expect(body).toContain('"text":"w"');
    expect(body).toContain('"text":"o"');
    expect(body).toContain('"text":"r"');
    expect(body).toContain('"text":"l"');
    expect(body).toContain('"text":"d"');
    expect(body).toContain("event: content_block_stop");
    expect(body).toContain('"stop_reason":"end_turn"');
    expect(body).toContain("event: message_stop");
    const deltaMatches = body.match(/event: content_block_delta/g) ?? [];
    expect(deltaMatches.length).toBe(5);
  });

  it("T13: POST + miss 无 default → 200 + warning SSE 含 'no canned response queued'", async () => {
    writeFileSync(qaPath, JSON.stringify([{ question: "hello", turns: [{ text: "x" }] }]));
    resetQaLoaderForTest();
    loadQaTable();

    const res = await fetch(`${BASE_URL}/mock/anthropic/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "这条消息不命中任何 entry" }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("[mock] no canned response queued");
    expect(body).toContain("event: message_start");
    expect(body).toContain("event: message_stop");

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

  it("T14: POST + miss + 有 default → 200 + default text in SSE stream", async () => {
    const res = await fetch(`${BASE_URL}/mock/anthropic/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "完全不匹配" }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    const deltaMatches = body.match(/event: content_block_delta/g) ?? [];
    expect(deltaMatches.length).toBe(12);
    expect(body).toContain('"text":"d"');
    expect(body).toContain('"text":"e"');
    expect(body).toContain('"text":"f"');
  });

  it("T15: GET (非 POST) → 405 Method Not Allowed", async () => {
    const res = await fetch(`${BASE_URL}/mock/anthropic/v1/messages`, { method: "GET" });
    expect(res.status).toBe(405);
  });

  it("T16: POST + 不匹配 path → 404 Not Found", async () => {
    const res = await fetch(`${BASE_URL}/some/other/path`, {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(404);
  });

  it("T17: POST + 无效 JSON body → 400 Bad Request", async () => {
    const res = await fetch(`${BASE_URL}/mock/anthropic/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "this is not json",
    });
    expect(res.status).toBe(400);
  });

  it("T18: POST + /v1/messages (无 /mock/anthropic prefix) 也受理(per 设计)", async () => {
    const res = await fetch(`${BASE_URL}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "m",
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    const deltaMatches = body.match(/event: content_block_delta/g) ?? [];
    expect(deltaMatches.length).toBe(4);
    expect(body).toContain('"text":"p"');
    expect(body).toContain('"text":"o"');
    expect(body).toContain('"text":"n"');
    expect(body).toContain('"text":"g"');
  });

  it("T18c: OPTIONS preflight → 204 + 全部 CORS headers (Allow-Origin/Methods/Headers)", async () => {
    const res = await fetch(`${BASE_URL}/mock/anthropic/v1/messages`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://127.0.0.1:1420",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,authorization",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")?.toLowerCase()).toContain("post");
    const allowHeaders = (res.headers.get("access-control-allow-headers") ?? "").toLowerCase();
    expect(allowHeaders).toContain("authorization");
    expect(allowHeaders).toContain("content-type");
  });

  it("T29: POST + last user msg wins in entry lookup (resume-friendly)", async () => {
    writeFileSync(
      qaPath,
      JSON.stringify([
        {
          question: "hello",
          turns: [
            { text: "world" },
            { text: "hello-multi-turn-1" },
          ],
        },
        {
          question: "follow-up",
          turns: [{ text: "follow-up-text" }],
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
          { role: "user", content: "follow-up" },       
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('"text":"f"');
    expect(body).toContain('"text":"o"');
    expect(body).toContain('"text":"l"');
    expect(body).toContain('"text":"w"');
    expect(body).toContain('"text":"-"');
    expect((body.match(/"text":"[A-Za-z-]"/g) ?? []).length).toBeGreaterThanOrEqual(13);
    expect(body).not.toContain("hello-multi-turn-1");
    expect(body).not.toContain("(mock) Script complete.");
  });
});
