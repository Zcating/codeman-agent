//! 03 — Chat → billing tool call.
//!
//! The hardest spec. The chat runtime calls a real LLM through pi-mono, which
//! would (a) require a real API key and (b) hit the network. We do NOT
//! assert on the LLM response itself — that's the integration spec's job,
//! not e2e's.
//!
//! What we DO assert:
//!  1. The chat layout is interactive: textarea enabled, send clickable.
//!  2. A new conversation can be created from the sidebar.
//!  3. Sending a message appends a user-message bubble to the DOM
//!     (verifies the full write path: ChatView → store → IPC → SQLite).
//!  4. The assistant begins responding (streaming bubble appears within
//!     a reasonable timeout) OR the agent errors out cleanly — both
//!     outcomes are acceptable; we just want the runtime to not deadlock.
//!
//! This is the "chat loop is alive" smoke test.

import { test, expect } from "@playwright/test";
import { getTauriPage, clearAllHistory, disposeTauriPage } from "./helpers";

const USER_PROMPT = "查一下 DeepSeek 余额";

test.describe("03 — chat → billing tool", () => {
	test.beforeEach(async () => {
		// Wipe leftover conversations so "new conversation" is the only one.
		await clearAllHistory();
	});

	test.afterAll(async () => {
		await disposeTauriPage();
	});

	test("send a message and verify the chat loop is alive", async () => {
		const page = await getTauriPage();

		// Start fresh from / (the Tauri dev URL).
		// No need to navigate if we're already there; the global CDP page
		// is the chat window by default.

		// 1. Create a new conversation. This is required: ChatView refuses
		//    to send without an activeId.
		const newConvButton = page.locator('button[title="New conversation"]');
		await expect(newConvButton).toBeVisible();
		await newConvButton.click();

		// 2. The textarea should be enabled and empty.
		const textarea = page.locator('textarea[placeholder="Type a message…"]');
		await expect(textarea).toBeEnabled();

		// 3. Type and send.
		await textarea.fill(USER_PROMPT);
		await page.locator('button[type="submit"]').click();

		// 4. The user bubble appears immediately (sync write to the store
		//    + DB), so this assertion is the "write path works" check.
		await expect(page.getByText(USER_PROMPT, { exact: false })).toBeVisible({
			timeout: 5_000,
		});

		// 5. After a short wait, either:
		//    - An assistant message bubble appears (LLM call succeeded, OR
		//      errored but the runtime still rendered a placeholder), OR
		//    - The send button is replaced by the Cancel button (the runtime
		//      is still streaming, which is the OK signal — it didn't deadlock).
		//
		//    We do NOT time out aggressively: real LLM calls can take
		//    10-20s on cold start, and a missing API key still produces a
		//    long-enough "thinking" state. 30s is a reasonable budget.
		await expect(async () => {
			const hasAssistantBubble =
				(await page.locator("text=/^Assistant|^assistant|tool/i").count()) > 0;
			const cancelButtonVisible =
				(await page
					.getByRole("button", { name: /Cancel/i })
					.count()) > 0;
			expect(hasAssistantBubble || cancelButtonVisible).toBe(true);
		}).toPass({ timeout: 30_000, intervals: [1_000] });
	});
});
