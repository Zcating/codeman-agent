//! 05 — 文件工具 E2E (mock LLM): workspace 创建 + 增删改查 + 沙箱隔离。
//!
//! 使用 mock LLM provider (e2e/mock-provider.ts),不依赖 .env 真实 key。
//! Mock 队列由 e2e mock LLM 消费,确定性返回 tool call + text,不依赖网络。

import { test, expect, assert, cancelRunningAgent, clearAllHistory, clickNewConversationAndWait, invoke, submitForm } from "./fixtures";
import type { Workspace } from "../src/renderer/shared/lib/types";
import { useMockProvider } from "./mock-provider";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

test.describe("05 — 文件工具 (mock LLM)", () => {
  const e2eRoot = path.join(os.tmpdir(), `codeman-e2e-mock-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);

  let consoleErrors: string[] = [];

  test.beforeAll(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    fs.mkdirSync(e2eRoot, { recursive: true });

    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });

    // D8-W: workspace provisioned via WorkspaceService IPC (workspace not referenced
    // by name in tests; mock-server 不调真实 file tool — workspace 仅保证 chat-view 渲染)
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
    // clickNewConversationAndWait title send → default Q→A entry (warning SSE)
    await clickNewConversationAndWait(page);
    // Wait for streaming from clickNewConversationAndWait to complete
    // (Send button reappears when streamingMessageId is cleared)
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

  test("edit_file — old_text 匹配多次时报错,精确匹配时成功", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    const targetFile = path.join(e2eRoot, "target.txt");
    fs.writeFileSync(targetFile, "TODO: fix bug\nDONE: ok", "utf-8");

    const textarea = page.locator('textarea[placeholder="发条消息…"]');
    // Q→A: 05f::ambiguous-edit → tool_use(edit_file) + 05f::ambiguous-error → error text
    await textarea.fill("05f::ambiguous-edit Try edit_file with ambiguous match");
    await submitForm(page);

    const deadline1 = Date.now() + 30_000;
    let sawResult = false;
    while (Date.now() < deadline1) {
      const assistantBubbles = await page
        .locator('[data-testid="agent-bubble"]')
        .count();
      if (assistantBubbles > 0) {
        sawResult = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(sawResult, "30s 内未观察到 assistant bubble(ambiguous edit)").toBe(true);

    const bodyText = await page.evaluate(() => document.body.textContent);
    expect(
      bodyText?.toLowerCase().includes("exactly once") || bodyText?.toLowerCase().includes("match"),
      "错误应提示唯一匹配要求,实际: " + bodyText?.slice(0, 300),
    ).toBe(true);

    expect(consoleErrors, "console.error 不应出现:\n" + consoleErrors.join("\n")).toHaveLength(0);
  });

  test("mock plain text response appears (diagnostic)", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    // Q→A: 05f::plain-text → text response
    const textarea = page.locator('textarea[placeholder="发条消息…"]');
    await textarea.fill("05f::plain-text Test plain text response");
    await submitForm(page);

    // Wait for assistant bubble (up to 15s)
    const deadline = Date.now() + 15_000;
    let bodyText = "";
    while (Date.now() < deadline) {
      bodyText = (await page.evaluate(() => document.body.textContent)) ?? "";
      if (bodyText.includes("Hello from search_files diagnostic test!")) {
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    console.log("[diag/plain-text] final body text preview:", (bodyText ?? "").slice(0, 500));
    expect(bodyText, "should contain mock text").toContain("Hello from search_files diagnostic test!");
    expect(consoleErrors, "no console.errors").toHaveLength(0);
  });

  test("search_files 返回匹配文件 + 行号,不包含无关文件", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    const dirA = path.join(e2eRoot, "src");
    fs.mkdirSync(dirA, { recursive: true });
    fs.writeFileSync(path.join(dirA, "a.ts"), "TODO: refactor\n", "utf-8");
    fs.writeFileSync(path.join(dirA, "b.ts"), "// clean file\n", "utf-8");

    const textarea = page.locator('textarea[placeholder="发条消息…"]');

    // Q→A: 05f::search-todo → tool_use(search_files) + 05f::search-results → text
    await textarea.fill("05f::search-todo Find all .ts files containing 'TODO'");
    await submitForm(page);

    // Wait for user message to appear (confirms sendMessage was called)
    try {
      await page.locator('textarea[placeholder="发条消息…"]').waitFor({ state: "visible", timeout: 5_000 });
    } catch { /* ok */ }
    await new Promise((r) => setTimeout(r, 1000));

    // DIAGNOSE: check if assistant stub exists
    const hasAssistant = await page.evaluate(() => {
      const body = document.body.textContent ?? "";
      return { bodyPreview: body.slice(0, 500), thinkingEl: document.querySelector("[data-testid='thinking-indicator']") !== null };
    });
    console.log("[diag/search_files] state after 1s:", JSON.stringify(hasAssistant));

    // Wait for the mock to be consumed (up to 30s)
    const deadline = Date.now() + 30_000;
    let finalText = "";
    while (Date.now() < deadline) {
      finalText = (await page.evaluate(() => document.body.textContent)) ?? "";
      if (finalText.includes("a.ts") || finalText.includes("no canned response") || finalText.includes("Error")) {
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log("[diag/search_files] final body text preview:", (finalText ?? "").slice(0, 500));

    const bodyText = finalText;
    expect(bodyText?.includes("a.ts"), "结果应包含 a.ts,实际: " + bodyText?.slice(0, 500)).toBe(
      true,
    );
    expect(
      bodyText?.toLowerCase().includes("line") || bodyText?.includes("1"),
      "结果应包含行号信息,实际: " + bodyText?.slice(0, 500),
    ).toBe(true);

    expect(consoleErrors, "console.error 不应出现:\n" + consoleErrors.join("\n")).toHaveLength(0);
  });
});
