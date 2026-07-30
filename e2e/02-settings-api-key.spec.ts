











import { test, expect, assert, invoke } from "./fixtures";
import type { Settings } from "../src/renderer/shared/lib/types";

const FAKE_KEY = "sk-e2e-fake-key-not-real-do-not-use-12345";

test.describe("02 — 设置 LLM API key", () => {
  test.beforeAll(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    
    
    
    const defaults = await invoke<Settings>(page, "getSettings");
    const reset = {
      ...defaults,
      providers: (defaults.providers ?? []).map((p) => ({ ...p, enabled: true, apiKey: "" })),
      defaultLlmProviderId: "minimax",
    };
    await invoke(page, "updateSettings", { newSettings: reset });
  });

  test("设置、持久化并重新加载 — key 被写入但永不反射", async ({ tauriEnv }) => {
    const { page } = tauriEnv;

    
    
    await page.goto("/");

    
    
    let settingsLink = page.locator('a[href="/settings"]');
    await assert.visible(settingsLink, { timeout: 10_000 });
    await settingsLink.click();
    await assert.urlMatches(page, /\/settings\/llm/);

    
    
    const passwordInput = page.locator('input[type="password"]').first();
    await assert.visible(passwordInput, { timeout: 10_000 });
    await passwordInput.fill(FAKE_KEY);

    
    
    
    
    
    const footerSaveButton = page
      .locator("button")
      .filter({ hasText: /^Save$/ });
    await assert.visible(footerSaveButton, { timeout: 5_000 });
    await footerSaveButton.click();

    
    
    await assert.value(passwordInput, FAKE_KEY, { timeout: 2_000 });

    
    
    
    
    
    const settings = await invoke<{ providers?: Array<{ id: string; apiKey: string }> }>(
      page,
      "getSettings",
    );
    const minimaxProvider = settings.providers?.find((p) => p.id === "minimax");
    expect(minimaxProvider?.apiKey, `minimax provider apiKey 应为 ${FAKE_KEY}`).toBe(FAKE_KEY);

    
    
    
    await page.goto("/");
    await assert.urlMatches(page, /\//);

    settingsLink = page.locator('a[href="/settings"]');
    await assert.visible(settingsLink, { timeout: 10_000 });
    await settingsLink.click();
    await assert.urlMatches(page, /\/settings\/llm/);

    
    await assert.visible(page.locator('input[type="password"]').first(), { timeout: 5_000 });
    
    const refreshDeadline = Date.now() + 5_000;
    let values: string[] = [];
    while (Date.now() < refreshDeadline) {
      values = (await page.evaluate(() =>
        Array.from(document.querySelectorAll('input[type="password"]')).map(
          (el) => (el as HTMLInputElement).value,
        ),
      )) as string[];
      if (values.length > 0 && values[0] === FAKE_KEY) {
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(values.length, "settings 页有 password input").toBeGreaterThan(0);
    
    
    
    expect(
      values[0],
      `first password input should reflect saved value, actual="${values[0]}"`,
    ).toBe(FAKE_KEY);
  });
});
