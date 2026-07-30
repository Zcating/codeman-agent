






import { test, expect, assert, cancelRunningAgent, clearAllHistory, clickNewConversationAndWait, invoke, submitForm } from "./fixtures";
import { useMockProvider } from "./mock-provider";
import * as path from "node:path";
import * as os from "node:os";


const USER_PROMPT = "06::user-prompt 用一句话介绍你自己";

test.describe("06 — LLM round-trip (mock)", () => {
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

  test("正常输入 + mock provider → 1 user + 1 assistant = 2 bubble", async ({ tauriEnv }) => {
    test.setTimeout(60_000);
    const { page } = tauriEnv;

    
    const cannedText = "你好！这是 mock LLM 的回复。";

    
    try {
      await page.locator('button[type="submit"]').waitFor({ state: "visible", timeout: 10_000 });
    } catch {
      await cancelRunningAgent(page);
    }

    
    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await assert.enabled(textarea);
    await textarea.fill(USER_PROMPT);
    await submitForm(page);

    
    const userBubble = page
      .locator("div.justify-end > div.bg-primary.text-primary-foreground")
      .filter({ hasText: USER_PROMPT });
    await assert.visible(userBubble, { timeout: 5_000 });
    const userText = await userBubble.textContent();
    expect(userText, "bubble 必须包含用户输入").toContain(USER_PROMPT);

    
    
    const textDeadline = Date.now() + 15_000;
    let foundText = "";
    while (Date.now() < textDeadline) {
      foundText = await page.evaluate((target: string) => {
        const bubbles = document.querySelectorAll('[data-testid="agent-bubble"]');
        for (const b of Array.from(bubbles)) {
          const t = (b.textContent ?? "").trim();
          if (t.includes(target)) {return t;}
        }
        const last = bubbles[bubbles.length - 1];
        return last ? (last.textContent ?? "").trim() : "(no assistant bubbles)";
      }, cannedText);
      if (foundText.includes(cannedText)) {break;}
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(foundText, "assistant bubble 应包含完整 mock 预置文本").toContain(cannedText);

    
    
    
    const userBubbleWithText = page
      .locator("div.justify-end > div.bg-primary.text-primary-foreground")
      .filter({ hasText: USER_PROMPT });
    await assert.visible(userBubbleWithText.first(), { timeout: 5_000 });

    const assistantBubbleWithText = page
      .locator('[data-testid="agent-bubble"]')
      .filter({ hasText: cannedText });
    await assert.visible(assistantBubbleWithText.first(), { timeout: 15_000 });
  });
});
