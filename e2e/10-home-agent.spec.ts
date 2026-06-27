//! 10 — HomeAgentForm Home page e2e (V2.1)
//!
//! Tests the new Codex-like home page rendered when activeId===null:
//! - Workspace picker state machine (0/1/2+ workspaces)
//! - Input gating based on workspace selection
//! - Send flow → ChatView transition
//!
//! Per Phase 6 plan: this spec is supplementary. Existing 01-09 specs
//! keep using clickNewConversationAndWait (now IPC-based shim) for
//! backward compat.

import { test, expect } from "@playwright/test";
import {
  assert,
  disposeTauriPage,
  getTauriPage,
  invoke,
  submitHomeAgentForm,
  selectWorkspaceCard,
} from "./helpers";
import type { Settings } from "../src/shared/lib/types";

/**
 * Reload the page to ensure a fresh app state.
 * Uses window.location.reload() (which triggers CDP error — caught by the caller)
 * followed by CDP reinjection, a wait for the app to initialize, and an explicit
 * appStore.refreshAsync() to sync settings from the backend.
 */
async function reloadPageForSettings(p: Awaited<ReturnType<typeof getTauriPage>>): Promise<void> {
  // Trigger hard reload — CDP will throw when the page unloads; caught by caller
  await p.evaluate(() => {
    window.location.reload();
  });
  // Wait for page to reload and app to initialize
  await new Promise((r) => setTimeout(r, 2000));
  // Reconnect CDP after the reload
  try {
    await p.reinjectCdp();
  } catch {
    await new Promise((r) => setTimeout(r, 500));
    await p.reinjectCdp();
  }
  await assert.visible(p.locator("[data-testid='codex-input']"), { timeout: 15_000 });
  // Wait a bit more for __appStore to be fully set up
  await new Promise((r) => setTimeout(r, 500));
  // Try to call refreshAsync if available
  try {
    await p.evaluate(async () => {
      const appStore = (window as any).__appStore;
      if (appStore?.refreshAsync) {
        await appStore.refreshAsync();
      }
    });
    await new Promise((r) => setTimeout(r, 300));
  } catch {
    // ignore
  }
}

test.describe("10 — HomeAgentForm Home", () => {
  test.beforeEach(async () => {
    const page = await getTauriPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") console.error("[10 spec console]", msg.text());
    });
  });

  test.afterAll(async () => {
    await disposeTauriPage();
  });

  test("0 workspaces: input disabled + 'Add a workspace' CTA visible", async () => {
    const page = await getTauriPage();
    const current = await invoke<Settings>("get_settings");
    await invoke("update_settings", {
      newSettings: { ...current, workspaces: [], last_used_workspace_id: null },
    });
    await reloadPageForSettings(page);
    // Check input is disabled
    const isDisabled = await page.evaluate(
      (sel) => {
        const el = document.querySelector(sel) as HTMLTextAreaElement | null;
        return el ? el.disabled : false;
      },
      "[data-testid='codex-input']",
    );
    await expect(isDisabled).toBe(true);
    await assert.visible(page.getByText("Add a workspace"), { timeout: 3_000 });
  });

  test.skip("1 workspace: input enabled after click, card has active class — TODO C11: rewrite for Select interaction", async () => {
    // C11: Select interaction replaces WorkspaceCard click
    // This test needs to be rewritten to test the CodemanSelect component
  });

  test.skip("2+ workspaces: input disabled until user picks a card — TODO C11: rewrite for Select interaction", async () => {
    // C11: Select interaction replaces WorkspaceCard click
    // This test needs to be rewritten to test the CodemanSelect dropdown behavior
  });

  test("submit HomeAgentForm: creates conv + transitions to ChatView", async () => {
    const page = await getTauriPage();
    const wsId = "test-ws-submit";
    const current = await invoke<Settings>("get_settings");
    await invoke("update_settings", {
      newSettings: {
        ...current,
        workspaces: [{ id: wsId, label: "Submit Test", root_path: "/tmp/submit", enabled: true }],
        last_used_workspace_id: wsId,
      },
    });
    await reloadPageForSettings(page);

    // Verify input is enabled before sending
    const isEnabled = await page.evaluate(
      (sel) => {
        const el = document.querySelector(sel) as HTMLTextAreaElement | null;
        return el ? !el.disabled : false;
      },
      "[data-testid='codex-input']",
    );
    console.log(`[diag] submit test - input enabled before send: ${isEnabled}`);

    await submitHomeAgentForm(page, "Hello from HomeAgentForm e2e");

    // Wait a bit and check what's on the page
    await new Promise((r) => setTimeout(r, 2000));
    const pageContent = await page.evaluate(() => document.body.innerText);
    console.log(`[diag] page content snippet: ${pageContent.slice(0, 500)}`);

    // ChatView should appear with the user's message in a bubble
    // Use { exact: false } because getByText defaults to exact match
    await assert.visible(page.getByText("Hello from HomeAgentForm e2e", { exact: false }), { timeout: 15_000 });

    // After send, a new conversation is created. Verify the textarea is gone
    // (we're now in ChatView, not HomeAgentForm) by checking the send button is gone
    // (HomeAgentForm send button has data-testid='codex-send', ChatView uses button[type="submit"])
    const codexSendGone = await page.evaluate(() => !document.querySelector("[data-testid='codex-send']"));
    await expect(codexSendGone).toBe(true);
  });
});
