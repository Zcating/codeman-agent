//! 07 — Mock LLM provider: 验证 e2e mock LLM provider 能产生稳定的非空响应。
//!
//! 这个 spec 验证 mock LLM provider 自身工作正常,作为其他可能用到 mock 的 spec 的
//! smoke test。Mock provider 绕过真实 LLM,直接返回 e2e 预置的固定文本,
//! 不依赖网络和 LLM 服务,适合做环境基线校验。
//!
//! V2 简化:billing 工具已移除,本 spec 只验证纯文本响应。
//! 工具调用的 mock 行为在 08-file-tools-mock.spec.ts 验证。

import { test, expect, assert, cancelRunningAgent, clearAllHistory, clickNewConversationAndWait, invoke, submitForm } from "./fixtures";
import { useMockProvider } from "./mock-provider";
import * as path from "node:path";
import * as os from "node:os";

test.describe("07 — Mock LLM provider", () => {
  test.beforeAll(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });
    // D8-W: provision workspace via direct IPC (avoids setupWorkspaceAndCreateConvViaIpc's
    // home form send flow which triggers LLM streaming with whatever provider is active).
    await invoke(page, "addWorkspace", {
      label: "Mock E2E Test Workspace",
      rootPath: path.join(os.tmpdir(), `codeman-e2e-mock-${process.pid}-${Math.random().toString(36).slice(2, 8)}`),
    });
    // 切换到 mock provider — 不依赖 .env 里的真实 LLM key
    await useMockProvider(page);
    // 验证 mock provider 已配置 (避免之前 test 残留的真实 LLM provider 被优先使用)
    // V15 (ADR-0024 D10): Settings JSON is camelCase on the wire. `update_settings`
    // normalizes snake_case patches to camelCase so `get_settings` returns camelCase.
    const settings = await invoke<{ defaultLlmProviderId?: string }>(page, "getSettings");
    if (settings.defaultLlmProviderId !== "mock") {
      throw new Error(
        "defaultLlmProviderId 应为 mock,实际: " + (settings.defaultLlmProviderId ?? "null"),
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
    // clickNewConversationAndWait title send → default Q→A entry (warning SSE)
    await clickNewConversationAndWait(page);
  });

  test("纯文本响应:assistant bubble 包含预置的固定文本", async ({ tauriEnv }) => {
    const { page } = tauriEnv;

    // 通过 Q→A table: user text → 07::hi → SSE response
    const cannedText = "07::hi Hello from mock LLM!";

    // 等待 Send 按钮重新出现(clickNewConversationAndWait 触发的 mock 还在跑时
    // 按钮是 Cancel;等它完成才发第二条)
    try {
      await page.locator('button[type="submit"]').waitFor({ state: "visible", timeout: 10_000 });
    } catch {
      // If Cancel still visible, cancel it
      await cancelRunningAgent(page);
    }

    // 发送消息（Q→A question substring: 07::hi）
    const textarea = page.locator('textarea[placeholder="发条消息…"]');
    await textarea.fill("07::hi Hi");
    await submitForm(page);

    // 等 assistant bubble 出现并包含预置文本
    // Use evaluate to check ANY assistant bubble (not just .first()) because
    // beforeEach's clickNewConversationAndWait already consumed one mock
    // response — there's already an assistant bubble "Mock setup" from the
    // conv-title send, so .first() would match the wrong one.
    const textDeadline = Date.now() + 10_000;
    let foundText = "";
    while (Date.now() < textDeadline) {
      foundText = await page.evaluate((target: string) => {
        const bubbles = document.querySelectorAll("div.justify-start > div[class*='bg-card']");
        for (const b of Array.from(bubbles)) {
          const t = (b.textContent ?? "").trim();
          if (t.includes(target)) return t;
        }
        // Return the last bubble text for diagnostics
        const last = bubbles[bubbles.length - 1];
        return last ? (last.textContent ?? "").trim() : "(no assistant bubbles)";
      }, cannedText);
      if (foundText.includes(cannedText)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(foundText, "某个 assistant bubble 应包含 mock 预置文本").toContain(cannedText);
  });
});
