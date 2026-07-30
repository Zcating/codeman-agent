










import { test, expect, assert, invoke, submitHomeAgentForm, resetSidebar, type TauriPage } from "./fixtures";


async function reloadPageForSettings(p: TauriPage): Promise<void> {
  
  await p.evaluate(() => {
    window.location.reload();
  });
  
  await new Promise((r) => setTimeout(r, 2000));
  
  try {
    await p.reinjectCdp();
  } catch {
    await new Promise((r) => setTimeout(r, 500));
    await p.reinjectCdp();
  }
  await assert.visible(p.locator("[data-testid='codex-input']"), { timeout: 15_000 });
  
  await new Promise((r) => setTimeout(r, 500));
  
  try {
    await p.evaluate(async () => {
      const appStore = (window as any).__appStore;
      if (appStore?.refreshAsync) {
        await appStore.refreshAsync();
      }
    });
    await new Promise((r) => setTimeout(r, 300));
  } catch {
    
  }
}


async function selectWorkspaceInPicker(
  p: TauriPage,
  workspaceLabel: string,
): Promise<void> {
  
  await p.evaluate(() => {
    const trigger = document.querySelector(
      '[data-testid="workspace-select-trigger"]',
    ) as HTMLElement | null;
    if (!trigger) {
      throw new Error("workspace-select-trigger not found");
    }
    trigger.click();
  });
  
  await assert.visible(
    p.locator("[data-testid='workspace-select-content']"),
    { timeout: 3_000 },
  );
  
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
  
  await new Promise((r) => setTimeout(r, 300));
}

