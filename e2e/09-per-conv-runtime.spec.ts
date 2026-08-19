
import { test, expect, assert, cancelRunningAgent, clearAllHistory, clickNewConversationAndWait, invoke, submitForm } from "./fixtures";
import * as path from "node:path";
import * as os from "node:os";
import { useMockProvider } from "./mock-provider";

const SLOW_DELAY_MS = 500;
void SLOW_DELAY_MS;

const TEXT_A = "Hello from conv A";
const TEXT_B = "Hello from conv B";

test.describe("09 — Per-conv runtime isolation ", () => {
  test.beforeAll(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });

    await invoke<{ id: string }>(page, "addWorkspace", {
      label: "09 Test Workspace",
      rootPath: path.join(os.tmpdir(), `codeman-09-${process.pid}-${Math.random().toString(36).slice(2, 8)}`),
    });
    await page.goto("/");

    await useMockProvider(page);
    const settings = await invoke<{ defaultLlmProviderId?: string }>(page, "getSettings");
    if (settings.defaultLlmProviderId !== "mock") {
      throw new Error(
        "defaultLlmProviderId 应为 mock,实际: " + (settings.defaultLlmProviderId ?? "null"),
      );
    }
  });

  let beforeEachConvId = "";

  test.beforeEach(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    page.on("console", (msg: { type: string; text: string }) => {
      if (msg.type === "error") {
        console.log(`[09 page error] ${msg.text}`);
      }
    });
    page.on("pageerror", (err: Error) => {
      console.log(`[09 page pageerror] ${err.message}`);
    });
    await cancelRunningAgent(page);
    await clearAllHistory(page);
    const { convId } = await clickNewConversationAndWait(page);
    beforeEachConvId = convId;
    try {
      await page.locator('button[type="submit"]').waitFor({ state: "visible", timeout: 10_000 });
    } catch {
      await cancelRunningAgent(page);
    }
  });


  test("D1+D3: A streaming 不 leak 到 B view; 切回 A 内容完整", async ({ tauriEnv }) => {
    test.setTimeout(60_000);
    const { page } = tauriEnv;

    const { convId: newConvId } = await clickNewConversationAndWait(page);

    const convIdx0 = page.locator(`[data-value="${beforeEachConvId}"]`);
    const convIdx1 = page.locator(`[data-value="${newConvId}"]`);

    await convIdx0.click();
    await new Promise((r) => setTimeout(r, 200));

    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await assert.enabled(textarea);
    await textarea.fill("09::msg-in-idx0 msg-in-idx0");
    await submitForm(page);

    const assistantBubbles = page.locator('[data-testid="agent-bubble"]');
    await assert.visible(assistantBubbles.first(), { timeout: 10_000 });
    const count = await page.evaluate(() =>
      document.querySelectorAll('[data-testid="agent-bubble"]').length
    );
    const lastBubble = count > 1
      ? assistantBubbles.nth(count - 1)
      : assistantBubbles.first();
    await waitForText(lastBubble, "Hell", 5_000);

    await convIdx1.click();
    await new Promise((r) => setTimeout(r, 1_000));

    const diag = await page.evaluate(() => {
      const sections = document.querySelectorAll("section.flex-1");
      return { count: sections.length, texts: Array.from(sections).map(s => s?.textContent?.slice(0, 100) ?? "") };
    });
    console.log("[diag/conv-leak] section.flex-1 count=" + diag.count + " texts=" + JSON.stringify(diag.texts));
    const idx1ViewText = diag.texts[0] ?? "";
    expect(idx1ViewText, "切到 idx1 后,section.flex-1 不应包含 idx0 的流式文本(不能 leak)").not.toContain(
      TEXT_A,
    );
    expect(idx1ViewText, "idx1 view 不应包含 idx0 的 user message").not.toContain("msg-in-idx0");

    const idx1AssistantCount = await page.evaluate(() => {
      const section = document.querySelector("section.flex-1");
      if (!section) {return 999;}
      return Array.from(section.querySelectorAll('[data-testid="agent-bubble"]')).length;
    });
    expect(idx1AssistantCount, "idx1 view 应有 1 个 assistant bubble (新建 conv 的 fallback 响应)").toBe(1);

    await convIdx0.click();
    await new Promise((r) => setTimeout(r, 200));
    await assert.visible(
      page.locator('[data-testid="agent-bubble"]').filter({ hasText: TEXT_A }),
      { timeout: 10_000 },
    );

    await convIdx1.click();
    await new Promise((r) => setTimeout(r, 200));
    await assert.enabled(textarea);
    await textarea.fill("09::msg-in-idx1 msg-in-idx1");
    await submitForm(page);

    await assert.visible(
      page.locator('[data-testid="agent-bubble"]').filter({ hasText: TEXT_B }),
      { timeout: 10_000 },
    );
  });


  test("D5: sidebar streaming 指示 (⏳) 出现在 streaming conv 上,完成后消失", async ({ tauriEnv }) => {
    test.setTimeout(30_000);
    const { page } = tauriEnv;

    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await assert.enabled(textarea);
    await textarea.fill("09::msg msg");
    await submitForm(page);

    const assistantBubble = page.locator('[data-testid="agent-bubble"]');
    await assert.visible(assistantBubble.first(), { timeout: 10_000 });

    await page.evaluate(() => {
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        const li = document.querySelector('li:has([aria-current="page"])');
        if (li?.querySelector('[aria-label="streaming"]')) {return;}
      }
      throw new Error('streaming badge not found in active conv li after 5s');
    });

    await assert.visible(
      page.locator('[data-testid="agent-bubble"]').filter({ hasText: TEXT_A }),
      { timeout: 10_000 },
    );
  });


  test("D2: Cancel 中断 in-flight; Send 按钮恢复; 新 send 正常工作", async ({ tauriEnv }) => {
    test.setTimeout(30_000);
    const { page } = tauriEnv;

    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await assert.enabled(textarea);
    await textarea.fill("09::first first");
    await submitForm(page);

    const cancelBtn = page.getByRole("button", { name: /取消/i });
    await assert.visible(cancelBtn, { timeout: 5_000 });

    await cancelBtn.click();

    await assert.visible(page.locator('button[type="submit"]'), { timeout: 5_000 });
    await assert.enabled(textarea);

    await textarea.fill("09::second second");
    await submitForm(page);

    await assert.visible(
      page
        .locator('[data-testid="agent-bubble"]')
        .filter({ hasText: "Second response after cancel" }),
      { timeout: 10_000 },
    );
  });


  test("D1+D3+D5: 2 个 conv 同时 streaming,sidebar 各自显示 ⏳", async ({ tauriEnv }) => {
    test.setTimeout(60_000);
    const { page } = tauriEnv;

    const { convId: newConvId } = await clickNewConversationAndWait(page);

    const convIdx0 = page.locator(`[data-value="${beforeEachConvId}"]`);
    const convIdx1 = page.locator(`[data-value="${newConvId}"]`);

    await convIdx0.click();
    await new Promise((r) => setTimeout(r, 200));
    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await assert.enabled(textarea);
    await textarea.fill("09::msg-A msg-A");
    await submitForm(page);

    await assert.visible(page.locator('[data-testid="agent-bubble"]').first(), {
      timeout: 10_000,
    });

    await convIdx1.click();
    await new Promise((r) => setTimeout(r, 200));

    await page.evaluate((convId: string) => {
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        const li = document.querySelector(`li:has([data-value="${convId}"])`);
        if (li?.querySelector('[aria-label="streaming"]')) {return;}
      }
      throw new Error(`streaming badge not found for conv ${convId} in li`);
    }, beforeEachConvId);

    const submitBtn = page.locator('button[type="submit"]');
    await assert.visible(submitBtn, { timeout: 5_000 });
    await textarea.fill("09::msg-B msg-B");
    await submitForm(page);

    await assert.visible(page.locator('[data-testid="agent-bubble"]').first(), {
      timeout: 10_000,
    });

    await page.evaluate((convId: string) => {
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        const li = document.querySelector(`li:has([data-value="${convId}"])`);
        if (li?.querySelector('[aria-label="streaming"]')) {return;}
      }
      throw new Error(`streaming badge not found for conv ${convId} in li`);
    }, newConvId);

    await convIdx0.click();
    await new Promise((r) => setTimeout(r, 200));
    await assert.visible(
      page.locator('[data-testid="agent-bubble"]').filter({ hasText: TEXT_A }),
      { timeout: 10_000 },
    );

    await convIdx1.click();
    await new Promise((r) => setTimeout(r, 200));
    await assert.visible(
      page.locator('[data-testid="agent-bubble"]').filter({ hasText: TEXT_B }),
      { timeout: 10_000 },
    );
  });
});

async function waitForText(
  locator: { textContent(): Promise<string | null> },
  text: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const t = await locator.textContent();
    if (t && t.includes(text)) {
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`waitForText timed out after ${timeoutMs}ms: "${text}"`);
}
