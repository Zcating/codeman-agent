//! 06 — 正常输入 → 配置 API Key → 2 个 bubble (user + assistant)。
//!
//! 用户的核心需求:"如果配置了 API Key,正常输入就会有 2 个 bubble"。
//! 这个 spec 验证端到端 LLM round-trip:
//!  1. 读 .env,如果 MINIMAX_CN_API_KEY 缺失就 skip(test 没 key 没法验)
//!  2. 在 beforeAll 注入 key + override base_url 到 .env 端点
//!  3. 正常输入消息 + 提交
//!  4. 等 user bubble(本地写 store,5s 内出现)
//!  5. 等 assistant bubble(LLM 调用 + 流式,90s — CN 端点可能冷启动慢)
//!  6. 断言 DOM 里 user bubble = 1 + assistant bubble = 1,合计 2 个
//!
//! RED 状态:.env 没配 MINIMAX_CN_API_KEY → test.skip
//! RED 状态:LLM 调用 90s 内没返回文本 → expect 失败(端点不可达 / key 无效 / CORS)
//! GREEN 状态:user bubble 5s 内 + assistant bubble 90s 内,2 bubble 数量 = 2
//!
//! 跟 spec 05 #1 区别:这个 spec 不等 Cancel 按钮,直接等 assistant bubble。
//! 也不依赖 spec 03/04-llm-stream 的状态(独立 beforeAll)。
//! 也不依赖 page.goto + LLM 立即返回 — 允许 90s LLM 冷启动。

import { test, expect } from "@playwright/test";
import { assert, clearAllHistory, clickNewConversationAndWait, disposeTauriPage, getTauriPage, invoke, resetChatState, submitForm } from "./helpers";
import { loadEnvFile } from "./env-loader";
import type { Settings } from "../src/shared/lib/types";

const USER_PROMPT = "用一句话介绍你自己";

// 注入配置 (beforeAll 填充),供 test body 使用
let injectedKey: string | undefined;
let injectedBaseUrl: string | undefined;

