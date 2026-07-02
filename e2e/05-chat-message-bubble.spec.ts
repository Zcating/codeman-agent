//! 05 — Agent 页面:输入内容 → user message bubble 必须出现。
//!
//! 测试的契约:用户在聊天视图输入并发送消息后,消息作为 user-role bubble
//! 渲染在列表中,相同消息持久化到 SQLite(可通过 `list_messages` IPC 命令验证)。
//! 这个 spec 严格:bubble 断言失败则测试失败,即使"聊天循环仍活着"。
//!
//! 为什么这是单独的 spec:
//!   - 04 是"聊天循环活着"烟雾测试(允许 assistant 或 取消)。
//!   - 05 是"user-input → bubble → DB"往返契约测试。
//!   - 两者失败原因不同;两个都跑将回归隔离到正确层(UI 渲染 vs. 运行时 plumbing)。

import { test, expect, assert, cancelRunningAgent, clearAllHistory, clickNewConversationAndWait, invoke, resetChatState, submitForm } from "./fixtures";
import { useMockProvider, enqueueMockResponse, clearMockQueue } from "./mock-provider";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

// 有意独特的字符串,以便我们永远不会将其与其他测试数据行
// 或默认 Sidebar "New conversation" 占位符混淆。
const USER_INPUT = "测试气泡渲染为用户气泡";

interface MessageRow {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  tool_calls: unknown[] | null;
  tool_results: unknown[] | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: number;
}

