//! 03 — 聊天 → billing 工具调用。
//!
//! 最难的 spec。聊天运行时通过 pi-mono 调用真实 LLM，这会
//! (a) 需要真实 API key 和 (b) 访问网络。我们不
//! 断言 LLM 响应本身 — 那是集成 spec 的工作，不是 e2e 的。
//!
//! 我们断言的内容：
//!  1. 聊天布局可交互：textarea 启用，send 可点击。
//!  2. 可以从 sidebar 创建新会话。
//!  3. 发送消息将 user-message bubble 追加到 DOM
//!     （验证完整写入路径：ChatView → store → IPC → SQLite）。
//!  4. 助手开始响应（流式 bubble 在合理超时内出现）或
//!     agent 干净地报错 — 两种结果都可接受；我们只希望运行时不要死锁。
//!
//! 这是"聊天循环活着"烟雾测试。

import { test, expect } from "@playwright/test";
import { getTauriPage, clearAllHistory, disposeTauriPage } from "./helpers";

const USER_PROMPT = "查一下 DeepSeek 余额";

test.describe("03 — 聊天 → billing 工具", () => {
	test.beforeEach(async () => {
		// 清除遗留会话，使 "new conversation" 是唯一的一个。
		await clearAllHistory();
	});

	test.afterAll(async () => {
		await disposeTauriPage();
	});

	test("发送消息并验证聊天循环活着", async () => {
		const page = await getTauriPage();

		// 从 / 开始（Tauri dev URL）。
		// 不需要导航；如果已经在那里，global CDP page
		// 默认就是聊天窗口。

		// 1. 创建新会话。这是必需的：ChatView 拒绝在没有 activeId 的情况下发送。
		const newConvButton = page.locator('button[title="New conversation"]');
		await expect(newConvButton).toBeVisible();
		await newConvButton.click();

		// 2. textarea 应启用且为空。
		const textarea = page.locator('textarea[placeholder="Type a message…"]');
		await expect(textarea).toBeEnabled();

		// 3. 输入并发送。
		await textarea.fill(USER_PROMPT);
		await page.locator('button[type="submit"]').click();

		// 4. user bubble 立即出现（同步写入 store + DB），
		//    所以这个断言是"写入路径正常"检查。
		await expect(page.getByText(USER_PROMPT, { exact: false })).toBeVisible({
			timeout: 5_000,
		});

		// 5. 稍等片刻后，二者之一：
		//    - assistant message bubble 出现（LLM 调用成功，或
		//      报错但运行时仍渲染了占位符），或
		//    - Send 按钮被 Cancel 按钮替代（运行时仍在流式，
		//      这是 OK 信号 — 它没有死锁）。
		//
		//    我们不激进超时：真实 LLM 调用冷启动可能需要
		//    10-20s，缺失 API key 仍会产生足够长的 "thinking" 状态。
		//    30s 是合理的预算。
		await expect(async () => {
			const hasAssistantBubble =
				(await page.locator("text=/^Assistant|^assistant|tool/i").count()) > 0;
			const cancelButtonVisible =
				(await page
					.getByRole("button", { name: /Cancel/i })
					.count()) > 0;
			expect(hasAssistantBubble || cancelButtonVisible).toBe(true);
		}).toPass({ timeout: 30_000, intervals: [1_000] });
	});
});
