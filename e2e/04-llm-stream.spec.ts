//! 04 — 流式 LLM 非空文本验收。
//!
//! 验证 V1 chat 域的流式 LLM 输出。使用 mock LLM provider（不依赖 .env 真实 key）。
//! Mock 提供确定性流式响应，验证 assistant bubble 包含 ≥5 char 文本。
//!
//! 与 spec 07 结构一致：mock provider → enqueue 响应 → 发送消息 → 验证气泡。

import { test, expect, assert, cancelRunningAgent, clearAllHistory, clickNewConversationAndWait, invoke, submitForm } from "./fixtures";
import { useMockProvider, enqueueMockResponse, clearMockQueue } from "./mock-provider";
import * as path from "node:path";
import * as os from "node:os";

const USER_PROMPT = "用一句话介绍你自己";

test.describe("04 — 流式 LLM 非空文本", () => {
  test.beforeAll(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });

    // D8-W: provision workspace
    await invoke(page, "add_workspace", {
      label: "E2E Mock Test Workspace",
      rootPath: path.join(os.tmpdir(), "codeman-e2e-mock-" + Date.now()),
    });

    // 使用 mock provider，不依赖真实 API key
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

  test("发送消息并在 30s 内观察到非空 assistant 文本或 Cancel 按钮", async ({ tauriEnv }) => {
    test.setTimeout(60_000);
    const { page } = tauriEnv;

    // 预置 mock 响应
    const cannedText = "你好！我是一个 AI 助手，很高兴认识你。";
    await enqueueMockResponse(page, { text: cannedText, delayMs: 20 });

    // 等待 Send 按钮出现（clickNewConversationAndWait 触发的 mock 完成后）
    try {
      await page.locator('button[type="submit"]').waitFor({ state: "visible", timeout: 10_000 });
    } catch {
      await cancelRunningAgent(page);
    }

    // textarea 应启用
    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await assert.visible(textarea, { timeout: 10_000 });
    await assert.enabled(textarea);

    // 输入并发送
    await textarea.fill(USER_PROMPT);
    await submitForm(page);

    // 30s 内观察到 ≥5 char assistant 文本
    const deadline = Date.now() + 30_000;
    let ok = false;
    while (Date.now() < deadline) {
      const chatArea = page.locator("div.flex-1.overflow-y-auto");
      const bubbles = chatArea.locator("div.justify-start").locator("div.max-w-prose");
      const bubbleCount = await bubbles.count();
      let hasNonEmptyAssistantText = false;
      if (bubbleCount > 0) {
        const lastBubble = bubbles.nth(bubbleCount - 1);
        const text = await lastBubble.textContent();
        hasNonEmptyAssistantText = (text?.trim().length ?? 0) >= 5;
      }

      if (hasNonEmptyAssistantText) {
        ok = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    expect(
      ok,
      "30s 内未观察到 ≥5 char assistant 文本 — mock LLM 响应未送达",
    ).toBe(true);
  });
});
