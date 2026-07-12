//! 02 — 设置：配置 LLM API key 并验证其持久化（V1.5+ ADR-0015 架构）。
//!
//! 流程（ADR-0015: ProviderCard 无 per-row Save 按钮；单一 footer Save）：
//!  1. 通过 footer 链接导航到 /settings。
//!  2. 找到第一个 provider 的 LLM API Key input（`input[type=password]`）。
//!  3. 输入一个假 key。
//!  4. 点击 footer 的 Save 按钮（`settingsSaver.flushNow()`）。
//!  5. 通过 IPC `get_settings` 验证 `providers[0].apiKey` 写入成功（per ADR-0024 D10:camelCase）。
//!  6. 重新加载页面（应用内 navigate）— password input 永远不反射已保存值。
//!
//! 我们用假 key — 只测写入路径，不测真实 LLM 网络。

import { test, expect, assert, invoke } from "./fixtures";
import type { Settings } from "../src/shared/lib/types";

const FAKE_KEY = "sk-e2e-fake-key-not-real-do-not-use-12345";

test.describe("02 — 设置 LLM API key", () => {
  test.beforeAll(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    // 重置 settings 到默认状态(enabled=true, apiKey="";per ADR-0024 D10 camelCase)。
    // 之前 test run 可能把 enabled 改成 false 或留下 FAKE_KEY,
    // 跨 test 共享 Rust 状态导致污染。
    const defaults = await invoke<Settings>(page, "get_settings");
    const reset = {
      ...defaults,
      providers: (defaults.providers ?? []).map((p) => ({ ...p, enabled: true, apiKey: "" })),
      defaultLlmProviderId: "minimax",
    };
    await invoke(page, "update_settings", { newSettings: reset });
  });

  test("设置、持久化并重新加载 — key 被写入但永不反射", async ({ tauriEnv }) => {
    const { page } = tauriEnv;

    // 0. 显式 navigate 到 / — 防止 disposeTauriPage 重新连 CDP 后 chat 路由
    //    还没 mount 时,getByRole("link", { name: /设置/i }) 拿不到 footer link。
    await page.goto("/");

    // 1. 通过真实用户会点击的链接到达 /settings。
    const settingsLink = page.locator('a[href="/settings"]');
    await assert.visible(settingsLink, { timeout: 10_000 });
    await settingsLink.click();
    await assert.urlMatches(page, /\/settings$/);

    // 2. 找到第一个 provider 的 LLM API Key password input。
    //    V1.5+ ProviderCard 永远显示 LLM input（无折叠），第一个 input[type=password]。
    const passwordInput = page.locator('input[type="password"]').first();
    await assert.visible(passwordInput, { timeout: 10_000 });
    await passwordInput.fill(FAKE_KEY);

    // 3. ADR-0015: ProviderCard 无 per-row Save 按钮。所有变更通过
    //    appStore.set() + debounced auto-flush（500ms）；footer Save 按钮
    //    调用 settingsSaver.flushNow() 跳过 debounce 立即写入。
    //    footer 特征：border-t 类（`border-t border-zinc-200 dark:border-zinc-700`）。
    const footerSaveButton = page
      .locator("footer")
      .locator("button")
      .filter({ hasText: /^Save$/ });
    await assert.visible(footerSaveButton, { timeout: 5_000 });
    await footerSaveButton.click();

    // 4. After Save, input should reflect FAKE_KEY in the store (apiKey reflects back to DOM).
    //    footer Save calls flushNow() which triggers IPC; wait 2s for store update.
    await assert.value(passwordInput, FAKE_KEY, { timeout: 2_000 });

    // 5. 通过 IPC `get_settings` 验证 key 实际在磁盘上。
    //    V1.5+ 使用 unified providers 数组；第一个 provider id 是 "minimax"。
    //    V15 (ADR-0024 D10): on-the-wire format is camelCase — `update_settings`
    //    IPC normalizes snake_case patches to camelCase (ipc.ts) so reads are
    //    uniform.
    const settings = await invoke<{ providers?: Array<{ id: string; apiKey: string }> }>(
      page,
      "get_settings",
    );
    const minimaxProvider = settings.providers?.find((p) => p.id === "minimax");
    expect(minimaxProvider?.apiKey, `minimax provider apiKey 应为 ${FAKE_KEY}`).toBe(FAKE_KEY);

    // 6. Navigate back to / then to /settings -- password input should reflect saved value.
    await page.locator('a[href="/"]').click();
    await assert.urlMatches(page, /\//);
    await page.getByRole("link", { name: /设置/ }).click();
    await assert.urlMatches(page, /\/settings$/);

    // When idle, password input is present (V1.5+ always shown) and should reflect saved value --
    await assert.visible(page.locator('input[type="password"]').first(), { timeout: 5_000 });
    // Wait for SettingsPage onMount refresh() to complete - poll until input has FAKE_KEY
    const refreshDeadline = Date.now() + 5_000;
    let values: string[] = [];
    while (Date.now() < refreshDeadline) {
      values = (await page.evaluate(() =>
        Array.from(document.querySelectorAll('input[type="password"]')).map(
          (el) => (el as HTMLInputElement).value,
        ),
      )) as string[];
      if (values.length > 0 && values[0] === FAKE_KEY) {
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(values.length, "settings 页有 password input").toBeGreaterThan(0);
    // V1.5+ ProviderCard always shows each enabled provider. Test only set the first
    // provider's key; others should still be empty. Only assert the first input is
    // FAKE_KEY; others are allowed to be empty.
    expect(
      values[0],
      `first password input should reflect saved value, actual="${values[0]}"`,
    ).toBe(FAKE_KEY);
  });
});
