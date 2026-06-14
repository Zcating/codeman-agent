//! 04 — Theme toggle: light / dark / system.
//!
//! The settings page does NOT have a dedicated theme toggle UI (theme is
//! edited by mutating Settings.theme via the same Save flow as everything
//! else, and the actual visual switch happens in the shared theme store
//! after a 5s poll). So we exercise the switch by:
//!  1. Driving `update_settings` directly via IPC — this is the same
//!     command the Save button ultimately calls.
//!  2. Polling the resolved `<html class>` for up to 7s (poll is every 5s,
//!     plus a small margin).
//!
//! Tailwind v4's dark variant is wired in `src/index.css` as
//! `@custom-variant dark (&:is(.dark *))`, so the .dark class is what we
//! assert on — the rest of the styling cascades from there.

import { test, expect } from "@playwright/test";
import { getTauriPage, invoke, disposeTauriPage } from "./helpers";

interface Settings {
	theme: "light" | "dark" | "system";
	[key: string]: unknown;
}

async function setTheme(page: Awaited<ReturnType<typeof getTauriPage>>, theme: "light" | "dark" | "system") {
	const current = await invoke<Settings>("get_settings");
	const next: Settings = { ...current, theme };
	await invoke<Settings>("update_settings", { new_settings: next });

	// The store polls Settings every 5s; give it 7s to apply.
	// We re-read the html class in a tight loop because the poll is the
	// only thing that can flip the class (no event is emitted on change).
	const wantDark = theme === "dark";
	if (theme === "system") {
		// For "system" we just assert *something* resolves; the actual
		// outcome depends on the test host's OS preference, which we
		// cannot reliably force from here. We just want the code path to
		// not throw — see the dark/light cases for the real assertions.
		await expect(async () => {
			const cls = await page.evaluate(() => document.documentElement.className);
			// The class is either "" or "dark" — never "system" (the
			// store resolves "system" → "light" | "dark" before applying).
			expect(cls === "" || cls === "dark").toBe(true);
		}).toPass({ timeout: 7_000, intervals: [500] });
		return;
	}

	await expect(async () => {
		const isDark = await page.evaluate(() =>
			document.documentElement.classList.contains("dark"),
		);
		expect(isDark).toBe(wantDark);
	}).toPass({ timeout: 7_000, intervals: [500] });
}

test.describe("04 — theme", () => {
	test.afterAll(async () => {
		await disposeTauriPage();
	});

	test("light → dark → light via update_settings", async () => {
		const page = await getTauriPage();

		// Sanity: app is up and the html element is queryable.
		await expect(page.locator("html")).toBeAttached();

		// Light.
		await setTheme(page, "light");
		expect(
			await page.evaluate(() => document.documentElement.classList.contains("dark")),
		).toBe(false);

		// Dark.
		await setTheme(page, "dark");
		expect(
			await page.evaluate(() => document.documentElement.classList.contains("dark")),
		).toBe(true);

		// Light again — round-trip.
		await setTheme(page, "light");
		expect(
			await page.evaluate(() => document.documentElement.classList.contains("dark")),
		).toBe(false);

		// System — class resolves to light or dark (never "system").
		await setTheme(page, "system");
		const finalClass = await page.evaluate(() => document.documentElement.className);
		expect(finalClass === "" || finalClass === "dark").toBe(true);
	});
});
