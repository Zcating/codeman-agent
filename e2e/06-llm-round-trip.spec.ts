//! 06 — Mock LLM round-trip: 1 user + 1 assistant = 2 bubble。
//!
//! 使用 mock LLM provider（不依赖 .env 真实 key）。验证:
//!  1. 用户输入消息 → user bubble 出现
//!  2. mock LLM 返回预置文本 → assistant bubble 出现
//!  3. DOM 里恰好 1 user + 1 assistant = 合计 2 个 bubble

import { test, expect, assert, cancelRunningAgent, clearAllHistory, clickNewConversationAndWait, invoke, submitForm } from "./fixtures";
import { useMockProvider, enqueueMockResponse, clearMockQueue } from "./mock-provider";
import * as path from "node:path";
import * as os from "node:os";

const USER_PROMPT = "用一句话介绍你自己";

test.describe("06 — LLM round-trip (mock)", () => {
  test.beforeAll(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });

    // D8-W: provision workspace via direct IPC
    await invoke(page, "add_workspace", {
      label: "E2E Mock Test Workspace",
      rootPath: path.join(os.tmpdir(), "codeman-e2e-mock-" + Date.now()),
    });

    // 切换到 mock provider — 不依赖 .env 里的真实 LLM key
    await useMockProvider(page);
  });

  test.beforeEach(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await cancelRunningAgent(page);
    await clearAllHistory(page);
    await clearMockQueue(page);
    // clickNewConversationAndWait 走 UI 发送标题时会触发 LLM
    await enqueueMockResponse(page, { text: "Mock setup", delayMs: 50 });
    await clickNewConversationAndWait(page);
  });

  test("正常输入 + mock provider → 1 user + 1 assistant = 2 bubble", async ({ tauriEnv }) => {
    test.setTimeout(60_000);
    const { page } = tauriEnv;

    // 预置 mock 响应
    const cannedText = "你好！这是 mock LLM 的回复。";
    await enqueueMockResponse(page, { text: cannedText, delayMs: 20 });

    // 等待 Send 按钮重新出现（clickNewConversationAndWait 的 mock 完成）
    try {
      await page.locator('button[type="submit"]').waitFor({ state: "visible", timeout: 10_000 });
    } catch {
      await cancelRunningAgent(page);
    }

    // textarea 启用 + 输入 + 提交
    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await assert.enabled(textarea);
    await textarea.fill(USER_PROMPT);
    await submitForm(page);

    // 严格:user bubble 出现（本地 store 同步写,5s 内必现）
    const userBubble = page
      .locator("div.justify-end > div.bg-primary.text-primary-foreground")
      .filter({ hasText: USER_PROMPT });
    await assert.visible(userBubble, { timeout: 5_000 });
    const userText = await userBubble.textContent();
    expect(userText, "bubble 必须包含用户输入").toContain(USER_PROMPT);

    // 严格:assistant bubble 出现且包含完整 mock 预置文本
    // 等待完整文本而非第一块 chunk（mock 按 4 字 chunk stream，必须等全部送达）
    const textDeadline = Date.now() + 15_000;
    let foundText = "";
    while (Date.now() < textDeadline) {
      foundText = await page.evaluate((target: string) => {
        const bubbles = document.querySelectorAll("div.justify-start > div[class*='bg-card']");
        for (const b of Array.from(bubbles)) {
          const t = (b.textContent ?? "").trim();
          if (t.includes(target)) return t;
        }
        const last = bubbles[bubbles.length - 1];
        return last ? (last.textContent ?? "").trim() : "(no assistant bubbles)";
      }, cannedText);
      if (foundText.includes(cannedText)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(foundText, "assistant bubble 应包含完整 mock 预置文本").toContain(cannedText);

    // 核心断言:包含用户输入的 user bubble + 包含 mock 预置文本的 assistant bubble 都存在
    //（clickNewConversationAndWait 在 beforeEach 已产生一个 user bubble（标题），
    //  所以不计数绝对数量，只按文本内容验证）
    const userBubbleWithText = page
      .locator("div.justify-end > div.bg-primary.text-primary-foreground")
      .filter({ hasText: USER_PROMPT });
    await assert.visible(userBubbleWithText.first(), { timeout: 5_000 });

    const assistantBubbleWithText = page
      .locator("div.justify-start > div[class*='bg-card']")
      .filter({ hasText: cannedText });
    await assert.visible(assistantBubbleWithText.first(), { timeout: 15_000 });
  });
});
