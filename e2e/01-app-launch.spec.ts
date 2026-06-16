//! 01 — 应用启动：冷启动 Tauri 应用并验证主窗口渲染了 Chat 布局。
//!
//! Canary spec。如果它失败,整个 e2e 管道就坏了(错误的 CDP 端口、webview
//! 未加载、或应用在启动时 panic)。所有其他 spec 隐式依赖它。

import { test } from "@playwright/test";
import { assert, disposeTauriPage, getTauriPage } from "./helpers";

test.describe("01 — 应用启动", () => {
  let consoleErrors: string[] = [];

  test.beforeEach(async () => {
    consoleErrors = [];
    const page = await getTauriPage();
    page.on("console", (msg) => {
      if (msg.type === "error") consoleErrors.push(msg.text);
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

    // Tauri dev URL 是 index.html；成功时 SPA 挂载,sidebar (<aside>)
    // 和聊天表单(带 textarea 的 <form>)都应该存在。
    await assert.visible(page.locator("aside"), { timeout: 15_000 });
    await assert.visible(page.locator('textarea[placeholder="发条消息\u2026"]'));
    await assert.visible(page.locator('a[href="/settings"]'));

    // footer 的 "Settings" 链接是规范的用户 CTA；
    // href 断言是低层级检查,这个镜像人类会点击的内容。
    await assert.visible(page.getByRole("link", { name: /设置/i }));

    // 新建会话按钮存在于 sidebar header。
    await assert.visible(page.locator('button[title="新建会话"]'));

    // 启动时无未捕获错误。有些应用会记录无害的 warning —
    // 这里 canary 只看 `error` 级别。
    if (consoleErrors.length > 0) {
      throw new Error(`启动时 console 错误：\n${consoleErrors.join("\n")}`);
    }
  });
});
