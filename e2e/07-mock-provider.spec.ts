








import { test, expect, assert, cancelRunningAgent, clearAllHistory, clickNewConversationAndWait, invoke, submitForm } from "./fixtures";
import { useMockProvider } from "./mock-provider";
import * as path from "node:path";
import * as os from "node:os";

test.describe("07 — Mock LLM provider", () => {
  test.beforeAll(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await page.goto("/");
    await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });
    
    
    await invoke(page, "addWorkspace", {
      label: "Mock E2E Test Workspace",
      rootPath: path.join(os.tmpdir(), `codeman-e2e-mock-${process.pid}-${Math.random().toString(36).slice(2, 8)}`),
    });
    
    await useMockProvider(page);
    
    
    
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
    
    await clickNewConversationAndWait(page);
  });

  test("纯文本响应:assistant bubble 包含预置的固定文本", async ({ tauriEnv }) => {
    const { page } = tauriEnv;

    
    const cannedText = "07::hi Hello from mock LLM!";

    
    
    try {
      await page.locator('button[type="submit"]').waitFor({ state: "visible", timeout: 10_000 });
    } catch {
      
      await cancelRunningAgent(page);
    }

    
    const textarea = page.locator('textarea[placeholder="发条消息…"]');
    await textarea.fill("07::hi Hi");
    await submitForm(page);

    
    
    
    
    
    
    const textDeadline = Date.now() + 10_000;
    let foundText = "";
    while (Date.now() < textDeadline) {
      foundText = await page.evaluate((target: string) => {
        const bubbles = document.querySelectorAll('[data-testid="agent-bubble"]');
        for (const b of Array.from(bubbles)) {
          const t = (b.textContent ?? "").trim();
          if (t.includes(target)) {return t;}
        }
        
        const last = bubbles[bubbles.length - 1];
        return last ? (last.textContent ?? "").trim() : "(no assistant bubbles)";
      }, cannedText);
      if (foundText.includes(cannedText)) {break;}
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(foundText, "某个 assistant bubble 应包含 mock 预置文本").toContain(cannedText);
  });
});