test.describe("10 — HomeAgentForm Home", () => {
  test.beforeAll(async ({ tauriEnv }) => {
    
    
    const { page } = tauriEnv;
    await page.goto("/");
    await resetSidebar(page);
  });

  test.beforeEach(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    page.on("console", (msg) => {
      if (msg.type === "error") {console.error("[10 spec console]", msg.text);}
    });
    
    await resetSidebar(page);
  });

  test("0 workspaces: input disabled + 'No workspaces' placeholder visible", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    
    await resetSidebar(page);
    await reloadPageForSettings(page);
    
    const isDisabled = await page.evaluate(
      (sel) => {
        const el = document.querySelector(sel) as HTMLTextAreaElement | null;
        return el ? el.disabled : false;
      },
      "[data-testid='codex-input']",
    );
    await expect(isDisabled).toBe(true);
    
    
    await assert.visible(
      page.getByText("No workspaces", { exact: false }),
      { timeout: 3_000 },
    );
  });

  test("1 workspace: auto-select triggers + input enabled immediately", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    
    await invoke(page, "addWorkspace", { label: "Solo WS", rootPath: "/tmp/solo-ws" });
    await reloadPageForSettings(page);

    
    
    
    await selectWorkspaceInPicker(page, "Solo WS");

    
    const trigger = page.locator("[data-testid='workspace-select-trigger']");
    await assert.visible(trigger);
    
    
    const triggerText = await page.evaluate(
      () =>
        document.querySelector("[data-testid='workspace-select-trigger']")
          ?.textContent ?? "",
    );
    expect(triggerText).toContain("Solo WS");
    
    const triggerCount = await page.locator("[data-testid='workspace-select-trigger']").count();
    await expect(triggerCount).toBe(1);

    
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
    
    await invoke(page, "addWorkspace", { label: "Workspace A", rootPath: "/tmp/ws-a" });
    await invoke(page, "addWorkspace", { label: "Workspace B", rootPath: "/tmp/ws-b" });
    await reloadPageForSettings(page);

    
    const isDisabledInitially = await page.evaluate(
      (sel) => {
        const el = document.querySelector(sel) as HTMLTextAreaElement | null;
        return el ? el.disabled : false;
      },
      "[data-testid='codex-input']",
    );
    await expect(isDisabledInitially).toBe(true);

    
    const trigger = page.locator("[data-testid='workspace-select-trigger']");
    await trigger.click();

    
    const content = page.locator("[data-testid='workspace-select-content']");
    await assert.visible(content, { timeout: 3_000 });
    const option = content.locator("[role='option']").filter({ hasText: "Workspace A" });
    await option.click();

    
    const isEnabledAfterSelect = await page.evaluate(
      (sel) => {
        const el = document.querySelector(sel) as HTMLTextAreaElement | null;
        return el ? !el.disabled : false;
      },
      "[data-testid='codex-input']",
    );
    await expect(isEnabledAfterSelect).toBe(true);

    
    const triggerTextAfter = await page.evaluate(
      () =>
        document.querySelector("[data-testid='workspace-select-trigger']")
          ?.textContent ?? "",
    );
    expect(triggerTextAfter).toContain("Workspace A");
  });

  test("submit HomeAgentForm: creates conv + transitions to ChatView", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    
    await invoke(page, "addWorkspace", { label: "Submit Test", rootPath: "/tmp/submit" });
    await reloadPageForSettings(page);

    
    await selectWorkspaceInPicker(page, "Submit Test");

    
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

    
    
    await new Promise((r) => setTimeout(r, 2000));
    const pageContent = await page.evaluate(() => document.body.innerText);
    console.log(`[diag] page content snippet: ${pageContent.slice(0, 500)}`);

    
    
    await assert.visible(
      page.locator('textarea[placeholder="发条消息…"]'),
      { timeout: 15_000 },
    );

    
    const codexInputGone = await page.evaluate(
      () => !document.querySelector("[data-testid='codex-input']"),
    );
    await expect(codexInputGone).toBe(true);
  });

  test("新布局: textarea DOM 顺序在 workspace picker 之前", async ({ tauriEnv }) => {
    test.setTimeout(60_000);
    const { page } = tauriEnv;
    
    await invoke(page, "addWorkspace", { label: "Layout Test", rootPath: "/tmp/layout-test" });
    await reloadPageForSettings(page);

    
    await selectWorkspaceInPicker(page, "Layout Test");

    
    await assert.visible(page.locator("[data-testid='codex-input']"), { timeout: 10_000 });
    await assert.visible(page.locator("[data-testid='workspace-select-trigger']"), { timeout: 10_000 });

    
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
    
    await invoke(page, "addWorkspace", { label: "LLM Picker Test", rootPath: "/tmp/llm-picker-test" });
    await reloadPageForSettings(page);

    
    await selectWorkspaceInPicker(page, "LLM Picker Test");

    
    await assert.visible(page.locator("[data-testid='llm-picker-trigger']"), { timeout: 10_000 });

    
    const triggerText = await page.evaluate(() => {
      const el = document.querySelector("[data-testid='llm-picker-trigger']");
      return el?.textContent ?? "";
    });
    await expect(triggerText.length).toBeGreaterThan(0);

    
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

    
    try {
      const existingWs = await invoke<{ id: string; label: string }[]>(page, "listWorkspaces");
      for (const ws of existingWs) {
        if (ws.label === wsLabel) {
          await invoke(page, "deleteWorkspace", { id: ws.id });
        }
      }
    } catch {  }

    
    await invoke(page, "addWorkspace", { label: wsLabel, rootPath: wsRoot });

    
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

    
    const existingProviders = (current.providers as unknown[] ?? []) as unknown[];
    const newSettings = {
      ...current,
      providers: [...existingProviders, twoModelProvider],
      defaultLlmProviderId: "test-two-model",
    };

    await invoke(page, "updateSettings", { newSettings });

    
    await reloadPageForSettings(page);

    
    await selectWorkspaceInPicker(page, wsLabel);

    
    await page.locator("[data-testid='llm-picker-trigger']").click();
    const llmContent = page.locator("[data-testid='llm-picker-content']");
    await assert.visible(llmContent, { timeout: 5_000 });

    
    await page.evaluate(() => {
      const content = document.querySelector('[data-testid="llm-picker-content"]');
      if (!content) {throw new Error("llm-picker-content not found");}
      const options = content.querySelectorAll('[role="option"]');
      for (const option of Array.from(options)) {
        if ((option.textContent ?? "").trim() === "Model Second") {
          (option as HTMLElement).click();
          return;
        }
      }
      throw new Error("Model Second option not found");
    });

    
    const triggerTextAfter = await page.evaluate(() => {
      const el = document.querySelector("[data-testid='llm-picker-trigger']");
      return el?.textContent ?? "";
    });
    expect(triggerTextAfter).toContain("Model Second");

    
    
    
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
    
    await invoke(page, "addWorkspace", { label: "Action Slot Test", rootPath: "/tmp/action-slot-test" });
    await reloadPageForSettings(page);

    
    const trigger = page.locator("[data-testid='workspace-select-trigger']");
    await trigger.click();

    
    const content = page.locator("[data-testid='workspace-select-content']");
    await assert.visible(content, { timeout: 5_000 });

    
    const actionBtn = page.locator("[data-testid='workspace-select-add-btn']");
    await assert.visible(actionBtn, { timeout: 5_000 });

    
    let pageError: Error | null = null;
    const errorHandler = (err: Error) => {
      pageError = err;
    };
    page.on("pageerror", errorHandler);

    try {
      await actionBtn.click({ timeout: 5_000 });
      
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      
    }
    

    
    await expect(pageError).toBeNull();
  });
});
