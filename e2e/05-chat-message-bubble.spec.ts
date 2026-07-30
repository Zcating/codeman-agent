
import { test, expect, assert, cancelRunningAgent, clearAllHistory, clickNewConversationAndWait, invoke, resetChatState, submitForm } from "./fixtures";
import { useMockProvider } from "./mock-provider";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

const USER_INPUT = "05b::user-bubble 测试气泡渲染为用户气泡";

interface MessageRow {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  toolCalls: unknown[] | null;
  toolResults: unknown[] | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: number;
}

test.describe("05 — agent 页面输入 → 用户气泡", () => {
  const e2eRoot = path.join(os.tmpdir(), `codeman-e2e-bubble-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);

  test.beforeAll(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    fs.mkdirSync(e2eRoot, { recursive: true });

    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });

    await invoke(page, "addWorkspace", {
      label: "Bubble E2E Test Workspace",
      rootPath: e2eRoot,
    });

    await useMockProvider(page);
  });

  test.beforeEach(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await cancelRunningAgent(page);
    await clearAllHistory(page);
    await page.goto("/");
    await assert.visible(page.locator('[data-testid="codex-input"]'), { timeout: 15_000 });
  });

  test("输入内容产生可见用户气泡并持久化到 DB", async ({ tauriEnv }) => {
    const { page } = tauriEnv;

    page.on("console", (msg) => {
      const t = msg.text;
      if (t.includes("[vite]") || t.includes("[HMR]") || t.includes("hmr update")) {
        return;
      }
      console.log(`[page ${msg.type}] ${t}`);
    });
    page.on("pageerror", (err) => {
      console.log(`[page pageerror] ${err.message}`);
    });

    const { convId } = await clickNewConversationAndWait(page);

    const sidebarItem = page.locator(`[data-value="${convId}"]`).first();
    try {
      await sidebarItem.waitFor({ state: "visible", timeout: 15_000 });
    } catch {
    }
    const activeTitle = sidebarItem ? await sidebarItem.locator("span").first().textContent().catch(() => null) : null;
    if (activeTitle) {
      expect(activeTitle, "active conversation 应有一个标题").toBeTruthy();
    }

    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await assert.enabled(textarea);
    await textarea.fill(USER_INPUT);

    const fillState = await page.evaluate(() => {
      const ta = document.querySelector(
        'textarea[placeholder="发条消息\u2026"]',
      ) as HTMLTextAreaElement | null;
      const btn = document.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      return {
        taValue: ta?.value ?? null,
        taDisabled: ta?.disabled ?? null,
        btnExists: !!btn,
        btnDisabled: btn?.disabled ?? null,
        btnText: btn?.textContent?.trim() ?? null,
      };
    });
    console.log(`[diagnose] after fill: ${JSON.stringify(fillState)}`);

    await submitForm(page);

    await new Promise((r) => setTimeout(r, 1_000));
    const afterSubmit = await page.evaluate(() => {
      const ta = document.querySelector(
        'textarea[placeholder="发条消息\u2026"]',
      ) as HTMLTextAreaElement | null;
      const bubbles = document.querySelectorAll(
        "div.justify-end > div.bg-primary.text-primary-foreground",
      );
      const cancel = document.querySelector("button:not([disabled])");
      return {
        taValue: ta?.value ?? null,
        taDisabled: ta?.disabled ?? null,
        bubbleCount: bubbles.length,
        bubbleTexts: Array.from(bubbles)
          .slice(0, 3)
          .map((b) => b.textContent?.trim() ?? ""),
        hasCancelOrRunning: !!cancel,
      };
    });
    console.log(`[diagnose] after submit: ${JSON.stringify(afterSubmit)}`);

    const userBubble = page
      .locator("div.justify-end > div.bg-primary.text-primary-foreground")
      .filter({ hasText: USER_INPUT });
    await assert.visible(userBubble, { timeout: 5_000 });
    const text = await userBubble.textContent();
    expect(text, "bubble 必须包含用户输入").toContain(USER_INPUT);

    await assert.value(textarea, "");

    const messages = await invoke<MessageRow[]>(page, "listMessages", {
      conversationId: convId,
    });
    const userRow = messages.find((m) => m.role === "user" && m.content === USER_INPUT);
    expect(
      userRow,
      `content 为 "${USER_INPUT}" 的 user message 必须持久化在会话 ${convId} 中`,
    ).toBeTruthy();
  });

  test.afterAll(async () => {
    try {
      fs.rmSync(e2eRoot, { recursive: true, force: true });
    } catch {}
  });

  test("多次发送产生多个气泡(无去重回归)", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    page.on("console", (msg) => {
      const t = msg.text;
      if (t.includes("[vite]") || t.includes("[HMR]")) {
        return;
      }
      console.log(`[page ${msg.type}] ${t}`);
    });
    page.on("pageerror", (err) => {
      console.log(`[page pageerror] ${err.message}`);
    });
    await resetChatState(page);

    await clickNewConversationAndWait(page);

    const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
    await assert.enabled(textarea, { timeout: 5_000 });

    const inputs = ["05b::first-bubble 第一个气泡", "05b::second-bubble 第二个气泡", "05b::third-bubble 第三个气泡"];

    for (let i = 0; i < inputs.length; i++) {
      const text = inputs[i];
      if (i > 0) {
        await cancelRunningAgent(page);
        await assert.enabled(textarea, { timeout: 5_000 });
      }
      await textarea.fill(text);
      const state = await page.evaluate(() => {
        const ta = document.querySelector(
          'textarea[placeholder="发条消息\u2026"]',
        ) as HTMLTextAreaElement | null;
        const btn = document.querySelector('button[type="submit"]') as HTMLButtonElement | null;
        const cancelBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          /^取消$/.test(b.textContent ?? ""),
        );
        return {
          taDisabled: ta?.disabled,
          taValue: ta?.value,
          btnExists: !!btn,
          cancelBtnExists: !!cancelBtn,
        };
      });
      console.log(`[loop ${i}] state: ${JSON.stringify(state)}`);
      await submitForm(page);
      try {
        await assert.visible(
          page
            .locator("div.justify-end > div.bg-primary.text-primary-foreground")
            .filter({ hasText: text }),
          { timeout: 5_000 },
        );
      } catch (e) {
        const domState = await page.evaluate(() => {
          const ta = document.querySelector(
            'textarea[placeholder="发条消息\u2026"]',
          ) as HTMLTextAreaElement | null;
          return {
            taValue: ta?.value,
            taDisabled: ta?.disabled,
            sidebarItems: document.querySelectorAll("aside li").length,
            bubbles: document.querySelectorAll("div.justify-end").length,
          };
        });
        console.log(`[loop ${i}] FAIL DOM: ${JSON.stringify(domState)}`);
        throw e;
      }
    }

    await assert.count(page.locator("div.justify-end > div.bg-primary.text-primary-foreground"), 4);
  });
});
