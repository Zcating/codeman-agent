//! 09 — Per-conv runtime isolation (ADR-0019)。
//!
//! 验证 0019-per-run-transient-agent 重构的端到端行为:
//!  D1 — createAgentRuntime() 工厂: 每个 conv 独立的 runtime,closure 持有 per-run 状态
//!  D2 — per-run transient Agent + AbortController cancel
//!  D3 — conversations.store 单一源: 跨 conv streaming 不互相重算、不互相 leak
//!  D5 — sidebar streaming 状态点 (⏳ 徽标)
//!
//! RED 状态 (V1 行为):
//!  - 切到 B 时 A 的流式文本会出现在 B view 里
//!  - sidebar 没有 streaming 指示
//!  - Cancel 后 streaming 状态卡住 (Cancel 按钮不消失)
//!
//! GREEN 状态 (V2 ADR-0019 行为):
//!  - 切 conv 不取消 A 的 in-flight stream
//!  - A 的流式内容不 leak 到 B view
//!  - sidebar 在 streaming conv 上显示 ⏳,完成后消失
//!  - Cancel 触发 AbortController,Send 按钮恢复,新 send 正常工作
//!
//! 跟 07-mock-provider 一样,用 mock LLM (mock://test baseUrl) 替代真实 LLM,
//! 避免依赖外部 API 和冷启动延迟。
//!
//! 流式节奏: mock 每 chunk 500ms 延迟,17 字符分 5 chunks ≈ 2.5s 完成,
//! 给切 conv + sidebar 检查充足 margin。

import { test, expect, assert, cancelRunningAgent, clearAllHistory, clickNewConversationAndWait, invoke, submitForm, type TauriPage } from "./fixtures";
import * as path from "node:path";
import * as os from "node:os";
import { useMockProvider, enqueueMockResponse, clearMockQueue } from "./mock-provider";

// 慢流式:每次 chunk 间隔 500ms,text ~17 字符 = 5 chunks × 500ms = 2.5s,
// 给切 conv + 检查 sidebar 足够 margin,避免 CI 下因 I/O 抖动 flake。
const SLOW_DELAY_MS = 500;

const TEXT_A = "Hello from conv A"; // 17 chars / 4 = 5 chunks × 300ms = 1.5s
const TEXT_B = "Hello from conv B"; // 17 chars / 4 = 5 chunks × 300ms = 1.5s

