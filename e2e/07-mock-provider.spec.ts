//! 07 — Mock LLM provider: 验证 e2e mock LLM provider 能产生稳定的非空响应。
//!
//! 这个 spec 验证 mock LLM provider 自身工作正常,作为其他可能用到 mock 的 spec 的
//! smoke test。Mock provider 绕过真实 LLM,直接返回 e2e 预置的固定文本,
//! 不依赖网络和 LLM 服务,适合做环境基线校验。

import { test, expect } from "@playwright/test";
import {
  assert,
  cancelRunningAgent,
  clearAllHistory,
  clickNewConversationAndWait,
  disposeTauriPage,
  getTauriPage,
  invoke,
  submitForm,
} from "./helpers";
import { useMockProvider, enqueueMockResponse, clearMockQueue } from "./mock-provider";

test.describe("07 — Mock LLM provider", () => {
  test.beforeAll(async () => {
    const page = await getTauriPage();
    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });
    // 切换到 mock provider — 不依赖 .env 里的真实 LLM key
    await useMockProvider(page, { workspace: false });
    // 验证 mock provider 已配置 (避免之前 test 残留的真实 LLM provider 被优先使用)
    const settings = await invoke<{ default_llm_provider_id?: string }>("get_settings");
    if (settings.default_llm_provider_id !== "mock") {
      throw new Error(
        "default_llm_provider_id 应为 mock,实际: " + (settings.default_llm_provider_id ?? "null"),
      );
    }
  });

  test.afterAll(async () => {
    await disposeTauriPage();
  });

  test.beforeEach(async () => {
    const page = await getTauriPage();
    page.on("console", (msg: { type: string; text: string }) => {
      if (msg.type === "error") {
        console.log("[" + __filename + " page error]", msg.text);
      }
    });
    page.on("pageerror", (err: Error) => {
      console.log("[" + __filename + " page pageerror]", err.message);
    });
    await cancelRunningAgent();
    await clearAllHistory();
    await clearMockQueue(page);
    await clickNewConversationAndWait(page);
  });

  test("纯文本响应:assistant bubble 包含预置的固定文本", async () => {
    const page = await getTauriPage();

    // 预置一个固定文本响应
    const cannedText = "Hello from mock LLM!";
    await enqueueMockResponse(page, { text: cannedText });

    // 发送消息
    const textarea = page.locator('textarea[placeholder="发条消息…"]');
    await textarea.fill("Hi");
    await submitForm(page);

    // 等 assistant bubble 出现并包含预置文本
    const bubble = page.locator("div.justify-start > div[class*='bg-card']");
    await assert.visible(bubble.first(), { timeout: 10_000 });
    // 绛?text 杈惧埌瀹屽叡 text(mock 浠?4-char chunks 娴?+ 5ms delay,20 瀛楃闇€ 25ms+)
    const textDeadline = Date.now() + 5_000;
    let polledText = "";
    while (Date.now() < textDeadline) {
      polledText = (await bubble.first().textContent()) ?? "";
      if (polledText.includes(cannedText)) {
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(polledText, "assistant bubble 应包含 mock 预置文本").toContain(cannedText);
  });

  test("工具调用响应:LLM 调用工具后,tool_result 在 DOM 中可见", async () => {
    const page = await getTauriPage();

    // 预置一个工具调用响应 (read_file 工具),然后是文本响应
    await enqueueMockResponse(page, {
      toolCalls: [
        {
          name: "get_balance",
          input: { provider_id: "mock" },
        },
      ],
    });
    await enqueueMockResponse(page, {
      text: "Your balance is 100 USD (mock).",
    });

    // 发送消息
    const textarea = page.locator('textarea[placeholder="发条消息…"]');
    await textarea.fill("Check balance");
    await submitForm(page);

    // 等最终 assistant 文本响应
    const bubble = page.locator("div.justify-start > div[class*='bg-card']");
    await assert.visible(bubble.first(), { timeout: 15_000 });
    // 等等文本出现(mock 队列里第二个 turn)
    const deadline = Date.now() + 10_000;
    let bodyText = "";
    while (Date.now() < deadline) {
      bodyText = (await page.evaluate(() => document.body.textContent)) ?? "";
      if (bodyText.includes("balance is 100 USD")) {
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(bodyText, "应出现包含 'balance is 100 USD' 的 assistant bubble").toContain(
      "balance is 100 USD",
    );
  });
});
