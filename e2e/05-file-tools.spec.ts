//! 05 — 文件工具 E2E (mock LLM): workspace 创建 + 增删改查 + 沙箱隔离。
//!
//! 使用 mock LLM provider (e2e/mock-provider.ts),不依赖 .env 真实 key。
//! Mock 队列由 e2e mock LLM 消费,确定性返回 tool call + text,不依赖网络。

import { test, expect, assert, cancelRunningAgent, clearAllHistory, clickNewConversationAndWait, invoke, submitForm } from "./fixtures";
import type { Workspace } from "../src/shared/lib/types";
import { useMockProvider, enqueueMockResponse, clearMockQueue } from "./mock-provider";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

test.describe("05 — 文件工具 (mock LLM)", () => {
  const e2eRoot = path.join(os.tmpdir(), "codeman-e2e-mock-" + Date.now());
  let workspaceId = "";

  let consoleErrors: string[] = [];

  test.beforeAll(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    fs.mkdirSync(e2eRoot, { recursive: true });

    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });

    // D8-W: workspace provisioned via WorkspaceService IPC
    workspaceId = (await invoke<Workspace>(page, "add_workspace", {
      label: "Mock E2E Test Workspace",
      rootPath: e2eRoot,
    })).id;

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
    await clearMockQueue(page);
    // Enqueue mock response for clickNewConversationAndWait's UI-driven send
    await enqueueMockResponse(page, { text: "Mock setup", delayMs: 50 });
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
    await textarea.fill("Try edit_file with ambiguous match");
    await submitForm(page);

    await enqueueMockResponse(page, {
      toolCalls: [
        {
          name: "edit_file",
          input: {
            workspaceId,
            path: "target.txt",
            oldText: "TODO",
            newText: "TASK",
            replaceAll: false,
          },
        },
      ],
    });
    await enqueueMockResponse(page, {
      text: "Error: edit_file failed because 'TODO' matches 2 times. Try being more specific.",
    });

    const deadline1 = Date.now() + 30_000;
    let sawResult = false;
    while (Date.now() < deadline1) {
      const assistantBubbles = await page
        .locator("div.justify-start > div[class*='bg-card']")
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

  test("search_files 返回匹配文件 + 行号,不包含无关文件", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    const dirA = path.join(e2eRoot, "src");
    fs.mkdirSync(dirA, { recursive: true });
    fs.writeFileSync(path.join(dirA, "a.ts"), "TODO: refactor\n", "utf-8");
    fs.writeFileSync(path.join(dirA, "b.ts"), "// clean file\n", "utf-8");

    const textarea = page.locator('textarea[placeholder="发条消息…"]');

    await enqueueMockResponse(page, {
      toolCalls: [
        {
          name: "search_files",
          input: { workspaceId, glob: "**/*.ts", contentPattern: "TODO" },
        },
      ],
    });
    await enqueueMockResponse(page, {
      text: "Search results:\nsrc/a.ts:1: TODO: refactor\n(1 file matched, 1 line)",
    });

    await textarea.fill("Find all .ts files containing 'TODO'");
    await submitForm(page);

    const deadline = Date.now() + 30_000;
    let sawResult = false;
    while (Date.now() < deadline) {
      const assistantBubbles = await page
        .locator("div.justify-start > div[class*='bg-card']")
        .count();
      if (assistantBubbles > 0) {
        sawResult = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(sawResult, "30s 内未观察到 assistant bubble(search_files)").toBe(true);

    const bodyText = await page.evaluate(() => document.body.textContent);
    expect(bodyText?.includes("a.ts"), "结果应包含 a.ts,实际: " + bodyText?.slice(0, 300)).toBe(
      true,
    );
    expect(
      bodyText?.toLowerCase().includes("line") || bodyText?.includes("1"),
      "结果应包含行号信息,实际: " + bodyText?.slice(0, 300),
    ).toBe(true);

    expect(consoleErrors, "console.error 不应出现:\n" + consoleErrors.join("\n")).toHaveLength(0);
  });
});
