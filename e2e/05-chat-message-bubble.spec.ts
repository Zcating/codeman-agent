//! 05 — Agent 页面:输入内容 → user message bubble 必须出现。
//!
//! 测试的契约:用户在聊天视图输入并发送消息后,消息作为 user-role bubble
//! 渲染在列表中,相同消息持久化到 SQLite(可通过 `list_messages` IPC 命令验证)。
//! 这个 spec 有意比 03-billing-tool 更严格:它使用 AND,不是 OR —
//! bubble 断言失败则测试失败,即使"聊天循环仍活着"。
//!
//! 为什么这是单独的 spec 而不是合并到 03:
//!   - 03 是"聊天循环活着"烟雾测试(允许 assistant 或 cancel)。
//!   - 05 是"user-input → bubble → DB"往返契约测试。
//!   - 两者失败原因不同;两个都跑将回归隔离到正确层(UI 渲染 vs. 运行时 plumbing)。

import { test, expect } from "@playwright/test";
import { assert, cancelRunningAgent, clearAllHistory, clickNewConversationAndWait, disposeTauriPage, getTauriPage, invoke, resetChatState, submitForm } from "./helpers";

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
  test.beforeEach(async () => {
    // 取消任何 in-flight LLM(04-llm-stream / 03 / 04-theme 可能留下
    // running=true 状态 — Cancel button 替代 Send,后续 submit 全失败)
    await cancelRunningAgent();
    // 清除会话使这个 spec 是密封的。我们还在下一次 "new" 点击时
    //    重置 store 中的 active conversation 指针。
    await clearAllHistory();
  });

  test.afterAll(async () => {
    await disposeTauriPage();
  });

  test("输入内容产生可见用户气泡并持久化到 DB", async () => {
    const page = await getTauriPage();

    // 诊断: 捕获所有 console + pageerror,这样 submit 时发生的 JS 错误
    // 不会淹没在 log 里。run_in_background 的 cdp-driver 转发到 node 端
    // 但没人听 — 我们用 console.log 显式输出。
    page.on("console", (msg) => {
      // 过滤掉 vite hmr 噪声
      const t = msg.text;
      if (t.includes("[vite]") || t.includes("[HMR]") || t.includes("hmr update")) return;
      console.log(`[page ${msg.type}] ${t}`);
    });
    page.on("pageerror", (err) => {
      console.log(`[page pageerror] ${err.message}`);
    });

    // 1. 到达聊天页面。Tauri dev URL 是 /;我们不需要
    //    导航,但这样做使 spec 对未来默认路由变更更健壮。
    await page.goto("/");
    await assert.visible(page.locator('textarea[placeholder="Type a message…"]'), {
      timeout: 15_000,
    });

    // 2. 创建全新会话。ChatView 拒绝在没有 activeId 的情况下发送,
    //    所以这是硬性前提,不是可选项。
    const newConvButton = page.locator('button[title="New conversation"]');
    await assert.visible(newConvButton);
    await newConvButton.click();

    // 3. 从 sidebar 的 active 列表项捕获 active conversation id —
    //    我们需要它来进行 IPC `list_messages` 调用。
    //    active 项是带 primary-500 背景的 <li>。
    const activeItem = page.locator("aside li.bg-primary-500").first();
    await assert.visible(activeItem, { timeout: 5_000 });
    const activeTitle = await activeItem.locator("span").first().textContent();
    expect(activeTitle, "active conversation 应有一个标题").toBeTruthy();

    // 4. 输入到 textarea 并提交。我们先等待 textarea
    //    启用,因为 store 异步加载完成且禁用的 textarea 会吞掉输入。
    const textarea = page.locator('textarea[placeholder="Type a message…"]');
    await assert.enabled(textarea);
    await textarea.fill(USER_INPUT);

    // 诊断: fill 后立即检查 textarea 的 value,以及 submit button 的 disabled
    const fillState = await page.evaluate(() => {
      const ta = document.querySelector('textarea[placeholder="Type a message…"]') as HTMLTextAreaElement | null;
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
      const ta = document.querySelector('textarea[placeholder="Type a message…"]') as HTMLTextAreaElement | null;
      const bubbles = document.querySelectorAll('div.justify-end > div.bg-primary-500.text-white');
      const cancel = document.querySelector('button:not([disabled])');
      return {
        taValue: ta?.value ?? null,
        taDisabled: ta?.disabled ?? null,
        bubbleCount: bubbles.length,
        bubbleTexts: Array.from(bubbles).slice(0, 3).map(b => b.textContent?.trim() ?? ''),
        hasCancelOrRunning: !!cancel,
      };
    });
    console.log(`[diagnose] after submit: ${JSON.stringify(afterSubmit)}`);

    // 5. 严格:user bubble 必须出现。按 MessageBubble.tsx,
    //    user bubble 是带工具类 bg-primary-500 + text-white 的 <div>,
    //    包含在带 justify-end 的 flex 容器中(右侧对齐)。
    //    我们断言内层 bubble div — 单独容器可能有歧义。
    const userBubble = page
      .locator("div.justify-end > div.bg-primary-500.text-white")
      .filter({ hasText: USER_INPUT });
    await assert.visible(userBubble, { timeout: 5_000 });
    // 文本包含:用 querySelector + textContent 验证 (不依赖 expect)
    const text = await userBubble.textContent();
    expect(text, "bubble 必须包含用户输入").toContain(USER_INPUT);

    // 6. 严格:发送后 textarea 清空(这是"提交后清除
    //    输入"契约 — 如果 textarea 仍保留文本,用户的"它实际发出去了吗?"
    //    指标坏了,即使 bubble 渲染了)。
    await assert.value(textarea, "");

    // 7. 严格:同一消息持久化到 SQLite。我们通过 messages 列表
    //    从 store 获取 active conversation 的第一条消息;
    //    最稳定的方式是通过 IPC list_conversations 查找。
    //
    //    Title → ID 映射在 DOM 中没有直接暴露,
    //    所以我们规避:用标题查找匹配 conversation。
    const convos = await invoke<Array<{ id: string; title: string }>>(
      "list_conversations",
      { includeArchived: false },
    );
    const matching = convos.find((c) => c.title === (activeTitle ?? "").trim());
    expect(matching, `找不到标题为 "${activeTitle}" 的会话`).toBeTruthy();
    if (!matching) return; // 为 TS 缩小类型

    const messages = await invoke<MessageRow[]>("list_messages", {
      conversationId: matching.id,
    });
    const userRow = messages.find((m) => m.role === "user" && m.content === USER_INPUT);
    expect(
      userRow,
      `content 为 "${USER_INPUT}" 的 user message 必须持久化在会话 ${matching.id} 中`,
    ).toBeTruthy();
  });

  test("多次发送产生多个气泡(无去重回归)", async () => {
    const page = await getTauriPage();
    page.on("console", (msg) => {
      const t = msg.text;
      if (t.includes("[vite]") || t.includes("[HMR]")) return;
      console.log(`[page ${msg.type}] ${t}`);
    });
    page.on("pageerror", (err) => {
      console.log(`[page pageerror] ${err.message}`);
    });
    // 完整重置 — 前 spec LLM 完成/取消,DB 清空,页面 reload
    await resetChatState();

    // 验证 resetChatState 后 chat-view 真的 mounted 且 signals 干净
    const postResetState = await page.evaluate(() => ({
      taExists: !!document.querySelector('textarea[placeholder="Type a message…"]'),
      sidebarItems: document.querySelectorAll("aside li").length,
      bubbles: document.querySelectorAll("div.justify-end").length,
    }));
    console.log(`[postReset] ${JSON.stringify(postResetState)}`);

    await clickNewConversationAndWait(page);

    const textarea = page.locator('textarea[placeholder="Type a message…"]');
    // 等 textarea 真正 enabled(前 LLM 取消后 running=false)
    await assert.enabled(textarea, { timeout: 5_000 });

    // 顺序发送 3 条不同消息。每条必须产生自己的
    // bubble;如果 store 去重或覆盖,这个测试会捕获它。
    const inputs = ["第一个气泡", "第二个气泡", "第三个气泡"];

    for (let i = 0; i < inputs.length; i++) {
      const text = inputs[i];
      // 前一次 submit 后 LLM 还在跑 → running=true → Send 被 Cancel 替换。
      // 先 cancel 让 textarea 重新 enabled,Send 重新出现。
      if (i > 0) {
        await cancelRunningAgent();
      }
      await textarea.fill(text);
      // 诊断: 检查当前 textarea 状态
      const state = await page.evaluate(() => {
        const ta = document.querySelector(
          'textarea[placeholder="Type a message…"]',
        ) as HTMLTextAreaElement | null;
        const btn = document.querySelector(
          'button[type="submit"]',
        ) as HTMLButtonElement | null;
        const cancelBtn = Array.from(document.querySelectorAll("button")).find(
          (b) => /^Cancel$/.test(b.textContent ?? ""),
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
          page.locator("div.justify-end > div.bg-primary-500.text-white").filter({ hasText: text }),
          { timeout: 5_000 },
        );
      } catch (e) {
        const domState = await page.evaluate(() => {
          const ta = document.querySelector(
            'textarea[placeholder="Type a message…"]',
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

    // 最后所有 3 个必须共存于列表中。
    await assert.count(page.locator("div.justify-end > div.bg-primary-500.text-white"), 3);
  });
});
