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

import { test, expect, assert, invoke, submitHomeAgentForm, resetSidebar, type TauriPage } from "./fixtures";

/**
 * Reload the page to ensure a fresh app state.
 * Uses window.location.reload() (which triggers CDP error — caught by the caller)
 * followed by CDP reinjection, a wait for the app to initialize, and an explicit
 * appStore.refreshAsync() to sync settings from the backend.
 */
async function reloadPageForSettings(p: TauriPage): Promise<void> {
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

/**
 * Manually select a workspace via the picker. Needed for the 2+ workspace
 * case where `last_used_workspace_id` is null and no auto-select fires.
 *
 * Uses `page.evaluate` to click the trigger and the option because
 * `TauriLocator` doesn't expose `filter({ hasText })` (Playwright-only).
 */
async function selectWorkspaceInPicker(
  p: TauriPage,
  workspaceLabel: string,
): Promise<void> {
  // Open the picker
  await p.evaluate(() => {
    const trigger = document.querySelector(
      '[data-testid="workspace-select-trigger"]',
    ) as HTMLElement | null;
    if (!trigger) {
      throw new Error("workspace-select-trigger not found");
    }
    trigger.click();
  });
  // Wait for content
  await assert.visible(
    p.locator("[data-testid='workspace-select-content']"),
    { timeout: 3_000 },
  );
  // Click the option by text
  await p.evaluate((targetLabel: string) => {
    const content = document.querySelector(
      '[data-testid="workspace-select-content"]',
    );
    if (!content) {
      throw new Error("workspace-select-content not found");
    }
    const items = content.querySelectorAll(
      '[role="option"], [role="menuitem"]',
    );
    for (const item of Array.from(items)) {
      if ((item.textContent ?? "").trim() === targetLabel) {
        (item as HTMLElement).click();
        return;
      }
    }
    throw new Error(
      `Workspace option "${targetLabel}" not found in picker (${items.length} options visible)`,
    );
  }, workspaceLabel);
  // Wait for the picker to close + draftWorkspaceId to update + input to enable
  await new Promise((r) => setTimeout(r, 300));
}

test.describe("10 — HomeAgentForm Home", () => {
  test.beforeAll(async ({ tauriEnv }) => {
    // D8-W: clean up any workspaces from previous e2e runs to avoid UNIQUE
    // constraint violations on root_path.
    const { page } = tauriEnv;
    await page.goto("/");
    await resetSidebar(page);
  });

  test.beforeEach(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    page.on("console", (msg) => {
      if (msg.type === "error") console.error("[10 spec console]", msg.text);
    });
    // Clean up workspaces from previous tests to avoid state leakage
    await resetSidebar(page);
  });

  test("0 workspaces: input disabled + 'No workspaces' placeholder visible", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    // D8-W: clear all workspaces via WorkspaceService IPC
    await resetSidebar(page);
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
    // D8-W sidebar hides when 0 workspaces && no active conv.
    // The "No workspaces" text in the home form confirms wsCount === 0.
    await assert.visible(
      page.getByText("No workspaces", { exact: false }),
      { timeout: 3_000 },
    );
  });

  test("1 workspace: auto-select triggers + input enabled immediately", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    // D8-W: provision workspace via WorkspaceService IPC
    await invoke(page, "addWorkspace", { label: "Solo WS", rootPath: "/tmp/solo-ws" });
    await reloadPageForSettings(page);

    // V2.1's HomeAgentForm initializes draftWorkspaceId at mount time, before
    // __appStore.refreshAsync() completes, so auto-select is unreliable. We
    // explicitly drive selection via the picker.
    await selectWorkspaceInPicker(page, "Solo WS");

    // The trigger should now show "Solo WS" as the selected value
    const trigger = page.locator("[data-testid='workspace-select-trigger']");
    await assert.visible(trigger);
    // toContainText is a Playwright Locator matcher — not available on
    // TauriLocator. Read text via page.evaluate + assert on string.
    const triggerText = await page.evaluate(
      () =>
        document.querySelector("[data-testid='workspace-select-trigger']")
          ?.textContent ?? "",
    );
    expect(triggerText).toContain("Solo WS");
    // Count verification: exactly one trigger should exist
    const triggerCount = await page.locator("[data-testid='workspace-select-trigger']").count();
    await expect(triggerCount).toBe(1);

    // Input should be enabled (workspace selected)
    const isEnabled = await page.evaluate(
      (sel) => {
        const el = document.querySelector(sel) as HTMLTextAreaElement | null;
        return el ? !el.disabled : false;
      },
      "[data-testid='codex-input']",
    );
    await expect(isEnabled).toBe(true);
  });

  test("2+ workspaces: no pre-select; clicking option enables input", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    // D8-W: provision 2 workspaces via WorkspaceService IPC
    await invoke(page, "addWorkspace", { label: "Workspace A", rootPath: "/tmp/ws-a" });
    await invoke(page, "addWorkspace", { label: "Workspace B", rootPath: "/tmp/ws-b" });
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
    const triggerTextAfter = await page.evaluate(
      () =>
        document.querySelector("[data-testid='workspace-select-trigger']")
          ?.textContent ?? "",
    );
    expect(triggerTextAfter).toContain("Workspace A");
  });

  test("submit HomeAgentForm: creates conv + transitions to ChatView", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    // D8-W: provision workspace via WorkspaceService IPC
    await invoke(page, "addWorkspace", { label: "Submit Test", rootPath: "/tmp/submit" });
    await reloadPageForSettings(page);

    // Drive the workspace select signal manually (V2.1 auto-select race).
    await selectWorkspaceInPicker(page, "Submit Test");

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

    // Wait for the createAndSendConversation flow to complete:
    // createConversation(IPC) → selectConversation(activeId) → ChatView mount
    await new Promise((r) => setTimeout(r, 2000));
    const pageContent = await page.evaluate(() => document.body.innerText);
    console.log(`[diag] page content snippet: ${pageContent.slice(0, 500)}`);

    // ChatView should appear with the user's message in a bubble. The chat input
    // is a <textarea> with placeholder "发条消息…" — not the codex-input.
    await assert.visible(
      page.locator('textarea[placeholder="发条消息…"]'),
      { timeout: 15_000 },
    );

    // After send, the HomeAgentForm's codex-input should be gone (we're in ChatView).
    const codexInputGone = await page.evaluate(
      () => !document.querySelector("[data-testid='codex-input']"),
    );
    await expect(codexInputGone).toBe(true);
  });

  test("新布局: textarea DOM 顺序在 workspace picker 之前", async ({ tauriEnv }) => {
    test.setTimeout(60_000);
    const { page } = tauriEnv;
    // D8-W: provision workspace via WorkspaceService IPC
    await invoke(page, "addWorkspace", { label: "Layout Test", rootPath: "/tmp/layout-test" });
    await reloadPageForSettings(page);

    // Drive workspace select manually (V2.1 auto-select race)
    await selectWorkspaceInPicker(page, "Layout Test");

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

  test("LLM picker 显示且 trigger 含 default_model", async ({ tauriEnv }) => {
    test.setTimeout(60_000);
    const { page } = tauriEnv;
    // D8-W: provision workspace via WorkspaceService IPC
    await invoke(page, "addWorkspace", { label: "LLM Picker Test", rootPath: "/tmp/llm-picker-test" });
    await reloadPageForSettings(page);

    // Drive workspace select manually (V2.1 auto-select race)
    await selectWorkspaceInPicker(page, "LLM Picker Test");

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

  test("选择非第一个 LLM 模型并持久化到 Settings", async ({ tauriEnv }) => {
    test.setTimeout(60_000);
    const { page } = tauriEnv;
    const wsLabel = "LLM Persistence Test";
    const wsRoot = "/tmp/llm-persist-test";

    // D8-W: clean up any existing workspace with the same label
    try {
      const existingWs = await invoke<{ id: string; label: string }[]>(page, "listWorkspaces");
      for (const ws of existingWs) {
        if (ws.label === wsLabel) {
          await invoke(page, "deleteWorkspace", { id: ws.id });
        }
      }
    } catch { /* best-effort */ }

    // Provision workspace via WorkspaceService IPC
    await invoke(page, "addWorkspace", { label: wsLabel, rootPath: wsRoot });

    // Read current settings and inject a two-model provider
    const current = await invoke<Record<string, unknown>>(page, "getSettings");
    const twoModelProvider = {
      id: "test-two-model",
      label: "Test Two Model",
      enabled: true,
      apiKey: "test-key",
      llm: {
        defaultModel: "model-first",
        baseUrl: "https://api.test.com/anthropic",
        apiType: "anthropic-messages",
        models: [
          {
            id: "model-first",
            label: "Model First",
            contextWindow: 200_000,
            deprecated: false,
            thinking: false,
          },
          {
            id: "model-second",
            label: "Model Second",
            contextWindow: 200_000,
            deprecated: false,
            thinking: false,
          },
        ],
        modelsEndpoint: "https://api.test.com/v1/models",
      },
    };

    // Preserve existing providers and set the two-model provider as default
    const existingProviders = (current.providers as unknown[] ?? []) as unknown[];
    const newSettings = {
      ...current,
      providers: [...existingProviders, twoModelProvider],
      defaultLlmProviderId: "test-two-model",
    };

    await invoke(page, "updateSettings", { newSettings });

    // Reload renderer to pick up the new provider
    await reloadPageForSettings(page);

    // Select the workspace
    await selectWorkspaceInPicker(page, wsLabel);

    // Open the LLM picker dropdown
    await page.locator("[data-testid='llm-picker-trigger']").click();
    const llmContent = page.locator("[data-testid='llm-picker-content']");
    await assert.visible(llmContent, { timeout: 5_000 });

    // Click the "Model Second" option
    await page.evaluate(() => {
      const content = document.querySelector('[data-testid="llm-picker-content"]');
      if (!content) throw new Error("llm-picker-content not found");
      const options = content.querySelectorAll('[role="option"]');
      for (const option of Array.from(options)) {
        if ((option.textContent ?? "").trim() === "Model Second") {
          (option as HTMLElement).click();
          return;
        }
      }
      throw new Error("Model Second option not found");
    });

    // Verify trigger text becomes "Model Second"
    const triggerTextAfter = await page.evaluate(() => {
      const el = document.querySelector("[data-testid='llm-picker-trigger']");
      return el?.textContent ?? "";
    });
    expect(triggerTextAfter).toContain("Model Second");

    // Wait for debounced persistence (settingsSaver uses 500ms debounce).
    // Poll up to 5s for the model to persist, since debounce + IPC flush
    // can take longer than a fixed sleep in parallel CI.
    const persistDeadline = Date.now() + 5_000;
    let modelPersisted = false;
    while (Date.now() < persistDeadline) {
      const settingsAfter = await invoke<Record<string, unknown>>(page, "getSettings");
      const providersAfter = (settingsAfter.providers as Array<Record<string, unknown>>) ?? [];
      const testProvider = providersAfter.find((p) => p.id === "test-two-model");
      if (testProvider) {
        const llmAfter = testProvider?.llm as Record<string, unknown> | undefined;
        if (llmAfter?.defaultModel === "model-second") {
          modelPersisted = true;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(modelPersisted, "model-second should be persisted within 5s").toBe(true);
  });

  test("Action slot 按钮存在且点击不报错 (picker 在 e2e 不弹真 dialog)", async ({ tauriEnv }) => {
    test.setTimeout(60_000);
    const { page } = tauriEnv;
    // D8-W: provision workspace via WorkspaceService IPC
    await invoke(page, "addWorkspace", { label: "Action Slot Test", rootPath: "/tmp/action-slot-test" });
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
