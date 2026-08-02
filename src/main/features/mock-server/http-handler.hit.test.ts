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
  const TEST_PORT = 50002; 
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
