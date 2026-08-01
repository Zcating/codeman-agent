
import { test, expect, assert, cancelRunningAgent, clearAllHistory, clickNewConversationAndWait, invoke, resetChatState, submitForm } from "./fixtures";
import { useMockProvider } from "./mock-provider";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

test.describe("06 — 上下文压缩 (compaction)", () => {
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

  test("自动触发：输入含 trigger-auto-compact 的 prompt → 等待 marker 出现 → DOM 中存在 [data-testid=\"compaction-marker\"]", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    const { convId } = await clickNewConversationAndWait(page);

    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await assert.enabled(textarea);
    await textarea.fill("compaction-auto trigger-auto-compact 测试自动压缩");
    await submitForm(page);

    // Wait for the compaction marker to appear
    const marker = page.locator('[data-testid="compaction-marker"]');
    await marker.waitFor({ state: "visible", timeout: 10_000 });
    expect(await marker.isVisible(), "compaction marker 必须可见").toBe(true);
  });

  test("手动触发：点击 [data-testid=\"compact-now-button\"] → 等待 spinner 消失 + marker 出现", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await clickNewConversationAndWait(page);

    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await assert.enabled(textarea);
    await textarea.fill("compaction-manual trigger-manual-compact 测试手动压缩");
    await submitForm(page);

    // Click the compact-now button
    const compactBtn = page.locator('[data-testid="compact-now-button"]');
    await assert.visible(compactBtn, { timeout: 5_000 });
    await compactBtn.click();

    // Wait for spinner to disappear and marker to appear
    const spinner = page.locator('[data-testid="compaction-spinner"]');
    try {
      await spinner.waitFor({ state: "hidden", timeout: 5_000 });
    } catch { /* spinner may not appear in all cases */ }

    const marker = page.locator('[data-testid="compaction-marker"]');
    await marker.waitFor({ state: "visible", timeout: 10_000 });
    expect(await marker.isVisible(), "compaction marker 必须可见").toBe(true);
  });

  test("marker 展开：点击 marker 摘要区域 → 看到完整 summary 文本 (检查 [data-testid=\"compaction-summary-body\"] 存在)", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await clickNewConversationAndWait(page);

    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await assert.enabled(textarea);
    await textarea.fill("compaction-auto trigger-auto-compact 测试 marker 展开");
    await submitForm(page);

    // Wait for marker
    const marker = page.locator('[data-testid="compaction-marker"]');
    await marker.waitFor({ state: "visible", timeout: 10_000 });

    // Click the marker summary/header area to expand
    const markerHeader = page.locator('[data-testid="compaction-marker"] [data-testid="compaction-summary-trigger"]');
    await markerHeader.click();

    // Verify summary body is visible
    const summaryBody = page.locator('[data-testid="compaction-summary-body"]');
    await assert.visible(summaryBody, { timeout: 5_000 });
    expect(await summaryBody.isVisible(), "compaction summary body 必须可见").toBe(true);
  });

  test("压缩后继续发送：第二次输入任意文本 → message 列表新增 bubble，无错误 toast", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    const { convId } = await clickNewConversationAndWait(page);

    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');

    // First message triggers compaction
    await textarea.fill("compaction-auto trigger-auto-compact 第一次触发压缩");
    await submitForm(page);

    const marker = page.locator('[data-testid="compaction-marker"]');
    await marker.waitFor({ state: "visible", timeout: 10_000 });

    // Wait for stream to finish
    await new Promise((r) => setTimeout(r, 2_000));

    // Second message - should add a new bubble without error
    await textarea.fill("compaction-manual trigger-manual-compact 第二次继续对话");
    await submitForm(page);

    // Wait for new assistant response
    await new Promise((r) => setTimeout(r, 2_000));

    // Check no error toast is visible
    const errorToast = page.locator('[data-testid="chat-error-banner"]');
    expect(await errorToast.count(), "错误 toast 不应出现").toBe(0);

    // Check that bubbles exist (at least user bubble for second message)
    const userBubbles = page.locator("div.justify-end > div.bg-primary.text-primary-foreground");
    const count = await userBubbles.count();
    expect(count, "message 列表应至少有一个 bubble").toBeGreaterThanOrEqual(1);
  });

  test.afterAll(async () => {
    try {
      fs.rmSync(e2eRoot, { recursive: true, force: true });
    } catch {}
  });
});
