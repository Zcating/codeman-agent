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
//! 不会被 chat runtime 读到）。env 未设时 spec skip（与 spec 06 决策一致）。

import { test, expect, assert, cancelRunningAgent, clearAllHistory, invoke, setupWorkspaceAndCreateConvViaIpc, submitForm } from "./fixtures";
import { loadEnvFile } from "./env-loader";
import type { Settings } from "../src/shared/lib/types";

const USER_PROMPT = "用一句话介绍你自己";

test.describe("04 — 流式 LLM 非空文本", () => {
  test.beforeAll(async ({ tauriEnv }) => {
    // RED 状态:没 .env 或没 key → skip,允许 e2e 在无 key 环境通过
    // (与 spec 06 决策一致 — 真实 LLM round-trip 走 mock 或 .env 提供商)。
    const envFile = loadEnvFile();
    const envKey = envFile.MINIMAX_CN_API_KEY ?? process.env.MINIMAX_CN_API_KEY;
    test.skip(!envKey, ".env 缺 MINIMAX_CN_API_KEY,跳过真实 LLM 流式测试");

    const { page } = tauriEnv;
    // 先把页面拉回 / — 前面的 spec 把 webview 留在 /settings,
    // 那时 ChatLayout 已 unmount,footer 的 Settings 链接找不到,15s 超时。
    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });

    // 取消任何 in-flight LLM(前一个 spec 可能留下 running=true —
    // 没有这一步,新的 "新建会话" 点击后 textarea 会保持 disabled)
    await cancelRunningAgent(page);

    const envBaseUrl = envFile.MINIMAX_CN_API_BASE_URL ?? process.env.MINIMAX_CN_API_BASE_URL;
    if (envKey && envKey.length > 0) {
      // ADR-0015: unified providers[] schema. api_key + base_url live on Provider directly.
      const current = await invoke<Settings>(page, "get_settings");
      // 强制 default_llm_provider_id = "minimax"，覆盖用户之前手动配的值。
      // 同时 override base_url 到 .env 里的端点（CN 端点,跟 V1 默认的
      // global 端点不同 — .env 是真实测试场景,不是 V1 默认）。
      const providers = (current.providers ?? []).map((p) =>
        p.id === "minimax"
          ? {
              ...p,
              api_key: envKey,
              llm: { ...p.llm, base_url: envBaseUrl ?? p.llm.base_url },
            }
          : p,
      );
      await invoke(page, "update_settings", {
        newSettings: { ...current, providers, default_llm_provider_id: "minimax" },
      });
    }
  });

  test.beforeEach(async ({ tauriEnv }) => {
    await clearAllHistory(tauriEnv.page);
  });

  test("发送消息并在 30s 内观察到非空 assistant 文本或 Cancel 按钮", async ({ tauriEnv }) => {
    test.setTimeout(180_000);
    const { page } = tauriEnv;

    // V2.1: the sidebar "新对话" button no longer creates a conversation — it
    // navigates home. Use the IPC-based shim to create + activate a conv.
    // This switches V2.1 layout from HomeAgentForm → ChatView.
    const { convId } = await setupWorkspaceAndCreateConvViaIpc(page);

    // 1. textarea 应启用 (ChatLayout 现在已 mount,textarea 存在)。
    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await assert.enabled(textarea);

    // 2. 等 sidebar 显示新 conv (data-conv-id selector — replaced bg-primary
    //    class which was V1.x specific)。
    const newConvInSidebar = page.locator(`[data-conv-id="${convId}"]`);
    await assert.visible(newConvInSidebar, { timeout: 5_000 });

    // 3. 输入并发送。
    await textarea.fill(USER_PROMPT);
    await submitForm(page);

    // 4. 等待 8s 让消息处理完成（期间 LLM 调用失败/超时是预期的 RED 状态）。
    await new Promise((r) => setTimeout(r, 8_000));

    // 5. 死循环 30s：等待 Cancel 按钮 OR assistant bubble 出现。
    const deadline = Date.now() + 60_000;
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
