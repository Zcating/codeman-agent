
import { test, expect, assert, cancelRunningAgent, clearAllHistory, clickNewConversationAndWait, invoke, submitForm } from "./fixtures";
import { useMockProvider } from "./mock-provider";
import * as path from "node:path";
import * as os from "node:os";

const USER_PROMPT = "04::hello-intro 用一句话介绍你自己";

test.describe("04 — 流式 LLM 非空文本", () => {
  test.beforeAll(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });

    await invoke(page, "addWorkspace", {
      label: "E2E Mock Test Workspace",
      rootPath: path.join(os.tmpdir(), `codeman-e2e-mock-${process.pid}-${Math.random().toString(36).slice(2, 8)}`),
    });

    await useMockProvider(page);
  });

  test.beforeEach(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await cancelRunningAgent(page);
    await clearAllHistory(page);
    await clickNewConversationAndWait(page);
  });

  test("发送消息并在 30s 内观察到非空 assistant 文本或 Cancel 按钮", async ({ tauriEnv }) => {
    test.setTimeout(60_000);
    const { page } = tauriEnv;


    try {
      await page.locator('button[type="submit"]').waitFor({ state: "visible", timeout: 10_000 });
    } catch {
      await cancelRunningAgent(page);
    }

    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await assert.visible(textarea, { timeout: 10_000 });
    await assert.enabled(textarea);

    await textarea.fill(USER_PROMPT);
    await submitForm(page);

    const deadline = Date.now() + 30_000;
    let ok = false;
    while (Date.now() < deadline) {
      const bubbles = page.locator('[data-testid="agent-bubble"]');
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