test.describe("06 — LLM round-trip", () => {
  test.beforeAll(async () => {
    const envFile = loadEnvFile();
    const envKey = envFile.MINIMAX_CN_API_KEY ?? process.env.MINIMAX_CN_API_KEY;
    const envBaseUrl = envFile.MINIMAX_CN_API_BASE_URL ?? process.env.MINIMAX_CN_API_BASE_URL;

    // RED 状态:没 .env 或没 key → skip 整个 spec,不在 e2e 报告里 fail
    test.skip(!envKey, ".env 缺 MINIMAX_CN_API_KEY — 没法验证 LLM round-trip,skip");

    const page = await getTauriPage();
    // 先把页面拉回 / — 前面的 spec 02 把 webview 留在 /settings,
    // disposeTauriPage 只关 CDP,webview target 的 history 仍然停在 /settings,
    // 那时 ChatLayout 已 unmount,footer 的 Settings 链接找不到,15s 超时。
    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });

    if (envKey && envKey.length > 0) {
      injectedKey = envKey;
      injectedBaseUrl = envBaseUrl;
      const current = await invoke<Settings>("get_settings");
      const providers = current.llm_providers.map((p) =>
        p.id === "minimax"
          ? { ...p, base_url: envBaseUrl ?? p.base_url }
          : p,
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
    // 重置 chat 状态:cancel in-flight LLM → 清 DB → reload → 等 mount 完成
    await resetChatState();
    await clearAllHistory();
  });

  test.afterAll(async () => {
    await disposeTauriPage();
  });

  test("正常输入 + 配 API Key → 1 user + 1 assistant = 2 bubble", async () => {
    const page = await getTauriPage();

    // 诊断: 听 console + pageerror — LLM 错误会从 chat-view catch 打到 console,
    // 这里转发到 Node 端方便诊断。
    page.on("console", (msg) => {
      const t = msg.text;
      console.log(`[page ${msg.type}] ${t}`);
    });
    page.on("pageerror", (err) => {
      console.log(`[page pageerror] ${err.message}`);
    });

    // 1. 到达聊天页面。
    await page.goto("/");
    await assert.visible(page.locator('textarea[placeholder="Type a message…"]'), {
      timeout: 15_000,
    });

    // 2. 创建新会话 + 等 active item + loadMessages 完成(避免 race)。
    await clickNewConversationAndWait(page);

    // 3. textarea 启用 + 正常输入 + 提交。
    const textarea = page.locator('textarea[placeholder="Type a message…"]');
    await assert.enabled(textarea);
    await textarea.fill(USER_PROMPT);
    await submitForm(page);

    // 3.5. 诊断 — submit 后立即看 DOM 状态,看 send() 是否真的跑了。
    const submitState = await page.evaluate(() => {
      const ta = document.querySelector(
        'textarea[placeholder="Type a message…"]',
      ) as HTMLTextAreaElement | null;
      const sidebarItems = document.querySelectorAll("aside li").length;
      const bubbles = document.querySelectorAll(
        "div.justify-end > div.bg-primary-500.text-white",
      ).length;
      return {
        taValue: ta?.value,
        taDisabled: ta?.disabled,
        sidebarItems,
        bubbles,
      };
    });
    console.log(`[submitState] ${JSON.stringify(submitState)}`);

    // 4. 严格:user bubble 出现(本地 store 同步写,5s 内必现)。
    const userBubble = page
      .locator("div.justify-end > div.bg-primary-500.text-white")
      .filter({ hasText: USER_PROMPT });
    await assert.visible(userBubble, { timeout: 5_000 });
    const userText = await userBubble.textContent();
    expect(userText, "bubble 必须包含用户输入").toContain(USER_PROMPT);

    // 4.5. PROBE — 用 webview fetch 直接打 LLM endpoint,绕过 pi-ai 看真实 HTTP 行为。
    //     跟 provider 是否可达、CORS、response 解析都有关。
    const probeResult = await page.evaluate(async (args) => {
      const out: any = { origin: window.location.origin, href: window.location.href };
      // Test 3 header combos: with anthropic-version, without, with x-api-key
      const tries: Array<{ name: string; headers: Record<string, string> }> = [
        { name: "Auth+AnthropicVer", headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${args.key}`,
          "anthropic-version": "2023-06-01",
        }},
        { name: "Auth-only", headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${args.key}`,
        }},
        { name: "x-api-key+AnthropicVer", headers: {
          "Content-Type": "application/json",
          "x-api-key": args.key,
          "anthropic-version": "2023-06-01",
        }},
      ];
      const results: any[] = [];
      for (const t of tries) {
        try {
          const resp = await fetch(args.url, {
            method: "POST",
            headers: t.headers,
            body: JSON.stringify({
              model: args.model,
              max_tokens: 30,
              messages: [{ role: "user", content: "hi" }],
            }),
          });
          const text = await resp.text();
          results.push({ name: t.name, status: resp.status, body: text.slice(0, 100) });
        } catch (e) {
          results.push({ name: t.name, error: String(e).slice(0, 100) });
        }
      }
      out.tries = results;
      out.ok = true;
      return out;
    }, {
      url: `${injectedBaseUrl ?? "https://api.minimaxi.com/anthropic"}/v1/messages`,
      key: injectedKey!,
      model: "MiniMax-M2.5-highspeed",
    });
    console.log(`[PROBE] ${JSON.stringify(probeResult).slice(0, 2000)}`);

    // 4.6. 抓 LLM 真实错误 — 如果 30s 内 assistant bubble 不出,看 console 里
    //     [ChatView] 代理错误 的 message,这样能知道是 401 / 404 / CORS / timeout。
    const llmErrorPromise = new Promise<string>((resolve) => {
      const onConsole = (msg: { type: string; text: string }) => {
        if (msg.text.includes("[ChatView] 代理错误")) {
          page.off("console", onConsole);
          resolve(msg.text);
        }
      };
      page.on("console", onConsole);
      setTimeout(() => resolve(""), 30_000);
    });

    // 5. 严格:assistant bubble 出现(LLM 调用 + 流式,30s — CN 端点冷启动慢,
    //    但 30s 够 cold start;如果 >30s 还不出,说明 endpoint 不可达 / key 错 / CORS)。
    //    message-bubble.tsx 给 assistant 用 bg-white dark:bg-zinc-800,
    //    跟 user 的 bg-primary-500 text-white 区分开。
    const assistantBubble = page.locator(
      "div.justify-start > div[class*='bg-white']",
    );
    // 30s 短 timeout — 如果 LLM 错误,会快速在 console 打印,然后 Stream 结束
    // running=false,Cancel 按钮消失。给点时间 (30s) 但不要太长。
    await assert.visible(assistantBubble.first(), { timeout: 30_000 });
    const assistantText = await assistantBubble.first().textContent();
    expect(
      assistantText && assistantText.trim().length > 0,
      "assistant bubble 必须有非空文本",
    ).toBe(true);

    // 6. 核心断言:DOM 里恰好 1 个 user + 1 个 assistant = 2 个 bubble。
    const userCount = await page
      .locator("div.justify-end > div.bg-primary-500.text-white")
      .count();
    const assistantCount = await page
      .locator("div.justify-start > div[class*='bg-white']")
      .count();
    expect(userCount, `应该只有 1 个 user bubble,实际 ${userCount}`).toBe(1);
    expect(assistantCount, `应该只有 1 个 assistant bubble,实际 ${assistantCount}`).toBe(
      1,
    );
  });
});
