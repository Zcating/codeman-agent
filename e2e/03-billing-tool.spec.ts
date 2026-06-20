//! 03 — 聊天 → billing 工具调用。
//!
//! 最难的 spec。聊天运行时通过 pi-mono 调用真实 LLM,这会
//! (a) 需要真实 API key 和 (b) 访问网络。我们不
//! 断言 LLM 响应本身 — 那是集成 spec 的工作,不是 e2e 的。
//!
//! 我们断言的内容：
//!  1. 聊天布局可交互:textarea 启用,send 可点击。
//!  2. 可以从 sidebar 创建新会话。
//!  3. 发送消息将 user-message bubble 追加到 DOM
//!     (验证完整写入路径:ChatView → store → IPC → SQLite)。
//!  4. 助手开始响应(流式 bubble 在合理超时内出现)或
//!     agent 干净地报错 — 两种结果都可接受;我们只希望运行时不要死锁。
//!
//! 这是"聊天循环活着"烟雾测试。

import { test, expect } from "@playwright/test";
import {
  assert,
  clearAllHistory,
  disposeTauriPage,
  getTauriPage,
  invoke,
  submitForm,
} from "./helpers";
import { loadEnvFile } from "./env-loader";
import type { Settings } from "../src/shared/lib/types";

const USER_PROMPT = "查一下 DeepSeek 余额";

test.describe("03 — 聊天 → billing 工具", () => {
  test.beforeAll(async () => {
    // 软注入：.env 提供 MINIMAX_CN_API_KEY + MINIMAX_CN_API_BASE_URL
    // 时通过 IPC 注入 Tauri store + 强制把活跃 provider 切到 minimax
    // + override provider 的 base_url 到 .env 里的端点（CN 端点,跟 V1
    // 默认 global 端点不同 — 用户提供的 .env 才是真实测试场景）。
    const page = await getTauriPage();
    // 先把页面拉回 / — 前面的 spec 02 把 webview 留在 /settings,
    // disposeTauriPage 只关 CDP,webview target 的 history 仍然停在 /settings,
    // 那时 ChatLayout 已 unmount,footer 的 Settings 链接找不到,15s 超时。
    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });

    const envFile = loadEnvFile();
    const envKey = envFile.MINIMAX_CN_API_KEY ?? process.env.MINIMAX_CN_API_KEY;
    const envBaseUrl = envFile.MINIMAX_CN_API_BASE_URL ?? process.env.MINIMAX_CN_API_BASE_URL;
    if (envKey && envKey.length > 0) {
      // ADR-0015: unified providers[] schema. api_key + base_url live on Provider directly.
      const current = await invoke<Settings>("get_settings");
      const providers = (current.providers ?? []).map((p) =>
        p.id === "minimax"
          ? {
              ...p,
              api_key: envKey,
              llm: { ...p.llm, base_url: envBaseUrl ?? p.llm.base_url },
            }
          : p,
      );
      await invoke("update_settings", {
        newSettings: { ...current, providers, default_llm_provider_id: "minimax" },
      });
    }
  });

  test.beforeEach(async () => {
    // 清除遗留会话,使 "new conversation" 是唯一的一个。
    await clearAllHistory();
  });

  test.afterAll(async () => {
    await disposeTauriPage();
  });

  test("发送消息并验证聊天循环活着", async () => {
    const page = await getTauriPage();

    // 诊断: 听 console + pageerror 看 LLM call 实际失败原因
    page.on("console", (msg) => {
      const t = msg.text;
      if (t.includes("[vite]") || t.includes("[HMR]")) return;
      console.log(`[page ${msg.type}] ${t}`);
    });
    page.on("pageerror", (err) => {
      console.log(`[page pageerror] ${err.message}`);
    });

    // 1. 创建新会话。这是必需的:ChatView 拒绝在没有 activeId 的情况下发送。
    const newConvButton = page.locator('button[title="新建会话"]');
    await assert.visible(newConvButton);
    await newConvButton.click();

    // 2. textarea 应启用且为空。
    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await assert.enabled(textarea);

    // 等 sidebar 的 active conversation 出现 — 这保证 createConversation IPC
    // 已完成、activeId 已设置。否则 fill+submit 时 activeId 还是 null,
    // send() 早 return,user bubble 不出现。
    const activeItem = page.locator("aside li.bg-primary").first();
    await assert.visible(activeItem, { timeout: 5_000 });

    // 3. 输入并发送。
    await textarea.fill(USER_PROMPT);
    // 用 form.requestSubmit() 替代 button click — 在 WebView2 + cdp-driver
    // 组合下,submit button 的 click 事件并不总是触发 form submit 默认动作。
    // requestSubmit() 直接触发 submit 事件,经过 Solid 的 onSubmit listener。
    await submitForm(page);

    // 4. user bubble 立即出现(同步写入 store + DB),
    //    所以这个断言是"写入路径正常"检查。
    await assert.visible(page.getByText(USER_PROMPT, { exact: false }), {
      timeout: 5_000,
    });

    // 5. 稍等片刻后,二者之一:
    //    - assistant message bubble 出现(LLM 调用成功,或
    //      报错但运行时仍渲染了占位符),或
    //    - Send 按钮被 Cancel 按钮替代(运行时仍在流式,
    //      这是 OK 信号 — 它没有死锁)。
    //
    //    我们不激进超时:真实 LLM 调用冷启动可能需要
    //    10-20s,缺失 API key 仍会产生足够长的 "thinking" 状态。
    //    30s 是合理的预算。
    const deadline = Date.now() + 30_000;
    let ok = false;
    let lastDiag = "";
    while (Date.now() < deadline) {
      // Assistant bubble: 找 justify-start 容器内的 white bg bubble
      // (message-bubble.tsx 给 assistant 用 bg-card dark:bg-zinc-800,
      // 跟 user 的 bg-primary-500 text-white 区分开)
      const assistantBubbles = await page
        .locator("div.justify-start > div[class*='bg-card']")
        .count();
      const cancelButtonVisible = (await page.getByRole("button", { name: /取消/i }).count()) > 0;
      // 抓 textarea disabled 状态 + 任何 error 状态
      const diagState = await page.evaluate(() => {
        const ta = document.querySelector(
          'textarea[placeholder="发条消息\u2026"]',
        ) as HTMLTextAreaElement | null;
        return {
          taDisabled: ta?.disabled ?? null,
          hasSendBtn: !!document.querySelector('button[type="submit"]'),
          hasCancelBtn: !!Array.from(document.querySelectorAll("button")).find((b) =>
            /取消/i.test(b.textContent ?? ""),
          ),
        };
      });
      lastDiag = JSON.stringify(diagState);
      if (assistantBubbles > 0 || cancelButtonVisible) {
        ok = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log(`[spec03 final diag] ${lastDiag} ok=${ok}`);
    expect(ok, "30s 内未观察到 assistant bubble 或 Cancel 按钮 — 聊天循环死了锁").toBe(true);
  });
});
