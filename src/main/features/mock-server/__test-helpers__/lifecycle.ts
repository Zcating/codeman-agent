import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startMockServer, stopMockServer } from "../index";
import { loadQaTable, resetQaLoaderForTest } from "../qa-loader";

const TEST_HOST = "127.0.0.1";

export interface MockServerTestContext {
  url: string;
  qaPath: string;
  cleanup: () => Promise<void>;
}

const DEFAULT_QA = [
  { question: "hello", turns: [{ text: "world" }] },
  { question: "ping", turns: [{ text: "pong" }] },
  { question: "*", turns: [{ text: "default-text" }], default: true },
];

export async function startMockServerForTest(
  port: number,
  timeoutMs = 2000,
): Promise<MockServerTestContext> {
  const tmpDir = mkdtempSync(join(tmpdir(), "mock-server-test-"));
  const qaPath = join(tmpDir, "qa.json");
  writeFileSync(qaPath, JSON.stringify(DEFAULT_QA));
  process.env["CODEMAN_TEST_QA_TABLE"] = qaPath;
  resetQaLoaderForTest();
  loadQaTable();
  process.env["CODEMAN_MOCK_PORT"] = String(port);
  process.env["CODEMAN_MOCK_HOST"] = TEST_HOST;
  delete process.env["NODE_ENV"];
  delete process.env["CODEMAN_MOCK_FORCE"];
  process.env["CODEMAN_MOCK_STREAM_DELAY_MS"] = "0";
  startMockServer();
  await waitForServer(`http://${TEST_HOST}:${port}/mock/anthropic/v1/messages`, timeoutMs);
  return {
    url: `http://${TEST_HOST}:${port}`,
    qaPath,
    cleanup: async () => {
      await stopMockServer();
      delete process.env["CODEMAN_TEST_QA_TABLE"];
      delete process.env["CODEMAN_MOCK_PORT"];
      delete process.env["CODEMAN_MOCK_HOST"];
      delete process.env["CODEMAN_MOCK_STREAM_DELAY_MS"];
      resetQaLoaderForTest();
      rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

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
