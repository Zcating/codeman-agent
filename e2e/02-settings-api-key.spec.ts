//! 02 — Settings: configure an LLM API key and verify it persists.
//!
//! Flow:
//!  1. Navigate to /settings via the footer link.
//!  2. Click the first provider's "Set API key…" button.
//!  3. Type a fake key into the now-visible <input type="password">.
//!  4. Click "Save".
//!  5. Verify the key was actually written by calling the IPC
//!     `has_llm_key` command (true end-to-end — not just that the form
//!     closed).
//!  6. Reload the page and re-check the input is hidden (it shouldn't be
//!     reflected back, per the "API key never reflected to DOM" rule).
//!
//! We use a fake key — the test only checks the write path, not network.

import { test, expect } from "@playwright/test";
import { getTauriPage, invoke, disposeTauriPage } from "./helpers";

const FAKE_KEY = "sk-e2e-fake-key-not-real-do-not-use-12345";

test.describe("02 — settings API key", () => {
	test.afterAll(async () => {
		await disposeTauriPage();
	});

	test("set, persist, and reload — key is written but never reflected", async () => {
		const page = await getTauriPage();

		// 1. Land on /settings via the link a real user would click.
		await page.getByRole("link", { name: /Settings/i }).click();
		await expect(page).toHaveURL(/\/settings$/);

		// 2. Click "Set API key…" on the first provider card. The label of
		//    each provider is shown as <span> inside the card header; we don't
		//    need its name — we just need *any* provider to exercise the
		//    flow. (The default Settings has at least one LLM provider.)
		const setKeyButton = page.getByRole("button", { name: /Set API key/i }).first();
		await expect(setKeyButton).toBeVisible();
		await setKeyButton.click();

		// 3. The button reveals a password input + Save / Cancel. Fill it.
		const passwordInput = page.locator('input[type="password"]').first();
		await expect(passwordInput).toBeVisible();
		await passwordInput.fill(FAKE_KEY);

		// 4. Click Save.
		await page.getByRole("button", { name: /^Save$/ }).first().click();

		// The card collapses back to the "Set API key…" button (input
		// disappears) once the save promise resolves.
		await expect(passwordInput).not.toBeVisible({ timeout: 5_000 });

		// 5. Verify the key is actually on disk via the IPC command. We need
		//    to know the provider id; grab it from the rendered <code> tag
		//    inside the provider card (per ProviderCard.tsx layout).
		const providerId = await page
			.locator("code.font-mono")
			.first()
			.textContent();
		expect(providerId, "provider id should be visible as a code element").toBeTruthy();
		const trimmedId = (providerId ?? "").trim();

		const hasKey = await invoke<boolean>("has_llm_key", { provider_id: trimmedId });
		expect(hasKey, `has_llm_key should return true for ${trimmedId}`).toBe(true);

		// 6. Reload the page (in-app navigation back to /). The form should
		//    still be collapsed — the input must never reflect the saved
		//    value, even after navigation.
		await page.getByRole("link", { name: /Back/i }).click();
		await expect(page).toHaveURL(/\/$/);

		await page.getByRole("link", { name: /Settings/i }).click();
		await expect(page).toHaveURL(/\/settings$/);

		// No password input visible at rest.
		await expect(page.locator('input[type="password"]')).toHaveCount(0);

		// And clicking "Set API key…" again yields an empty input.
		await page.getByRole("button", { name: /Set API key/i }).first().click();
		const freshInput = page.locator('input[type="password"]').first();
		await expect(freshInput).toHaveValue("");
	});
});
