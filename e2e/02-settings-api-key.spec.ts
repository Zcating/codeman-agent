//! 02 — 设置：配置 LLM API key 并验证其持久化（V1.5 UI）。
//!
//! 流程（V1.5 ProviderCard 永远显示 LLM API Key input + Save button,不再有
//! 折叠的 "Set API key" 按钮）：
//!  1. 通过 footer 链接导航到 /settings。
//!  2. 找到第一个 provider 的 LLM API Key input（`input[type=password]`）。
//!  3. 输入一个假 key,点击它旁边的 Save 按钮。
//!  4. 通过 IPC `has_llm_key` 验证 key 实际被写入（端到端,不止 UI 关闭）。
//!  5. 重新加载页面（应用内 navigate）— 静止时无 password input（DOM 不反射）。
//!  6. 再 expand LLM API Key section,确认 input 仍是空（永不反射保存值）。
//!
//! 我们用假 key — 只测写入路径,不测真实 LLM 网络。

import { test, expect } from "@playwright/test";
import { assert, disposeTauriPage, getTauriPage, invoke } from "./helpers";

const FAKE_KEY = "sk-e2e-fake-key-not-real-do-not-use-12345";

test.describe("02 — 设置 LLM API key", () => {
  test.afterAll(async () => {
    await disposeTauriPage();
  });

  test("设置、持久化并重新加载 — key 被写入但永不反射", async () => {
    const page = await getTauriPage();

    // 0. 显式 navigate 到 / — 防止 disposeTauriPage 重新连 CDP 后 chat 路由
    //    还没 mount 时,getByRole("link", { name: /设置/i }) 拿不到 footer link。
    await page.goto("/");

    // 1. 通过真实用户会点击的链接到达 /settings。
    const settingsLink = page.locator('a[href="/settings"]');
    await assert.visible(settingsLink, { timeout: 10_000 });
    await settingsLink.click();
    await assert.urlMatches(page, /\/settings$/);

    // 2. 找到第一个 provider 的 LLM API Key password input。V1.5 ProviderCard
    //    永远显示 LLM input + Save button (没有折叠)。LLM 区域是第一个 input。
    const passwordInput = page.locator('input[type="password"]').first();
    await assert.visible(passwordInput, { timeout: 10_000 });
    await passwordInput.fill(FAKE_KEY);

    // 3. Save 按钮就在 input 旁边(同一个 flex row)。
    //    选 "Save" text 匹配 + 不是 destructive (destructive = Delete provider)。
    const saveButton = page
      .locator("button")
      .filter({ hasText: /^Save$/ })
      .first();
    await assert.visible(saveButton);
    await saveButton.click();

    // 4. 保存后 input 应清空 (security: 不反射保存值)。
    //    set_llm_key 同步完成,等 2s 看 value 是否变空。
    await assert.value(passwordInput, "", { timeout: 2_000 });

    // 5. 通过 IPC 命令验证 key 实际在磁盘上。V1.5 ProviderCard 把 id 渲染为
    //    纯文本 (不是 <code> 元素),我们直接用 .env 的 provider id "minimax"。
    //    V1 默认 LLM provider 就是 minimax (见 V1 默认配置)。
    const trimmedId = "minimax";

    const hasKey = await invoke<boolean>("has_llm_key", { providerId: trimmedId });
    expect(hasKey, `has_llm_key 对 ${trimmedId} 应返回 true`).toBe(true);

    // 6. 重新导航回 / 然后再去 /settings — DOM 不反射已存 key。
    //    静止时 0 个 password input (input 被收起,或 V1.5 永远显示但值为空)。
    await page.locator('a[href="/"]').click();
    await assert.urlMatches(page, /\//);
    await page.getByRole("link", { name: /设置/ }).click();
    await assert.urlMatches(page, /\/settings$/);

    // 静止时 password input 存在 (V1.5 永远显示) 但 value 为空 — 不反射保存值。
    await assert.visible(page.locator('input[type="password"]').first(), { timeout: 5_000 });
    const values = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input[type="password"]')).map(
        (el) => (el as HTMLInputElement).value,
      ),
    );
    expect(values.length, "settings 页有 password input").toBeGreaterThan(0);
    for (let i = 0; i < values.length; i++) {
      expect(values[i], `password input ${i} 不应反射保存值,实际="${values[i]}"`).toBe("");
    }
  });
});