test.describe("05 — agent 页面输入 → 用户气泡", () => {
  const e2eRoot = path.join(os.tmpdir(), "codeman-e2e-bubble-" + Date.now());

  test.beforeAll(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    fs.mkdirSync(e2eRoot, { recursive: true });

    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });

    // D8-W: provision workspace so clickNewConversationAndWait works
    await invoke(page, "add_workspace", {
      label: "Bubble E2E Test Workspace",
      rootPath: e2eRoot,
    });

    await useMockProvider(page);
  });

  test.beforeEach(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    // 彻底重置 chat 域: cancel in-flight → 清 DB → navigate to /
    await cancelRunningAgent(page);
    await clearAllHistory(page);
    await clearMockQueue(page);
    await page.goto("/");
    await assert.visible(page.locator('[data-testid="codex-input"]'), { timeout: 15_000 });
  });

  test("输入内容产生可见用户气泡并持久化到 DB", async ({ tauriEnv }) => {
    const { page } = tauriEnv;

    // 诊断: 捕获所有 console + pageerror
    page.on("console", (msg) => {
      const t = msg.text;
      if (t.includes("[vite]") || t.includes("[HMR]") || t.includes("hmr update")) {
        return;
      }
      console.log(`[page ${msg.type}] ${t}`);
    });
    page.on("pageerror", (err) => {
      console.log(`[page pageerror] ${err.message}`);
    });

    // Enqueue mocks: one for clickNewConversationAndWait (title send), one for USER_INPUT
    await enqueueMockResponse(page, { text: "Mock for setup", delayMs: 50 });
    await enqueueMockResponse(page, { text: "Mock response for USER_INPUT", delayMs: 50 });

    // 1. 创建全新会话 via UI-driven flow.
    const { convId } = await clickNewConversationAndWait(page);

    // 3. Verify the conv element exists in the DOM (may be inside accordion).
    //    `clickNewConversationAndWait` guarantees the conv was created and activated;
    //    this just confirms the sidebar rendered with the new conv's data-conv-id.
    await page.evaluate((id: string) => {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        if (document.querySelector(`[data-conv-id="${id}"]`)) return;
      }
      throw new Error(`[data-conv-id="${id}"] not found in DOM after 10s`);
    }, convId);
    const sidebarItem = page.locator(`[data-conv-id="${convId}"]`).first();
    const activeTitle = await sidebarItem.locator("span").first().textContent();
    expect(activeTitle, "active conversation 应有一个标题").toBeTruthy();

    // 4. 输入到 textarea 并提交。我们先等待 textarea
    //    启用,因为 store 异步加载完成且禁用的 textarea 会吞掉输入。
    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await assert.enabled(textarea);
    await textarea.fill(USER_INPUT);

    // 诊断: fill 后立即检查 textarea 的 value,以及 submit button 的 disabled
    const fillState = await page.evaluate(() => {
      const ta = document.querySelector(
        'textarea[placeholder="发条消息\u2026"]',
      ) as HTMLTextAreaElement | null;
      const btn = document.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      return {
        taValue: ta?.value ?? null,
        taDisabled: ta?.disabled ?? null,
        btnExists: !!btn,
        btnDisabled: btn?.disabled ?? null,
        btnText: btn?.textContent?.trim() ?? null,
      };
    });
    console.log(`[diagnose] after fill: ${JSON.stringify(fillState)}`);

    // 用 form.requestSubmit() 替代 button click — 在 WebView2 + cdp-driver
    // 组合下,submit button 的 click 事件不总是触发 form submit 默认动作。
    // requestSubmit() 直接触发 submit 事件,经过 Solid 的 onSubmit listener。
    await submitForm(page);

    // 诊断: submit 后等 1s,看 messages 数量和 textarea 是否清空
    await new Promise((r) => setTimeout(r, 1_000));
    const afterSubmit = await page.evaluate(() => {
      const ta = document.querySelector(
        'textarea[placeholder="发条消息\u2026"]',
      ) as HTMLTextAreaElement | null;
      const bubbles = document.querySelectorAll(
        "div.justify-end > div.bg-primary.text-primary-foreground",
      );
      const cancel = document.querySelector("button:not([disabled])");
      return {
        taValue: ta?.value ?? null,
        taDisabled: ta?.disabled ?? null,
        bubbleCount: bubbles.length,
        bubbleTexts: Array.from(bubbles)
          .slice(0, 3)
          .map((b) => b.textContent?.trim() ?? ""),
        hasCancelOrRunning: !!cancel,
      };
    });
    console.log(`[diagnose] after submit: ${JSON.stringify(afterSubmit)}`);

    // 5. 严格:user bubble 必须出现。按 MessageBubble.tsx,
    //    user bubble 是带工具类 bg-primary-500 + text-white 的 <div>,
    //    包含在带 justify-end 的 flex 容器中(右侧对齐)。
    //    我们断言内层 bubble div — 单独容器可能有歧义。
    const userBubble = page
      .locator("div.justify-end > div.bg-primary.text-primary-foreground")
      .filter({ hasText: USER_INPUT });
    await assert.visible(userBubble, { timeout: 5_000 });
    // 文本包含:用 querySelector + textContent 验证 (不依赖 expect)
    const text = await userBubble.textContent();
    expect(text, "bubble 必须包含用户输入").toContain(USER_INPUT);

    // 6. 严格:发送后 textarea 清空(这是"提交后清除
    //    输入"契约 — 如果 textarea 仍保留文本,用户的"它实际发出去了吗?"
    //    指标坏了,即使 bubble 渲染了)。
    await assert.value(textarea, "");

    // 7. 严格:同一消息持久化到 SQLite。直接用 clickNewConversationAndWait
    //    返回的 convId 查询，跳过 DOM 依赖。
    const messages = await invoke<MessageRow[]>(page, "list_messages", {
      conversationId: convId,
    });
    const userRow = messages.find((m) => m.role === "user" && m.content === USER_INPUT);
    expect(
      userRow,
      `content 为 "${USER_INPUT}" 的 user message 必须持久化在会话 ${convId} 中`,
    ).toBeTruthy();
  });

  test.afterAll(async () => {
    try {
      fs.rmSync(e2eRoot, { recursive: true, force: true });
    } catch {}
  });

  test("多次发送产生多个气泡(无去重回归)", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    page.on("console", (msg) => {
      const t = msg.text;
      if (t.includes("[vite]") || t.includes("[HMR]")) {
        return;
      }
      console.log(`[page ${msg.type}] ${t}`);
    });
    page.on("pageerror", (err) => {
      console.log(`[page pageerror] ${err.message}`);
    });
    // 完整重置 — 前 spec LLM 完成/取消,DB 清空,页面 reload
    await resetChatState(page);

    // Enqueue mocks: 1 for clickNewConversationAndWait + 3 for messages
    await enqueueMockResponse(page, { text: "Mock for setup", delayMs: 50 });
    await enqueueMockResponse(page, { text: "Mock 1", delayMs: 50 });
    await enqueueMockResponse(page, { text: "Mock 2", delayMs: 50 });
    await enqueueMockResponse(page, { text: "Mock 3", delayMs: 50 });

    await clickNewConversationAndWait(page);

    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    // 等 textarea 真正 enabled(前 LLM 取消后 running=false)
    await assert.enabled(textarea, { timeout: 5_000 });

    // 顺序发送 3 条不同消息。每条必须产生自己的
    // bubble;如果 store 去重或覆盖,这个测试会捕获它。
    const inputs = ["第一个气泡", "第二个气泡", "第三个气泡"];

    for (let i = 0; i < inputs.length; i++) {
      const text = inputs[i];
      // 前一次 submit 后 LLM 还在跑 → running=true → Send 被 取消 替换。
      // 先 取消 让 textarea 重新 enabled,Send 重新出现。
      if (i > 0) {
        await cancelRunningAgent(page);
      }
      await textarea.fill(text);
      // 诊断: 检查当前 textarea 状态
      const state = await page.evaluate(() => {
        const ta = document.querySelector(
          'textarea[placeholder="发条消息\u2026"]',
        ) as HTMLTextAreaElement | null;
        const btn = document.querySelector('button[type="submit"]') as HTMLButtonElement | null;
        const cancelBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          /^取消$/.test(b.textContent ?? ""),
        );
        return {
          taDisabled: ta?.disabled,
          taValue: ta?.value,
          btnExists: !!btn,
          cancelBtnExists: !!cancelBtn,
        };
      });
      console.log(`[loop ${i}] state: ${JSON.stringify(state)}`);
      await submitForm(page);
      // 等待 THIS 特定气泡出现后再发送下一条。
      // store 是 sync-after-await,所以这个很快解决。
      try {
        await assert.visible(
          page
            .locator("div.justify-end > div.bg-primary.text-primary-foreground")
            .filter({ hasText: text }),
          { timeout: 5_000 },
        );
      } catch (e) {
        const domState = await page.evaluate(() => {
          const ta = document.querySelector(
            'textarea[placeholder="发条消息\u2026"]',
          ) as HTMLTextAreaElement | null;
          return {
            taValue: ta?.value,
            taDisabled: ta?.disabled,
            sidebarItems: document.querySelectorAll("aside li").length,
            bubbles: document.querySelectorAll("div.justify-end").length,
          };
        });
        console.log(`[loop ${i}] FAIL DOM: ${JSON.stringify(domState)}`);
        throw e;
      }
    }

    // 最后所有 4 个必须共存于列表中(1 个标题气泡 + 3 个发送气泡,无去重)。
    await assert.count(page.locator("div.justify-end > div.bg-primary.text-primary-foreground"), 4);
  });
});
