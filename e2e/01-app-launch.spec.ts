//! 01 — App launch: cold-start the Tauri app and verify the main window
//! renders the Chat layout (sidebar + textarea + Settings link).
//!
//! This is the canary spec. If it fails, the whole e2e pipeline is broken
//! (wrong CDP port, webview didn't load, or the app panicked at startup).
//! All other specs depend on it implicitly.

import { test, expect } from "@playwright/test";
import { getTauriPage, disposeTauriPage } from "./helpers";

test.describe("01 — app launch", () => {
	let consoleErrors: string[] = [];

	test.beforeEach(async () => {
		consoleErrors = [];
		const page = await getTauriPage();
		// Capture console errors across the spec so a noisy webview fails
		// this canary rather than masking the issue in a later spec.
		page.on("console", (msg) => {
			if (msg.type() === "error") consoleErrors.push(msg.text());
		});
		page.on("pageerror", (err) => {
			consoleErrors.push(`pageerror: ${err.message}`);
		});
	});

	test.afterAll(async () => {
		await disposeTauriPage();
	});

	test("main window loads the chat layout", async () => {
		const page = await getTauriPage();

		// The Tauri dev URL is index.html; on success the SPA mounts and the
		// sidebar (an <aside>) plus the chat form (a <form> with a textarea)
		// should both be present. We do NOT check the URL string — the dev
		// server may serve a trailing slash, hash, or query depending on the
		// platform.
		await expect(page.locator("aside")).toBeVisible({ timeout: 15_000 });
		await expect(page.locator('textarea[placeholder="Type a message…"]')).toBeVisible();
		await expect(page.locator('a[href="/settings"]')).toBeVisible();

		// The footer "Settings" link is the canonical user-facing CTA; the
		// href assertion above is the lower-level check, this one mirrors what
		// a human would click.
		await expect(page.getByRole("link", { name: /Settings/i })).toBeVisible();

		// New-conversation button exists in the sidebar header.
		await expect(page.locator('button[title="New conversation"]')).toBeVisible();

		// No uncaught errors during boot. Some apps log harmless warnings —
		// the canary here is `error` level only.
		expect(consoleErrors, `console errors during boot:\n${consoleErrors.join("\n")}`).toEqual([]);
	});
});
