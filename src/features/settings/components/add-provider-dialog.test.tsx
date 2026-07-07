//! add-provider-dialog.test.tsx — RED step for createProviderFormDialog() imperative API.
//! Function does NOT exist yet — tests will fail with import error. That is CORRECT for RED.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";

// ─── Import the imperative API under test (will fail until function exists) ─────

import { createProviderFormDialog } from "./add-provider-dialog";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Drains the Solid.js effect queue + waits for Portal mount.
 * Solid Portal is async — multiple ticks needed to ensure DOM is ready.
 */
async function flushPromises(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((r) => setTimeout(r, 0));
  }
}

/**
 * Defensive cleanup: removes any leftover dialog containers from document.body.
 * Solid renders into a Portal appended to document.body; each dialog call creates
 * a container that must be disposed. This guards against test pollution.
 */
function cleanupDialogContainers(): void {
  // Remove container divs that were appended to body by Dialog.show()
  const body = document.body;
  const toRemove: Element[] = [];
  body.querySelectorAll("div").forEach((el) => {
    // A dialog container is a bare div with no children (render target) OR
    // a Portal container that holds the dialog content
    if (
      el.parentElement === body &&
      (el.children.length === 0 || el.querySelector("[role='dialog']"))
    ) {
      toRemove.push(el);
    }
  });
  toRemove.forEach((el) => el.remove());
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("createProviderFormDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    cleanupDialogContainers();
  });

  // S1: Default real type, fill all fields, click Add → resolved with full Provider payload
  it("Real API 模式下填完字段点击 Add → resolve 完整 Provider 对象", async () => {
    const user = userEvent.setup();

    const promise = createProviderFormDialog();
    await flushPromises();

    // Dialog should be visible
    expect(screen.getByTestId("add-provider-dialog")).toBeInTheDocument();

    // Fill all 4 input fields
    await user.type(screen.getByTestId("provider-field-label"), "My Provider");
    await user.type(screen.getByTestId("provider-field-base-url"), "https://api.example.com");
    await user.type(screen.getByTestId("provider-field-default-model"), "gpt-4o");
    await user.type(screen.getByTestId("provider-field-api-key"), "sk-test-12345");

    // Click Add
    await user.click(screen.getByTestId("provider-add-button"));

    const provider = await promise;

    // Verify full Provider shape
    expect(provider).not.toBeNull();
    expect(provider!.id).toMatch(/^provider-/);
    expect(provider!.label).toBe("My Provider");
    expect(provider!.enabled).toBe(true);
    expect(provider!.api_key).toBe("sk-test-12345");
    expect(provider!.llm.default_model).toBe("gpt-4o");
    expect(provider!.llm.base_url).toBe("https://api.example.com");
    expect(provider!.llm.api_type).toBe("anthropic-messages");
    expect(Array.isArray(provider!.llm.models)).toBe(true);
    expect(provider!.llm.models_endpoint).toBe("");
  });

  // S2: Select Mock (fields filled) → select Real (fields cleared)
  it("先选 Mock 自动填字段 → 再选 Real API → 字段清空", async () => {
    const user = userEvent.setup();

    const promise = createProviderFormDialog();
    await flushPromises();

    // Select Mock — fields should auto-fill
    await user.click(screen.getByTestId("provider-type-mock"));

    const labelInput = screen.getByTestId("provider-field-label") as HTMLInputElement;
    const baseUrlInput = screen.getByTestId("provider-field-base-url") as HTMLInputElement;
    const defaultModelInput = screen.getByTestId("provider-field-default-model") as HTMLInputElement;
    const apiKeyInput = screen.getByTestId("provider-field-api-key") as HTMLInputElement;

    // Verify Mock defaults (base_url points at local mock-server, per CONTEXT.md 「Fake LLM Provider」)
    expect(labelInput.value).toBe("Mock");
    expect(baseUrlInput.value).toBe("http://127.0.0.1:50000/mock/anthropic");
    expect(defaultModelInput.value).toBe("mock-default");
    expect(apiKeyInput.value).toBe("");

    // Switch to Real API — fields should clear
    await user.click(screen.getByTestId("provider-type-real"));

    expect(labelInput.value).toBe("");
    expect(baseUrlInput.value).toBe("");
    expect(defaultModelInput.value).toBe("");
    expect(apiKeyInput.value).toBe("");

    // Cancel the dialog
    await user.click(screen.getByTestId("provider-cancel-button"));

    const result = await promise;
    expect(result).toBeNull();
  });

  // S3: Open dialog, click Cancel → resolved with null
  it("打开弹窗点击 Cancel → resolve(null)", async () => {
    const user = userEvent.setup();

    const promise = createProviderFormDialog();
    await flushPromises();

    expect(screen.getByTestId("add-provider-dialog")).toBeInTheDocument();

    await user.click(screen.getByTestId("provider-cancel-button"));

    const result = await promise;
    expect(result).toBeNull();
  });

  // S5: Mock 模式下修改 baseUrl 到一个不同的 mock server URL → click Add → resolved.llm.base_url === 该 URL
  it("Mock 模式下修改 baseUrl → 点击 Add → resolve(provider.llm.base_url=<修改后的URL>)", async () => {
    const user = userEvent.setup();

    const promise = createProviderFormDialog();
    await flushPromises();

    // Select Mock (pre-fills defaults)
    await user.click(screen.getByTestId("provider-type-mock"));

    // Edit base_url to a custom local mock server (still 127.0.0.1 family)
    const baseUrlInput = screen.getByTestId("provider-field-base-url") as HTMLInputElement;
    await user.clear(baseUrlInput);
    await user.type(baseUrlInput, "http://127.0.0.1:51000/mock/anthropic");

    // Click Add
    await user.click(screen.getByTestId("provider-add-button"));

    const provider = await promise;

    expect(provider).not.toBeNull();
    expect(provider!.llm.base_url).toBe("http://127.0.0.1:51000/mock/anthropic");
    expect(provider!.id).toMatch(/^mock-/);
  });
});
