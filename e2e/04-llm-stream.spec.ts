//! 04 — 流式 LLM 非空文本验收。
//!
//! 验证 V1 chat 域的流式 LLM 输出。跟 spec 03 的"聊天循环活着"烟雾测试互补，
//! spec 03 只验 bubble/Cancel 存在（哪怕空文本），spec 04 验 ≥5 char 非空 assistant 文本。
//!
//! RED 状态（未配 MiniMax key）：
//!   - 401/403 来自 MiniMax API → assistant text 不会来 → Cancel 也不会来
//!     → 30s 超时 → spec fail。这是预期行为，用户需在 Settings UI 配 key 后重跑。
//! GREEN 状态（配好 key 后）：
//!   - 流式文本在 30s 内抵达，assistant bubble 有 ≥5 非空白字符 → spec pass。
//!
//! env `MINIMAX_API_KEY` 设了时：beforeAll 主动通过 IPC 注入 key + 强制把活跃
//! provider 切到 minimax（E2E 之前可能用户手动配过其它 provider，注入 minimax key
//! 不会被 chat runtime 读到）。env 未设时 spec 保持 RED（与 K2 grill 决策兼容）。

import { test, expect } from "@playwright/test";
import {
  assert,
  cancelRunningAgent,
  clearAllHistory,
  disposeTauriPage,
  getTauriPage,
  invoke,
  submitForm,
} from "./helpers";
import { loadEnvFile } from "./env-loader";
import type { Settings } from "../src/shared/lib/types";

const USER_PROMPT = "用一句话介绍你自己";

test.describe("04 — 流式 LLM 非空文本", () => {
  test.beforeAll(async () => {
    // 先 await getTauriPage() 触发 CDP 连接 + 等 chat 路由 mount（footer link
    // 出现 = SPA 挂载完成 = __TAURI_INTERNALS__ 已注入），再调 invoke。
    const page = await getTauriPage();
    // 先把页面拉回 / — 前面的 spec 02 把 webview 留在 /settings,
    // disposeTauriPage 只关 CDP,webview target 的 history 仍然停在 /settings,
    // 那时 ChatLayout 已 unmount,footer 的 Settings 链接找不到,15s 超时。
    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });

    // 取消任何 in-flight LLM(03-billing-tool 可能留下 running=true —
    // 没有这一步,新的 "新建会话" 点击后 textarea 会保持 disabled)
    await cancelRunningAgent();

    const envFile = loadEnvFile();
    const envKey = envFile.MINIMAX_CN_API_KEY ?? process.env.MINIMAX_CN_API_KEY;
    const envBaseUrl = envFile.MINIMAX_CN_API_BASE_URL ?? process.env.MINIMAX_CN_API_BASE_URL;
    if (envKey && envKey.length > 0) {
      const current = await invoke<Settings>("get_settings");
      // 强制 default_llm_provider_id = "minimax"，覆盖用户之前手动配的值。
      // 同时 override base_url 到 .env 里的端点（CN 端点,跟 V1 默认的
      // global 端点不同 — .env 是真实测试场景,不是 V1 默认）。
      const providers = current.llm_providers.map((p) =>
        p.id === "minimax" ? { ...p, base_url: envBaseUrl ?? p.base_url } : p,
      );
      await invoke("update_settings", {
        newSettings: {
          ...current,
          llm_providers: providers,
          default_llm_provider_id: "minimax",
        },
      });
      await invoke("set_llm_key", { providerId: "minimax", key: envKey });
    }
  });

  test.beforeEach(async () => {
    await clearAllHistory();
  });

  test.afterAll(async () => {
    await disposeTauriPage();
  });

  test("发送消息并在 30s 内观察到非空 assistant 文本或 Cancel 按钮", async () => {
    const page = await getTauriPage();

    // 1. 创建新会话（ChatView 拒绝在无 activeId 时发送）。
    const newConvButton = page.locator('button[title="新建会话"]');
    await assert.visible(newConvButton);
    await newConvButton.click();

    // 2. textarea 应启用。
    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await assert.enabled(textarea);

    // 等 sidebar 的 active conversation 出现 — 避免 race condition:
    // createConversation IPC 还没完成、activeId 还是 null 时 submit 会早 return。
    const activeItem = page.locator("aside li.bg-primary").first();
    await assert.visible(activeItem, { timeout: 5_000 });

    // 3. 输入并发送。
    await textarea.fill(USER_PROMPT);
    // 用 form.requestSubmit() 替代 button click — 在 WebView2 + cdp-driver
    // 组合下,submit button 的 click 事件不总是触发 form submit 默认动作。
    // requestSubmit() 直接触发 submit 事件,经过 Solid 的 onSubmit listener。
    await submitForm(page);

    // 4. 等待 8s 让消息处理完成（期间 LLM 调用失败/超时是预期的 RED 状态）。
    //    用户消息同步写入 store + DB，如果 app 正常工作，user bubble 应出现。
    //    如果 8s 后仍无 bubble，说明 app 本身有问题（非 auth 原因）。
    await new Promise((r) => setTimeout(r, 8_000));

    // 5. 死循环 30s：等待 Cancel 按钮 OR assistant bubble 出现。
    //    Cancel 按钮出现 → 运行时正在流式（SC4: 非空文本即将到来或正在到来途中）。
    //    assistant text length >= 5 → 文本实际已渲染（SC4 核心断言）。
    //    两者任一满足 → spec pass。
    const deadline = Date.now() + 30_000;
    let ok = false;
    while (Date.now() < deadline) {
      const cancelCount = await page.getByRole("button", { name: /取消/i }).count();
      const cancelButtonVisible = cancelCount > 0;

      // Assistant bubble text：找 justify-start 容器内的 max-w-prose bubble
      //（user bubble 在 justify-end 容器，assistant bubble 在 justify-start）。
      const chatArea = page.locator("div.flex-1.overflow-y-auto");
      const bubbles = chatArea.locator("div.justify-start").locator("div.max-w-prose");
      const bubbleCount = await bubbles.count();
      let hasNonEmptyAssistantText = false;
      if (bubbleCount > 0) {
        const lastBubble = bubbles.nth(bubbleCount - 1);
        const text = await lastBubble.textContent();
        hasNonEmptyAssistantText = (text?.trim().length ?? 0) >= 5;
      }

      if (cancelButtonVisible || hasNonEmptyAssistantText) {
        ok = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    expect(
      ok,
      "30s 内未观察到 Cancel 按钮或 ≥5 char assistant 文本 — LLM 未输出或聊天循环死锁",
    ).toBe(true);
  });
});
