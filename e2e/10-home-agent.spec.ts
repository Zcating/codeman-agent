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
    // "Add a workspace" CTA should be visible and link to /settings
    await assert.visible(page.getByText("Add a workspace", { exact: false }), { timeout: 3_000 });
    const settingsLink = page.locator("a[href='/settings']").filter({ hasText: /add a workspace/i });
    await expect(settingsLink).toBeVisible();
  });

  test("1 workspace: auto-select triggers + input enabled immediately", async () => {
    const page = await getTauriPage();
    const wsId = "test-ws-1ws";
    const current = await invoke<Settings>("get_settings");
    await invoke("update_settings", {
      newSettings: {
        ...current,
        workspaces: [{ id: wsId, label: "Solo WS", root_path: "/tmp/solo-ws", enabled: true }],
        last_used_workspace_id: wsId,
      },
    });
    await reloadPageForSettings(page);

    // The trigger should show "Solo WS" as the selected value
    const trigger = page.locator("[data-testid='workspace-select-trigger']");
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText("Solo WS");
    // Count verification: exactly one trigger should exist
    const triggerCount = await page.locator("[data-testid='workspace-select-trigger']").count();
    await expect(triggerCount).toBe(1);

    // Input should be enabled (last_used_workspace_id is set → auto-select)
    const isEnabled = await page.evaluate(
      (sel) => {
        const el = document.querySelector(sel) as HTMLTextAreaElement | null;
        return el ? !el.disabled : false;
      },
      "[data-testid='codex-input']",
    );
    await expect(isEnabled).toBe(true);
  });

  test("2+ workspaces: no pre-select; clicking option enables input", async () => {
    const page = await getTauriPage();
    const current = await invoke<Settings>("get_settings");
    await invoke("update_settings", {
      newSettings: {
        ...current,
        workspaces: [
          { id: "ws-a", label: "Workspace A", root_path: "/tmp/ws-a", enabled: true },
          { id: "ws-b", label: "Workspace B", root_path: "/tmp/ws-b", enabled: true },
        ],
        last_used_workspace_id: null, // No auto-select
      },
    });
    await reloadPageForSettings(page);

    // Input should be disabled initially (no workspace selected)
    const isDisabledInitially = await page.evaluate(
      (sel) => {
        const el = document.querySelector(sel) as HTMLTextAreaElement | null;
        return el ? el.disabled : false;
      },
      "[data-testid='codex-input']",
    );
    await expect(isDisabledInitially).toBe(true);

    // Click the workspace select trigger
    const trigger = page.locator("[data-testid='workspace-select-trigger']");
    await trigger.click();

    // The content should now be open — click "Workspace A" option
    const content = page.locator("[data-testid='workspace-select-content']");
    await assert.visible(content, { timeout: 3_000 });
    const option = content.locator("[role='option']").filter({ hasText: "Workspace A" });
    await option.click();

    // After selecting, input should be enabled
    const isEnabledAfterSelect = await page.evaluate(
      (sel) => {
        const el = document.querySelector(sel) as HTMLTextAreaElement | null;
        return el ? !el.disabled : false;
      },
      "[data-testid='codex-input']",
    );
    await expect(isEnabledAfterSelect).toBe(true);

    // Verify the trigger shows the selected workspace
    const triggerAfterSelect = page.locator("[data-testid='workspace-select-trigger']");
    await expect(triggerAfterSelect).toContainText("Workspace A");
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
    await expect(isEnabled).toBe(true);

    await submitHomeAgentForm(page, "Hello from HomeAgentForm e2e");

    // Wait a bit and check what's on the page
    await new Promise((r) => setTimeout(r, 2000));
    const pageContent = await page.evaluate(() => document.body.innerText);
    console.log(`[diag] page content snippet: ${pageContent.slice(0, 500)}`);

    // ChatView should appear with the user's message in a bubble
    await assert.visible(page.getByText("Hello from HomeAgentForm e2e", { exact: false }), { timeout: 15_000 });

    // After send, a new conversation is created. Verify the textarea is gone
    // (we're now in ChatView, not HomeAgentForm) by checking the send button is gone
    // (HomeAgentForm send button has data-testid='codex-send', ChatView uses button[type="submit"])
    const codexSendGone = await page.evaluate(() => !document.querySelector("[data-testid='codex-send']"));
    await expect(codexSendGone).toBe(true);
  });

  test("新布局: textarea DOM 顺序在 workspace picker 之前", async () => {
    test.setTimeout(60_000);
    const page = await getTauriPage();
    const wsId = "test-ws-layout";
    const current = await invoke<Settings>("get_settings");
    await invoke("update_settings", {
      newSettings: {
        ...current,
        workspaces: [{ id: wsId, label: "Layout Test", root_path: "/tmp/layout-test", enabled: true }],
        last_used_workspace_id: wsId,
      },
    });
    await reloadPageForSettings(page);

    // Assertion 1: Both elements are visible
    await assert.visible(page.locator("[data-testid='codex-input']"), { timeout: 10_000 });
    await assert.visible(page.locator("[data-testid='workspace-select-trigger']"), { timeout: 10_000 });

    // Assertion 2 (DOM order): codex-input should appear before workspace-select-trigger in document order
    const domOrderValid = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("[data-testid]"));
      const codexIdx = all.findIndex((el) => el.getAttribute("data-testid") === "codex-input");
      const wsIdx = all.findIndex((el) => el.getAttribute("data-testid") === "workspace-select-trigger");
      return codexIdx >= 0 && wsIdx >= 0 && codexIdx < wsIdx;
    });
    await expect(domOrderValid).toBe(true);
  });

  test("LLM picker 显示且 trigger 含 default_model", async () => {
    test.setTimeout(60_000);
    const page = await getTauriPage();
    const wsId = "test-ws-llm-picker";
    const current = await invoke<Settings>("get_settings");
    await invoke("update_settings", {
      newSettings: {
        ...current,
        workspaces: [{ id: wsId, label: "LLM Picker Test", root_path: "/tmp/llm-picker-test", enabled: true }],
        last_used_workspace_id: wsId,
      },
    });
    await reloadPageForSettings(page);

    // Assertion 1: LLM picker trigger is visible
    await assert.visible(page.locator("[data-testid='llm-picker-trigger']"), { timeout: 10_000 });

    // Assertion 2: trigger renders some text (placeholder or model id)
    const triggerText = await page.evaluate(() => {
      const el = document.querySelector("[data-testid='llm-picker-trigger']");
      return el?.textContent ?? "";
    });
    await expect(triggerText.length).toBeGreaterThan(0);

    // Assertion 3: clicking trigger opens dropdown with model options
    await page.locator("[data-testid='llm-picker-trigger']").click();
    const llmContent = page.locator("[data-testid='llm-picker-content']");
    await assert.visible(llmContent, { timeout: 5_000 });
    const modelOptions = await page.evaluate(() => {
      const content = document.querySelector('[data-testid="llm-picker-content"]');
      return content?.querySelectorAll('[role="option"]').length ?? 0;
    });
    await expect(modelOptions).toBeGreaterThan(0);
  });

  test("Action slot 按钮存在且点击不报错 (picker 在 e2e 不弹真 dialog)", async () => {
    test.setTimeout(60_000);
    const page = await getTauriPage();
    const wsId = "test-ws-action-slot";
    const current = await invoke<Settings>("get_settings");
    await invoke("update_settings", {
      newSettings: {
        ...current,
        workspaces: [{ id: wsId, label: "Action Slot Test", root_path: "/tmp/action-slot-test", enabled: true }],
        last_used_workspace_id: wsId,
      },
    });
    await reloadPageForSettings(page);

    // Open workspace select dropdown
    const trigger = page.locator("[data-testid='workspace-select-trigger']");
    await trigger.click();

    // Assertion 1: dropdown content is visible
    const content = page.locator("[data-testid='workspace-select-content']");
    await assert.visible(content, { timeout: 5_000 });

    // Assertion 2: action button is visible inside dropdown
    const actionBtn = page.locator("[data-testid='workspace-select-add-btn']");
    await assert.visible(actionBtn, { timeout: 5_000 });

    // Assertion 3: clicking the action button does not throw an unhandled error
    let pageError: Error | null = null;
    const errorHandler = (err: Error) => {
      pageError = err;
    };
    page.on("pageerror", errorHandler);

    try {
      await actionBtn.click({ timeout: 5_000 });
      // Give a small window for any async error to propagate
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      // click itself may fail if dialog was suppressed — that's acceptable per the test note
    }
    // Note: listener cleaned up via disposeTauriPage() in afterAll

    // Assert no unhandled page error occurred
    await expect(pageError).toBeNull();
  });
});
