
import { test, expect } from "./fixtures";
import { chromium, type Browser, type Page } from "@playwright/test";

// REGRESSION: select dropdown width must match the trigger width.
// Was broken because ui/select.tsx used min-w-(--anchor-width) — a variable
// Ark never injects (it injects --reference-width), AND tailwind-merge dropped
// the class in favor of the later min-w-36. Dropdown rendered at content width
// (149px) vs a 460px trigger.
// Fixed: min-w-(--reference-width) placed AFTER min-w-36 so tailwind-merge
// keeps it (shared SelectContent in ui/select.tsx).
test("select dropdown width matches trigger width", async ({ tauriEnv }) => {
  const { cdpUrl } = tauriEnv;

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    browser = await chromium.connectOverCDP(cdpUrl);
    const ctx = browser.contexts()[0];
    page = ctx.pages().find((p) => /app:\/\//.test(p.url()) || /index\.html/.test(p.url())) ?? null;
    expect(page, "app:// page should exist").not.toBeNull();
    if (!page) return;

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const ok = await page.evaluate(() => {
        const root = document.getElementById("root");
        return !!root && root.children.length > 0;
      });
      if (ok) break;
      await new Promise((r) => setTimeout(r, 250));
    }

    await page.evaluate(() => {
      const w = window as unknown as { __router?: { navigate: (a: { to: string }) => void } };
      if (w.__router) w.__router.navigate({ to: "/settings/llm" });
      else {
        history.pushState(null, "", "/settings/llm");
        dispatchEvent(new PopStateEvent("popstate"));
      }
    });

    // close any leftover dialog from a previous test in the same worker
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: /Add provider/ }).click();
    await page.getByTestId("provider-tag-deepseek").click();

    const trigger = page.getByTestId("provider-field-default-model-trigger");
    await trigger.waitFor({ state: "visible", timeout: 5_000 });
    await trigger.click();
    const content = page.getByTestId("provider-field-default-model-content");
    await content.waitFor({ state: "visible", timeout: 5_000 });

    const [tBox, cBox] = await Promise.all([trigger.boundingBox(), content.boundingBox()]);
    expect(tBox, "trigger bounding box").not.toBeNull();
    expect(cBox, "content bounding box").not.toBeNull();
    if (!tBox || !cBox) return;

    const delta = Math.abs(cBox.width - tBox.width);
    console.log(
      `[width] trigger=${tBox.width.toFixed(1)}px content=${cBox.width.toFixed(1)}px delta=${delta.toFixed(1)}px`,
    );
    expect(delta, `dropdown width matches trigger (delta=${delta.toFixed(1)}px)`).toBeLessThanOrEqual(1);
  } finally {
    await browser?.close().catch(() => {});
  }
});
