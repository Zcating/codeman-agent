// http-handler.test.ts — handleRequest 的 end-to-end 集成测试(拆自 src/main/mock-server.test.ts)
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startMockServer, stopMockServer } from "./index";
import { loadQaTable, resetQaLoaderForTest } from "./qa-loader";

describe("mock-server HTTP — POST /mock/anthropic/v1/messages", () => {
  let tmpDir: string;
  let qaPath: string;
  const TEST_PORT = 50001; 
  const TEST_HOST = "127.0.0.1";
  const BASE_URL = `http://${TEST_HOST}:${TEST_PORT}`;

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "mock-server-test-"));
    qaPath = join(tmpDir, "qa.json");
    writeFileSync(
      qaPath,
      JSON.stringify([
        { question: "hello", turns: [{ text: "world" }] },
        { question: "ping", turns: [{ text: "pong" }] },
        { question: "*", turns: [{ text: "default-text" }], default: true },
      ]),
    );
    process.env["CODEMAN_TEST_QA_TABLE"] = qaPath;
    resetQaLoaderForTest();
    loadQaTable();
    process.env["CODEMAN_MOCK_PORT"] = String(TEST_PORT);
    process.env["CODEMAN_MOCK_HOST"] = TEST_HOST;
    delete process.env["NODE_ENV"]; 
    delete process.env["CODEMAN_MOCK_FORCE"];
    process.env["CODEMAN_MOCK_STREAM_DELAY_MS"] = "0"; 

    startMockServer();
    await waitForServer(`${BASE_URL}/mock/anthropic/v1/messages`, 2000);
  });

  afterAll(async () => {
    await stopMockServer();
    delete process.env["CODEMAN_TEST_QA_TABLE"];
    delete process.env["CODEMAN_MOCK_PORT"];
    delete process.env["CODEMAN_MOCK_HOST"];
    delete process.env["CODEMAN_MOCK_STREAM_DELAY_MS"];
    resetQaLoaderForTest();
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
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

  it("T18b: POST 200 response 携带 Access-Control-Allow-Origin: *", async () => {
    const res = await fetch(`${BASE_URL}/mock/anthropic/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "m",
        messages: [{ role: "user", content: "hello" }],
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("T18c: OPTIONS preflight → 204 + 全部 CORS headers (Allow-Origin/Methods/Headers)", async () => {
    const res = await fetch(`${BASE_URL}/mock/anthropic/v1/messages`, {
      method: "OPTIONS",
      headers: {
        "Origin": "http://127.0.0.1:1420",
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

  it("T18d: 405 (GET) response 也携带 Access-Control-Allow-Origin: *", async () => {
    const res = await fetch(`${BASE_URL}/mock/anthropic/v1/messages`, { method: "GET" });
    expect(res.status).toBe(405);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("T18e: 404 (path 不匹配) response 也携带 Access-Control-Allow-Origin: *", async () => {
    const res = await fetch(`${BASE_URL}/some/other/path`, {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
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


async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (r.status >= 200 && r.status < 500) {
        await r.text().catch(() => {});
        return;
      }
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms (last error: ${String(lastErr)})`);
}
