
import { test, expect } from "./fixtures";
import { chromium, type Browser, type Page } from "@playwright/test";

// REGRESSION: selected-option check indicator (data-part=item-indicator) must be
// vertically centered within its option row. Was broken by `absolute right-2`
// without vertical pinning — the check hung 8px low (static position).
// Fixed with `inset-y-0` + `flex items-center` (ui/select.tsx SelectItem).
test("select checked indicator is vertically centered in option row", async ({ tauriEnv }) => {
  const { cdpUrl } = tauriEnv;

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    browser = await chromium.connectOverCDP(cdpUrl);
    const ctx = browser.contexts()[0];
    page = ctx.pages().find((p) => /app:\/\//.test(p.url()) || /index\.html/.test(p.url())) ?? null;
    expect(page, "app:// page should exist").not.toBeNull();
    if (!page) return;

    // wait for app render
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const ok = await page.evaluate(() => {
        const root = document.getElementById("root");
        return !!root && root.children.length > 0;
      });
      if (ok) break;
      await new Promise((r) => setTimeout(r, 250));
    }

    // go to settings/llm (TanStack router handle if exposed, else history fallback)
    await page.evaluate(() => {
      const w = window as unknown as { __router?: { navigate: (a: { to: string }) => void } };
      if (w.__router) w.__router.navigate({ to: "/settings/llm" });
      else {
        history.pushState(null, "", "/settings/llm");
        dispatchEvent(new PopStateEvent("popstate"));
      }
    });

    // open add-provider dialog, pick DeepSeek preset
    await page.getByRole("button", { name: /Add provider/ }).click();
    await page.getByTestId("provider-tag-deepseek").click();

    // open the default-model CodemanSelect and pick "DeepSeek V4 Pro" → becomes checked
    await page.getByTestId("provider-field-default-model-trigger").click();
    const option = page.locator('[data-part="item"][data-value="deepseek-v4-pro"]');
    await option.waitFor({ state: "visible", timeout: 5_000 });
    await option.click();

    // content closes on selection; wait for it to fully close, then reopen
    const content = page.getByTestId("provider-field-default-model-content");
    await content.waitFor({ state: "hidden", timeout: 5_000 });
    await page.getByTestId("provider-field-default-model-trigger").click();
    await content.waitFor({ state: "visible", timeout: 5_000 });

    // NOTE: the indicator div itself is 0x0 (its child span is absolutely
    // positioned), so never waitFor visible on it — measure the svg instead.
    const indicator = page.locator('[data-part="item-indicator"][data-state="checked"]').first();
    expect(await indicator.count(), "checked indicator present").toBeGreaterThan(0);
    const row = indicator.locator("xpath=ancestor::*[@role='option']").first();
    await row.waitFor({ state: "visible", timeout: 5_000 });
    const check = indicator.locator("svg").first();

    const [rowBox, checkBox] = await Promise.all([row.boundingBox(), check.boundingBox()]);
    expect(rowBox, "option row bounding box").not.toBeNull();
    expect(checkBox, "check svg bounding box").not.toBeNull();
    if (!rowBox || !checkBox) return;

    const delta = checkBox.y + checkBox.height / 2 - (rowBox.y + rowBox.height / 2);
    console.log(
      `[align] row y=${rowBox.y.toFixed(1)} h=${rowBox.height.toFixed(1)} ` +
        `check y=${checkBox.y.toFixed(1)} h=${checkBox.height.toFixed(1)} delta=${delta.toFixed(1)}px`,
    );
    expect(Math.abs(delta), `check centered (delta=${delta.toFixed(1)}px)`).toBeLessThanOrEqual(1.5);
  } finally {
    // leave the page clean for subsequent tests in the same worker
    await page?.keyboard.press("Escape").catch(() => {});
    await browser?.close().catch(() => {});
  }
});
