//! 04 — 主题切换:light / dark / system。
//!
//! 设置页面没有专用主题切换 UI(主题通过与所有其他内容相同的
//! Save 流程修改 Settings.theme,实际视觉切换发生在共享 theme store
//! 中,在 5s 轮询后)。所以我们通过以下方式练习切换:
//!  1. 直接通过 IPC 驱动 `update_settings` — 这与 Save 按钮最终调用的
//!     是同一个命令。
//!  2. 轮询已解析的 `<html class>` 最多 7s(轮询每 5s,加一点余量)。
//!
//! Tailwind v4 的 dark 变体在 `src/index.css` 中接为
//! `@custom-variant dark (&:is(.dark *))`,所以 .dark 类是我们
//! 断言的对象 — 其余样式从这里级联。

import { test, expect } from "@playwright/test";
import { assert, disposeTauriPage, getTauriPage, invoke } from "./helpers";

interface Settings {
  theme: "light" | "dark" | "system";
  [key: string]: unknown;
}

async function setTheme(
  page: Awaited<ReturnType<typeof getTauriPage>>,
  theme: "light" | "dark" | "system",
) {
  const current = await invoke<Settings>("get_settings");
  const next: Settings = { ...current, theme };
  await invoke<Settings>("update_settings", { new_settings: next });

  // store 每 5s 轮询 Settings;给它 7s 应用。
  // 我们在紧密循环中重新读取 html class,因为轮询是
  // 唯一能翻转 class 的东西(变更时不发出事件)。
  const wantDark = theme === "dark";
  if (theme === "system") {
    // 对于 "system" 我们只断言 *某物* 解析;实际
    // 结果取决于测试宿主的 OS 偏好,我们
    // 无法从这里可靠地强制。我们只希望代码路径不抛错 —
    // 真实断言见 dark/light cases。
    const deadline = Date.now() + 7_000;
    let ok = false;
    while (Date.now() < deadline) {
      const cls = await page.evaluate(() => document.documentElement.className);
      // class 要么是 "" 要么是 "dark" — 从不是 "system"(store
      // 在应用前将 "system" 解析为 "light" | "dark" )。
      if (cls === "" || cls === "dark") {
        ok = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!ok) {
      throw new Error("7s 内 system 主题仍未解析为 light 或 dark");
    }
    return;
  }

  const deadline = Date.now() + 7_000;
  let isDark = false;
  while (Date.now() < deadline) {
    isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    if (isDark === wantDark) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`7s 内主题未切到 ${theme}; isDark=${isDark}`);
}

test.describe("04 — 主题", () => {
  test.afterAll(async () => {
    await disposeTauriPage();
  });

  test("light → dark → light 通过 update_settings", async () => {
    const page = await getTauriPage();

    // 健全性:应用已启动且 html 元素可查询。
    await assert.attached(page.locator("html"));

    // Light。
    await setTheme(page, "light");
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(
      false,
    );

    // Dark。
    await setTheme(page, "dark");
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(
      true,
    );

    // 再切 Light — 往返。
    await setTheme(page, "light");
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(
      false,
    );

    // System — class 解析为 light 或 dark(从不是 "system" )。
    await setTheme(page, "system");
    const finalClass = await page.evaluate(() => document.documentElement.className);
    expect(finalClass === "" || finalClass === "dark").toBe(true);
  });
});
