//! 07 — Mock LLM provider: 验证 e2e mock LLM provider 能产生稳定的非空响应。
//!
//! 这个 spec 验证 mock LLM provider 自身工作正常,作为其他可能用到 mock 的 spec 的
//! smoke test。Mock provider 绕过真实 LLM,直接返回 e2e 预置的固定文本,
//! 不依赖网络和 LLM 服务,适合做环境基线校验。
//!
//! V2 简化:billing 工具已移除,本 spec 只验证纯文本响应。
//! 工具调用的 mock 行为在 08-file-tools-mock.spec.ts 验证。

import { test, expect, assert, cancelRunningAgent, clearAllHistory, clickNewConversationAndWait, invoke, submitForm } from "./fixtures";
import { useMockProvider, enqueueMockResponse, clearMockQueue } from "./mock-provider";
import * as path from "node:path";
import * as os from "node:os";

test.describe("07 — Mock LLM provider", () => {
  test.beforeAll(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });
    // D8-W: provision workspace via direct IPC (avoids setupWorkspaceAndCreateConvViaIpc's
    // home form send flow which triggers LLM streaming with whatever provider is active).
    await invoke(page, "add_workspace", {
      label: "Mock E2E Test Workspace",
      rootPath: path.join(os.tmpdir(), "codeman-e2e-mock-" + Date.now()),
    });
    // 切换到 mock provider — 不依赖 .env 里的真实 LLM key
    await useMockProvider(page);
    // 验证 mock provider 已配置 (避免之前 test 残留的真实 LLM provider 被优先使用)
    const settings = await invoke<{ default_llm_provider_id?: string }>(page, "get_settings");
    if (settings.default_llm_provider_id !== "mock") {
      throw new Error(
        "default_llm_provider_id 应为 mock,实际: " + (settings.default_llm_provider_id ?? "null"),
      );
    }
  });

  test.beforeEach(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    page.on("console", (msg: { type: string; text: string }) => {
      if (msg.type === "error") {
        console.log("[" + __filename + " page error]", msg.text);
      }
    });
    page.on("pageerror", (err: Error) => {
      console.log("[" + __filename + " page pageerror]", err.message);
    });
    await cancelRunningAgent(page);
    await clearAllHistory(page);
    await clearMockQueue(page);
    // Enqueue mock response for clickNewConversationAndWait's UI-driven send
    await enqueueMockResponse(page, { text: "Mock setup", delayMs: 50 });
    await clickNewConversationAndWait(page);
  });

  test("纯文本响应:assistant bubble 包含预置的固定文本", async ({ tauriEnv }) => {
    const { page } = tauriEnv;

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
    // 绛?text 杈惧埌瀹屽叡 text(mock 浠?4-char chunks 娴?+ 5ms delay,20 瀛楃闇€ 25ms+)
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
});
