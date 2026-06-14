//! 05 — Agent page: input content → user message bubble MUST appear.
//!
//! The contract under test: after the user types and sends a message in the
//! chat view, the message is rendered as a user-role bubble in the list, and
//! the same message is persisted to SQLite (verifiable via the `list_messages`
//! IPC command). This spec is intentionally stricter than 03-billing-tool:
//! it uses AND, not OR — failing the bubble assertion fails the test, even
//! if "the chat loop is still alive".
//!
//! Why this is its own spec instead of folding into 03:
//!   - 03 is the "chat loop alive" smoke test (allows assistant OR cancel).
//!   - 05 is the "user-input → bubble → DB" round-trip contract test.
//!   - The two fail for different reasons; running both isolates regressions
//!     to the right layer (UI render vs. runtime plumbing).

import { test, expect } from "@playwright/test";
import { getTauriPage, invoke, clearAllHistory, disposeTauriPage } from "./helpers";

// Deliberately distinctive string so we never confuse it with another test
// data row or with the default Sidebar "New conversation" placeholder.
const USER_INPUT = "ping 05-bubble — must render as a user bubble";

interface MessageRow {
	id: string;
	conversation_id: string;
	role: "user" | "assistant" | "tool" | "system";
	content: string;
	tool_calls: unknown[] | null;
	tool_results: unknown[] | null;
	model: string | null;
	input_tokens: number | null;
	output_tokens: number | null;
	created_at: number;
}

test.describe("05 — agent page input → user bubble", () => {
	test.beforeEach(async () => {
		// Wipe conversations so this spec is hermetic. We also reset the
		// active conversation pointer in the store on the next "new" click.
		await clearAllHistory();
	});

	test.afterAll(async () => {
		await disposeTauriPage();
	});

	test("typed content produces a visible user bubble AND is persisted to the DB", async () => {
		const page = await getTauriPage();

		// 1. Land on the chat page. The Tauri dev URL is /; we don't need
		//    to navigate, but doing so makes the spec robust to a future
		//    change in the default route.
		await page.goto("/");
		await expect(page.locator('textarea[placeholder="Type a message…"]')).toBeVisible({
			timeout: 15_000,
		});

		// 2. Create a fresh conversation. ChatView refuses to send without
		//    an activeId, so this is a hard prerequisite, not a nice-to-have.
		const newConvButton = page.locator('button[title="New conversation"]');
		await expect(newConvButton).toBeVisible();
		await newConvButton.click();

		// 3. Capture the active conversation id from the sidebar's active
		//    list item — we'll need it for the IPC `list_messages` call.
		//    The active item is the <li> with the primary-500 background.
		const activeItem = page.locator("aside li.bg-primary-500").first();
		await expect(activeItem).toBeVisible({ timeout: 5_000 });
		const activeTitle = await activeItem.locator("span").first().textContent();
		expect(activeTitle, "active conversation should have a title").toBeTruthy();

		// 4. Type into the textarea and submit. We wait for the textarea to
		//    be enabled first because the store finishes loading asynchronously
		//    and disabled textareas swallow input.
		const textarea = page.locator('textarea[placeholder="Type a message…"]');
		await expect(textarea).toBeEnabled();
		await textarea.fill(USER_INPUT);
		await page.locator('button[type="submit"]').click();

		// 5. STRICT: the user bubble MUST appear. Per MessageBubble.tsx, the
		//    user bubble is a <div> with utility classes bg-primary-500 +
		//    text-white, contained in a flex container with justify-end
		//    (right-aligned). We assert on the inner bubble div — the
		//    container alone could be ambiguous.
		const userBubble = page
			.locator("div.justify-end > div.bg-primary-500.text-white")
			.filter({ hasText: USER_INPUT });
		await expect(userBubble).toBeVisible({ timeout: 5_000 });
		await expect(userBubble).toContainText(USER_INPUT);

		// 6. STRICT: the textarea clears after send (this is the "clear
		//    input after submission" contract — if the textarea still holds
		//    the text, the user's "did it actually go through?" indicator
		//    is broken, even if the bubble rendered).
		await expect(textarea).toHaveValue("");

		// 7. STRICT: the same message is persisted to SQLite. We grab the
		//    conversation id from the store via the messages list — the
		//    easiest way is to look up the active conversation's first
		//    message via IPC. We need the conversation id; the most
		//    stable way is to read it from the rendered <li>'s data, but
		//    Sidebar doesn't expose it as a data-attribute. So we use the
		//    title we captured and look up the matching conversation.
		//
		//    The Title → ID mapping isn't directly exposed in the DOM, so
		//    we sidestep it: invoke `list_conversations` and find the
		//    conversation whose title matches the active sidebar entry.
		const convos = await invoke<Array<{ id: string; title: string }>>(
			"list_conversations",
		);
		const matching = convos.find((c) => c.title === (activeTitle ?? "").trim());
		expect(matching, `could not find a conversation titled "${activeTitle}"`).toBeTruthy();
		if (!matching) return; // narrow the type for TS

		const messages = await invoke<MessageRow[]>("list_messages", {
			conversation_id: matching.id,
		});
		const userRow = messages.find((m) => m.role === "user" && m.content === USER_INPUT);
		expect(
			userRow,
			`a user message with content "${USER_INPUT}" must be persisted in conversation ${matching.id}`,
		).toBeTruthy();
	});

	test("multiple sends produce multiple bubbles (no de-dup regression)", async () => {
		const page = await getTauriPage();
		await page.goto("/");
		await expect(page.locator('textarea[placeholder="Type a message…"]')).toBeVisible({
			timeout: 15_000,
		});

		await page.locator('button[title="New conversation"]').click();
		const textarea = page.locator('textarea[placeholder="Type a message…"]');
		await expect(textarea).toBeEnabled();

		// Send 3 distinct messages in sequence. Each one MUST result in its
		// own bubble; if the store were to dedupe or overwrite, this catches it.
		const inputs = [
			"first bubble — alpha",
			"second bubble — beta",
			"third bubble — gamma",
		];

		for (const text of inputs) {
			await textarea.fill(text);
			await page.locator('button[type="submit"]').click();
			// Wait for THIS specific bubble to appear before sending the next
			// one. The store is sync-after-await, so this resolves quickly.
			await expect(
				page
					.locator("div.justify-end > div.bg-primary-500.text-white")
					.filter({ hasText: text }),
			).toBeVisible({ timeout: 5_000 });
		}

		// And all 3 must coexist in the list at the end.
		const bubbles = page.locator("div.justify-end > div.bg-primary-500.text-white");
		await expect(bubbles).toHaveCount(3);
	});
});
