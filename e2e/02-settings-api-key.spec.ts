//! 02 — 设置：配置 LLM API key 并验证其持久化。
//!
//! 流程：
//!  1. 通过 footer 链接导航到 /settings。
//!  2. 点击第一个 provider 的 "Set API key…" 按钮。
//!  3. 在显示的 <input type="password"> 中输入一个假 key。
//!  4. 点击 "Save"。
//!  5. 通过调用 IPC `has_llm_key` 命令验证 key 实际被写入
//!    (真正的端到端 — 不只是表单关闭)。
//!  6. 重新加载页面并重新检查输入框被隐藏(不应反射回来,
//!     按 "API key 永不反射到 DOM" 规则)。
//!
//! 我们使用假 key — 测试只检查写入路径,不检查网络。

import { test, expect } from "@playwright/test";
import { assert, disposeTauriPage, getTauriPage, invoke } from "./helpers";

const FAKE_KEY = "sk-e2e-fake-key-not-real-do-not-use-12345";

test.describe("02 — 设置 API key", () => {
  test.afterAll(async () => {
    await disposeTauriPage();
  });

  test("设置、持久化并重新加载 — key 被写入但永不反射", async () => {
    const page = await getTauriPage();

    // 0. 显式 navigate 到 / — 防止 disposeTauriPage 重新连 CDP 后 chat 路由
    //    还没 mount 时,getByRole("link", { name: /Settings/i }) 拿不到 footer link。
    await page.goto("/");

    // 1. 通过真实用户会点击的链接到达 /settings。先用 a[href] 直查（同 spec 01
    //    line 34 的容错 selector），再 fallback 到 role-based。
    const settingsLink = page.locator('a[href="/settings"]');
    await assert.visible(settingsLink, { timeout: 10_000 });
    await settingsLink.click();
    await assert.urlMatches(page, /\/settings$/);

    // 2. 点击第一个 provider 的 "Set API key…"。每个 provider
    //    的标签显示为 card header 内的 <span>。
    const setKeyButton = page.getByRole("button", { name: /Set API key/i }).first();
    await assert.visible(setKeyButton);
    await setKeyButton.click();

    // 3. 按钮展开 password 输入框 + Save / Cancel。填写它。
    const passwordInput = page.locator('input[type="password"]').first();
    await assert.visible(passwordInput);
    await passwordInput.fill(FAKE_KEY);

    // 4. 点击 Save。
    await page
      .getByRole("button", { name: /^Save$/ })
      .first()
      .click();

    // 保存 promise 解决后,卡片收回 "Set API key…" 按钮(输入消失)。
    await assert.hidden(passwordInput, { timeout: 5_000 });

    // 5. 通过 IPC 命令验证 key 实际在磁盘上。我们需要 provider id；
    //    从 provider 卡片内的 <code> 标签获取(按 ProviderCard.tsx 布局)。
    const providerId = await page.locator("code.font-mono").first().textContent();
    expect(providerId, "provider id 应作为 code 元素可见").toBeTruthy();
    const trimmedId = (providerId ?? "").trim();

    const hasKey = await invoke<boolean>("has_llm_key", { providerId: trimmedId });
    expect(hasKey, `has_llm_key 对 ${trimmedId} 应返回 true`).toBe(true);

    // 6. 重新加载页面(应用内导航回 /)。表单仍应收起 — 输入框必须
    //    不反射保存后的值,即使在导航之后。
    await page.getByRole("link", { name: /Back/i }).click();
    await assert.urlMatches(page, /\/$/);

    await page.getByRole("link", { name: /Settings/i }).click();
    await assert.urlMatches(page, /\/settings$/);

    // 静止时无 password 输入。
    await assert.count(page.locator('input[type="password"]'), 0);

    // 再点击 "Set API key…" 仍得到空输入。
    await page
      .getByRole("button", { name: /Set API key/i })
      .first()
      .click();
    const freshInput = page.locator('input[type="password"]').first();
    await assert.value(freshInput, "");
  });
});
