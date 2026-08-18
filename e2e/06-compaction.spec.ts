
import {
  test,
  expect,
  assert,
  cancelRunningAgent,
  clearAllHistory,
  clickNewConversationAndWait,
  invoke,
  resetChatState,
  submitForm,
} from "./fixtures";
import { useMockProvider, setMockProviderBehavior } from "./mock-provider";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

test.describe("06 — 上下文压缩 (compaction as message pair)", () => {
  const e2eRoot = path.join(os.tmpdir(), `codeman-e2e-compaction-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);

  test.beforeAll(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    fs.mkdirSync(e2eRoot, { recursive: true });
    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });
    await invoke(page, "addWorkspace", {
      label: "Compaction E2E Test Workspace",
      rootPath: e2eRoot,
    });
    await useMockProvider(page);
  });

  test.beforeEach(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await cancelRunningAgent(page);
    await clearAllHistory(page);
    await page.goto("/");
    await assert.visible(page.locator('[data-testid="codex-input"]'), { timeout: 15_000 });
  });

  test("自动触发：长上下文 → 时间线上出现 compaction summary 消息", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await clickNewConversationAndWait(page);
    const textarea = page.locator('textarea[placeholder="发条消息…"]');
    await assert.enabled(textarea);
    await textarea.fill("trigger-auto-compact 测试自动压缩 — 上下文已超阈值");
    await submitForm(page);
    const summaryLabel = page.locator('[data-testid="compaction-summary-label"]');
    await assert.visible(summaryLabel, { timeout: 15_000 });
  });

  test("手动触发：点击用量环 → popover → 立即压缩 → summary 消息出现", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await clickNewConversationAndWait(page);
    const textarea = page.locator('textarea[placeholder="发条消息…"]');
    await assert.enabled(textarea);
    await textarea.fill("第一条消息，让用量环可点击");
    await submitForm(page);
    const trigger = page.locator('[data-testid="usage-ring-trigger"]');
    await assert.visible(trigger, { timeout: 10_000 });
    await trigger.click();
    const compactBtn = page.locator('[data-testid="compact-now-button"]');
    await assert.visible(compactBtn, { timeout: 5_000 });
    await compactBtn.click();
    const summaryLabel = page.locator('[data-testid="compaction-summary-label"]');
    await assert.visible(summaryLabel, { timeout: 15_000 });
  });

  test("触发消息隐藏：compaction 触发后 user bubble 数量不增加", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await clickNewConversationAndWait(page);
    const textarea = page.locator('textarea[placeholder="发条消息…"]');
    await textarea.fill("trigger-auto-compact 测试触发消息隐藏");
    await submitForm(page);
    await page.locator('[data-testid="compaction-summary-label"]').waitFor({ timeout: 15_000 });
    const userBubbles = page.locator("div.justify-end > div.bg-primary.text-primary-foreground");
    const count = await userBubbles.count();
    expect(count).toBe(1);
  });

  test("失败显示：mock provider 抛错 → 时间线 error-card 可见", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await invoke(page, "setMockProviderBehavior", { mode: "fail" });
    await clickNewConversationAndWait(page);
    const textarea = page.locator('textarea[placeholder="发条消息…"]');
    await textarea.fill("trigger-manual-compact 测试失败显示");
    await submitForm(page);
    const trigger = page.locator('[data-testid="usage-ring-trigger"]');
    await assert.visible(trigger, { timeout: 10_000 });
    await trigger.click();
    const compactBtn = page.locator('[data-testid="compact-now-button"]');
    await assert.visible(compactBtn, { timeout: 5_000 });
    await compactBtn.click();
    const errorCard = page.locator('[data-testid="error-card"]');
    await assert.visible(errorCard, { timeout: 15_000 });
    await invoke(page, "setMockProviderBehavior", { mode: "normal" });
  });

  test("持久化：summary 消息在重启后仍可见", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await clickNewConversationAndWait(page);
    const textarea = page.locator('textarea[placeholder="发条消息…"]');
    await textarea.fill("trigger-auto-compact 测试持久化");
    await submitForm(page);
    const summaryLabel = page.locator('[data-testid="compaction-summary-label"]');
    await assert.visible(summaryLabel, { timeout: 15_000 });
    await page.goto("/");
    await assert.visible(page.locator('[data-testid="codex-input"]'), { timeout: 15_000 });
    const firstConversation = page.locator('[data-testid="conversation-list-item"]').first();
    const convCount = await firstConversation.count();
    if (convCount > 0) {
      await firstConversation.click();
      const reloadedLabel = page.locator('[data-testid="compaction-summary-label"]');
      const labelCount = await reloadedLabel.count();
      expect(labelCount > 0).toBe(true);
    }
  });

  test.afterAll(async () => {
    try {
      fs.rmSync(e2eRoot, { recursive: true, force: true });
    } catch {}
  });
});
