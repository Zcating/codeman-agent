//! 01 — 应用启动：冷启动 Tauri 应用并验证主窗口
//! 渲染了 Chat 布局（sidebar + textarea + Settings 链接）。
//!
//! 这是 canary spec。如果它失败，整个 e2e 管道就坏了
//!（错误的 CDP 端口、webview 未加载、或应用在启动时 panic）。
//! 所有其他 spec 都隐式依赖它。

import { test, expect } from "@playwright/test";
import { getTauriPage, disposeTauriPage } from "./helpers";

test.describe("01 — 应用启动", () => {
	let consoleErrors: string[] = [];

	test.beforeEach(async () => {
		consoleErrors = [];
		const page = await getTauriPage();
		// 捕获整个 spec 的 console 错误，以免嘈杂的 webview 让
		// 这个 canary 失败而不是掩盖后续 spec 的问题。
		page.on("console", (msg) => {
			if (msg.type() === "error") consoleErrors.push(msg.text());
		});
		page.on("pageerror", (err) => {
			consoleErrors.push(`pageerror: ${err.message}`);
		});
	});

	test.afterAll(async () => {
		await disposeTauriPage();
	});

	test("主窗口加载聊天布局", async () => {
		const page = await getTauriPage();

		// Tauri dev URL 是 index.html；成功时 SPA 挂载，sidebar（<aside>）
		// 和聊天表单（带 textarea 的 <form>）都应该存在。
		// 我们不检查 URL 字符串 — dev 服务器可能带尾斜杠、hash 或 query，
		// 取决于平台。
		await expect(page.locator("aside")).toBeVisible({ timeout: 15_000 });
		await expect(page.locator('textarea[placeholder="Type a message…"]')).toBeVisible();
		await expect(page.locator('a[href="/settings"]')).toBeVisible();

		// footer 的 "Settings" 链接是规范的用户 CTA；
		// href 断言是低层级检查，这个镜像人类会点击的内容。
		await expect(page.getByRole("link", { name: /Settings/i })).toBeVisible();

		// 新建会话按钮存在于 sidebar header。
		await expect(page.locator('button[title="New conversation"]')).toBeVisible();

		// 启动时无未捕获错误。有些应用会记录无害的警告 —
		// 这里 canary 只看 `error` 级别。
		expect(consoleErrors, `启动时 console 错误：\n${consoleErrors.join("\n")}`).toEqual([]);
	});
});
