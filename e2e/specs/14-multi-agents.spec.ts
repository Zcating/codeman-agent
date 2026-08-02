import { test, expect, assert, type TauriPage } from "./fixtures";

async function gotoMultiAgentsSettings(page: TauriPage): Promise<void> {
  await page.goto("/plugins/multi-agents");
  await assert.visible(page.locator('[data-testid="add-sub-agent-button"]'), { timeout: 15_000 });
}

test.describe("14 — Multi-Agents Sub-Agent Delegation", () => {
  test.describe.configure({ mode: "serial" });

  test("Settings tab renders + Add sub-agent button visible", async ({ tauriEnv }) => {
    const { page } = tauriEnv;

    await gotoMultiAgentsSettings(page);

    // Empty state should be shown
    const emptyState = page.locator('[data-testid="empty-state"]');
    await expect(emptyState).toBeVisible();
    await expect(page.getByText("No sub-agents configured.")).toBeVisible();

    // Add button should be visible
    const addButton = page.locator('[data-testid="add-sub-agent-button"]');
    await expect(addButton).toBeVisible();
  });

  test("User can create a sub-agent via settings dialog", async ({ tauriEnv }) => {
    const { page } = tauriEnv;

    await gotoMultiAgentsSettings(page);

    // Click add button to open dialog
    await page.locator('[data-testid="add-sub-agent-button"]').click();

    // Dialog should appear
    const dialog = page.locator('[data-testid="sub-agent-form-dialog"]');
    await expect(dialog).toBeVisible();

    // Fill in the form fields
    await page.locator('[data-testid="field-name"]').fill("Researcher");
    await page.locator('[data-testid="field-description"]').fill("Web research assistant");
    await page.locator('[data-testid="field-system-prompt"]').fill("You are a helpful research assistant.");

    // Select a model (if available)
    const modelSelect = page.locator('[data-testid="field-model"]');
    const optionsCount = await modelSelect.locator("option").count();
    if (optionsCount > 1) {
      await modelSelect.selectOption({ index: 1 });
    }

    // Select thinking level
    await page.locator('[data-testid="field-thinking-level"]').selectOption("medium");

    // Check a tool checkbox
    const toolCheckbox = page.locator('[data-testid="tool-webfetch"]');
    if (await toolCheckbox.isVisible()) {
      await toolCheckbox.check();
    }

    // Click save
    await page.locator('[data-testid="save-button"]').click();

    // Wait for dialog to close
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // Sub-agent should appear in the list
    await expect(page.locator("text=Researcher")).toBeVisible();
  });
});
