
import { test, expect, assert, cancelRunningAgent, clearAllHistory, clickNewConversationAndWait, invoke, submitForm } from "./fixtures";
import type { Workspace } from "../src/renderer/shared/lib/types";
import { useMockProvider } from "./mock-provider";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

test.describe("08 — 文件工具 (mock LLM)", () => {
  const e2eRoot = path.join(os.tmpdir(), `codeman-mock-e2e-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);

  let consoleErrors: string[] = [];

  test.beforeAll(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    fs.mkdirSync(e2eRoot, { recursive: true });

    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });

    await invoke<Workspace>(page, "addWorkspace", {
      label: "Mock E2E Test Workspace",
      rootPath: e2eRoot,
    });

    await useMockProvider(page);
  });

  test.beforeEach(async ({ tauriEnv }) => {
    consoleErrors = [];
    const { page } = tauriEnv;
    page.on("console", (msg: { type: string; text: string }) => {
      if (msg.type === "error") {
        consoleErrors.push(msg.text);
      }
    });
    page.on("pageerror", (err: Error) => {
      consoleErrors.push("pageerror: " + err.message);
    });
    await cancelRunningAgent(page);
    await clearAllHistory(page);
    await clickNewConversationAndWait(page);
    try {
      await page.locator('button[type="submit"]').waitFor({ state: "visible", timeout: 10_000 });
    } catch {
      await cancelRunningAgent(page);
    }
  });

  test.afterAll(async () => {
    try {
      fs.rmSync(e2eRoot, { recursive: true, force: true });
    } catch {}
  });

  test("write_file + read_file (mock text response): 验证 mock LLM 路径产生 assistant 文本", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await page.goto("/");
    await clickNewConversationAndWait(page);

    const textarea = page.locator('textarea[placeholder="发条消息…"]');
    await textarea.fill("08::write-read Write and read a test file");
    await submitForm(page);

    const deadline = Date.now() + 30_000;
    let bodyText = "";
    while (Date.now() < deadline) {
      bodyText = (await page.evaluate(() => document.body.textContent)) ?? "";
      if (bodyText.includes("written the file and read it back")) {
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(bodyText, "应出现 mock 预置的最终响应").toContain("written the file and read it back");

    expect(consoleErrors, "无 console.error").toHaveLength(0);
  });

  test("沙箱越界: read_file 越界时返回 SandboxViolation", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await page.goto("/");
    await clickNewConversationAndWait(page);

    const textarea = page.locator('textarea[placeholder="发条消息…"]');
    await textarea.fill("08::sandbox Read Windows hosts file");
    await submitForm(page);

    const deadline = Date.now() + 30_000;
    let bodyText = "";
    while (Date.now() < deadline) {
      bodyText = (await page.evaluate(() => document.body.textContent)) ?? "";
      if (
        bodyText.toLowerCase().includes("sandbox") ||
        bodyText.toLowerCase().includes("outside") ||
        bodyText.includes("Error")
      ) {
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(bodyText.toLowerCase(), "应包含 outside 关键词").toContain("outside");

    expect(consoleErrors, "无 console.error").toHaveLength(0);
  });
});