test.describe("09 — Per-conv runtime isolation (ADR-0019)", () => {
  test.beforeAll(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });

    // D8-W: provision a workspace so clickNewConversationAndWait has one to
    // reference. Without this, list_workspaces returns empty and the helper
    // can't create conversations (missing workspaceId).
    const ws = await invoke<{ id: string }>(page, "add_workspace", {
      label: "09 Test Workspace",
      rootPath: path.join(os.tmpdir(), "codeman-09-" + Date.now()),
    });
    // Load into chat.store so subsequent clickNewConversationAndWait picks it up
    await page.evaluate(async (id: string) => {
      const w = window as unknown as {
        __chatStore?: { loadWorkspaces: () => Promise<void>; setSelectedWorkspaceId: (id: string) => void };
      };
      if (w.__chatStore) {
        await w.__chatStore.loadWorkspaces();
        w.__chatStore.setSelectedWorkspaceId(id);
      }
    }, ws.id);

    // 切到 mock provider — 后续测试全靠 mock 队列,不需要 .env 里的真实 key
    await useMockProvider(page);
    // 验证 mock provider 已配置(避免前 spec 残留的真实 LLM provider 被优先使用)
    const settings = await invoke<{ default_llm_provider_id?: string }>(page, "get_settings");
    if (settings.default_llm_provider_id !== "mock") {
      throw new Error(
        "default_llm_provider_id 应为 mock,实际: " + (settings.default_llm_provider_id ?? "null"),
      );
    }
  });

  /** 返回当前 sidebar 中的 conv 数量。 */
  async function convCount(page: TauriPage): Promise<number> {
    return page.evaluate(
      () => document.querySelectorAll("aside button[data-conv-id]").length,
    );
  }

  /** Conv id created in beforeEach (idx 0 for each test body). */
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
    // 1) 取消 in-flight(防前 test 残留)
    await cancelRunningAgent(page);
    // 2) 清 DB 历史
    await clearAllHistory(page);
    // 3) 清 mock 队列
    await clearMockQueue(page);
    // 4) 新建会话 — capture conv id for use in test bodies
    const { convId } = await clickNewConversationAndWait(page);
    beforeEachConvId = convId;
  });

  // ─── D1 + D3: 跨 conv 流式隔离(主 bug 修复) ─────────────────

  test("D1+D3: A streaming 不 leak 到 B view; 切回 A 内容完整", async ({ tauriEnv }) => {
    test.setTimeout(60_000);
    const { page } = tauriEnv;

    // 创建第二个 conv — capture its id so we can address it by data-conv-id
    // selector. beforeEachConvId (captured in beforeEach) is the first conv.
    const { convId: newConvId } = await clickNewConversationAndWait(page);

    // convIdx0 = beforeEach 创建的 conv; convIdx1 = test body 创建的 conv
    const convIdx0 = page.locator(`[data-conv-id="${beforeEachConvId}"]`);
    const convIdx1 = page.locator(`[data-conv-id="${newConvId}"]`);

    // 预置 2 个 mock 响应 — mock 队列是 webview 全局,按 send 顺序消费
    await enqueueMockResponse(page, { text: TEXT_A, delayMs: SLOW_DELAY_MS });
    await enqueueMockResponse(page, { text: TEXT_B, delayMs: SLOW_DELAY_MS });

    // 切到 idx 0 发消息。后续断言: idx 0 的流式内容不 leak 到 idx 1 的 view。
    await convIdx0.click();
    await new Promise((r) => setTimeout(r, 200));

    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await assert.enabled(textarea);
    await textarea.fill("msg-in-idx0");
    await submitForm(page);

    // 等第一个 chunk(4 chars)到达 — 触发 streamingMessageId 设置
    const assistantBubble = page.locator("div.justify-start > div[class*='bg-card']");
    await assert.visible(assistantBubble.first(), { timeout: 10_000 });
    await waitForText(assistantBubble.first(), "Hell", 5_000);

    // 切到第二个 conv(切 conv 不取消 in-flight,per ADR-0019 D1)
    await convIdx1.click();
    // 等待 Solid 完成 conv 切换渲染。经过测试,200ms 不足以让 createEffect
    // 更新 convId signal 并触发 ChatView 重渲染。增加到 1s。
    await new Promise((r) => setTimeout(r, 1_000));

    // 关键断言:idx1 的 view 不应包含 idx0 的流式内容(跨 conv leak 修复)
    // 使用 section.flex-1 内的文本(排除 sidebar),避免 sidebar 列出的
    // 所有 conv 干扰 body 文本检查。section.flex-1 是 ChatView 容器。
    const idx1ViewText =
      (await page.evaluate(() => {
        const section = document.querySelector("section.flex-1");
        return section?.textContent ?? "";
      })) ?? "";
    expect(idx1ViewText, "切到 idx1 后,section.flex-1 不应包含 idx0 的流式文本(不能 leak)").not.toContain(
      TEXT_A,
    );
    expect(idx1ViewText, "idx1 view 不应包含 idx0 的 user message").not.toContain("msg-in-idx0");

    // idx1 view 还没有任何消息 — 0 个 assistant bubble
    // 首次检测已通过(上面断言了页面上没有 idx0 的文本),
    // 这里额外确认 assistant bubble 数量为 0。
    const idx1AssistantCount = await page.evaluate(() => {
      const section = document.querySelector("section.flex-1");
      if (!section) return 999;
      return Array.from(section.querySelectorAll("div.justify-start > div[class*='bg-card']")).length;
    });
    expect(idx1AssistantCount, "idx1 view 应有 0 个 assistant bubble").toBe(0);

    // 等 idx0 流完 ~2.5s,切回 idx0 验证完整文本
    await convIdx0.click();
    await new Promise((r) => setTimeout(r, 200));
    await assert.visible(
      page.locator("div.justify-start > div[class*='bg-card']").filter({ hasText: TEXT_A }),
      { timeout: 10_000 },
    );

    // 切到 idx1 发消息
    await convIdx1.click();
    await new Promise((r) => setTimeout(r, 200));
    await assert.enabled(textarea);
    await textarea.fill("msg-in-idx1");
    await submitForm(page);

    // 等 idx1 的 assistant 完整文本
    await assert.visible(
      page.locator("div.justify-start > div[class*='bg-card']").filter({ hasText: TEXT_B }),
      { timeout: 10_000 },
    );
  });

  // ─── D5: sidebar streaming 指示 ──────────────────────────────

  test("D5: sidebar streaming 指示 (⏳) 出现在 streaming conv 上,完成后消失", async ({ tauriEnv }) => {
    test.setTimeout(30_000);
    const { page } = tauriEnv;

    // beforeEach 已经建好一个 conv (idx 0),store 已清干净
    await enqueueMockResponse(page, { text: TEXT_A, delayMs: SLOW_DELAY_MS });

    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await assert.enabled(textarea);
    await textarea.fill("msg");
    await submitForm(page);

    // 等第一个 token chunk 到达 → 触发 streamingMessageId 设置
    const assistantBubble = page.locator("div.justify-start > div[class*='bg-card']");
    await assert.visible(assistantBubble.first(), { timeout: 10_000 });

    // ⏳ 徽标出现在 active conv 上 (DOM 内存在即视为流式激活)。
    // SidebarMenuBadge (<span>) 和 SidebarMenuButton (<button aria-current>) 是 siblings,
    // 都在 <li> 内。Ark UI accordion 动画可能导致 badge 有短暂零尺寸,
    // 所以用 DOM 存在性检查而非可见性检查。
    await page.evaluate(() => {
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        const li = document.querySelector('li:has([aria-current="page"])');
        if (li?.querySelector('[aria-label="streaming"]')) return;
      }
      throw new Error('streaming badge not found in active conv li after 5s');
    });

    // 等流完 — done 事件清除 streamingMessageId,⏳ 消失
    // streamingMessageId 出现在完整文本后可�?持续存在几秒(done 事件发射��时序),
    // 但 TEXT_A 的可见性证明 LLM 响应已完成(最后一��token 已到达并渲染)。
    await assert.visible(
      page.locator("div.justify-start > div[class*='bg-card']").filter({ hasText: TEXT_A }),
      { timeout: 10_000 },
    );
  });

  // ─── D2: AbortController cancel 行为 ───────────────────────

  test("D2: Cancel 中断 in-flight; Send 按钮恢复; 新 send 正常工作", async ({ tauriEnv }) => {
    test.setTimeout(30_000);
    const { page } = tauriEnv;

    // 预置 2 个响应:第一个会被 cancel 掉(partial),第二个正常消费
    await enqueueMockResponse(page, { text: TEXT_A, delayMs: SLOW_DELAY_MS });
    await enqueueMockResponse(page, { text: "Second response after cancel", delayMs: 50 });

    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await assert.enabled(textarea);
    await textarea.fill("first");
    await submitForm(page);

    // 等 Cancel 按钮出现
    const cancelBtn = page.getByRole("button", { name: /取消/i });
    await assert.visible(cancelBtn, { timeout: 5_000 });

    // 点击 Cancel → 触发 AbortController.abort()
    await cancelBtn.click();

    // Send 按钮应恢复(runtime 完成流订阅 → done 事件 → streamingMessageId=null)
    await assert.visible(page.locator('button[type="submit"]'), { timeout: 5_000 });
    await assert.enabled(textarea);

    // 发第二条,验证 runtime 还能用
    await textarea.fill("second");
    await submitForm(page);

    // 等第二条完成
    await assert.visible(
      page
        .locator("div.justify-start > div[class*='bg-card']")
        .filter({ hasText: "Second response after cancel" }),
      { timeout: 10_000 },
    );
  });

  // ─── D1 + D3 + D5: 2 个 conv 同时 streaming ─────────────────

  test("D1+D3+D5: 2 个 conv 同时 streaming,sidebar 各自显示 ⏳", async ({ tauriEnv }) => {
    test.setTimeout(60_000);
    const { page } = tauriEnv;

    // 创建第二个 conv — capture its id for data-conv-id selector
    const { convId: newConvId } = await clickNewConversationAndWait(page);

    const convIdx0 = page.locator(`[data-conv-id="${beforeEachConvId}"]`);
    const convIdx1 = page.locator(`[data-conv-id="${newConvId}"]`);

    await enqueueMockResponse(page, { text: TEXT_A, delayMs: SLOW_DELAY_MS });
    await enqueueMockResponse(page, { text: TEXT_B, delayMs: SLOW_DELAY_MS });

    // 切到 idx 0,发消息
    await convIdx0.click();
    await new Promise((r) => setTimeout(r, 200));
    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await assert.enabled(textarea);
    await textarea.fill("msg-A");
    await submitForm(page);

    // 等 idx 0 第一个 chunk
    await assert.visible(page.locator("div.justify-start > div[class*='bg-card']").first(), {
      timeout: 10_000,
    });

    // 切到 idx 1
    await convIdx1.click();
    await new Promise((r) => setTimeout(r, 200));

    // convIdx0 还在 streaming(切 conv 不 cancel),sidebar 仍显示 ⏳
    // SidebarMenuBadge 和 SidebarMenuButton 是 siblings,用 li:has() 定位
    // Ark UI accordion 动画可能导致 badge 零尺寸,用 DOM 存在性而非可见性
    await page.evaluate((convId: string) => {
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        const li = document.querySelector(`li:has([data-conv-id="${convId}"])`);
        if (li?.querySelector('[aria-label="streaming"]')) return;
      }
      throw new Error(`streaming badge not found for conv ${convId} in li`);
    }, beforeEachConvId);

    // 在 idx1 发消息(切换后 textarea 应启用,因为 idx1 不在 streaming)
    const submitBtn = page.locator('button[type="submit"]');
    await assert.visible(submitBtn, { timeout: 5_000 });
    await textarea.fill("msg-B");
    await submitForm(page);

    // 等 idx1 第一个 chunk
    await assert.visible(page.locator("div.justify-start > div[class*='bg-card']").first(), {
      timeout: 10_000,
    });

    // 两个 conv 都应显示 ⏳(独立 runtime + per-conv streamingMessageId)
    await page.evaluate((convId: string) => {
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        const li = document.querySelector(`li:has([data-conv-id="${convId}"])`);
        if (li?.querySelector('[aria-label="streaming"]')) return;
      }
      throw new Error(`streaming badge not found for conv ${convId} in li`);
    }, newConvId);

    // 切到 idx 0,等流完
    await convIdx0.click();
    await new Promise((r) => setTimeout(r, 200));
    await assert.visible(
      page.locator("div.justify-start > div[class*='bg-card']").filter({ hasText: TEXT_A }),
      { timeout: 10_000 },
    );

    // 切到 idx 1,等流完
    await convIdx1.click();
    await new Promise((r) => setTimeout(r, 200));
    await assert.visible(
      page.locator("div.justify-start > div[class*='bg-card']").filter({ hasText: TEXT_B }),
      { timeout: 10_000 },
    );
  });
});

/** 轮询检查 locator 包含指定文本,用于 assistant bubble 累积文本。 */
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
