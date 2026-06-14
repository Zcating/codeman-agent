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
import { assert, clearAllHistory, disposeTauriPage, getTauriPage, invoke } from "./helpers";

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
    // 清除会话使这个 spec 是密封的。我们还在下一次 "new" 点击时
    // 重置 store 中的 active conversation 指针。
    await clearAllHistory();
  });

  test.afterAll(async () => {
    await disposeTauriPage();
  });

  test("输入内容产生可见用户气泡并持久化到 DB", async () => {
    const page = await getTauriPage();

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
    await page.locator('button[type="submit"]').click();

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
    const convos = await invoke<Array<{ id: string; title: string }>>("list_conversations");
    const matching = convos.find((c) => c.title === (activeTitle ?? "").trim());
    expect(matching, `找不到标题为 "${activeTitle}" 的会话`).toBeTruthy();
    if (!matching) return; // 为 TS 缩小类型

    const messages = await invoke<MessageRow[]>("list_messages", {
      conversation_id: matching.id,
    });
    const userRow = messages.find((m) => m.role === "user" && m.content === USER_INPUT);
    expect(
      userRow,
      `content 为 "${USER_INPUT}" 的 user message 必须持久化在会话 ${matching.id} 中`,
    ).toBeTruthy();
  });

  test("多次发送产生多个气泡(无去重回归)", async () => {
    const page = await getTauriPage();
    await page.goto("/");
    await assert.visible(page.locator('textarea[placeholder="Type a message…"]'), {
      timeout: 15_000,
    });

    await page.locator('button[title="New conversation"]').click();
    const textarea = page.locator('textarea[placeholder="Type a message…"]');
    await assert.enabled(textarea);

    // 顺序发送 3 条不同消息。每条必须产生自己的
    // bubble;如果 store 去重或覆盖,这个测试会捕获它。
    const inputs = ["第一个气泡", "第二个气泡", "第三个气泡"];

    for (const text of inputs) {
      await textarea.fill(text);
      await page.locator('button[type="submit"]').click();
      // 等待 THIS 特定气泡出现后再发送下一条。
      // store 是 sync-after-await,所以这个很快解决。
      await assert.visible(
        page.locator("div.justify-end > div.bg-primary-500.text-white").filter({ hasText: text }),
        { timeout: 5_000 },
      );
    }

    // 最后所有 3 个必须共存于列表中。
    await assert.count(page.locator("div.justify-end > div.bg-primary-500.text-white"), 3);
  });
});
