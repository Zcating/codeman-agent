
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";


import { createProviderFormDialog } from "@codeman-frontend/features/settings/components/add-provider-dialog";


async function flushPromises(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((r) => setTimeout(r, 0));
  }
}

function cleanupDialogContainers(): void {
  const body = document.body;
  const toRemove: Element[] = [];
  body.querySelectorAll("div").forEach((el) => {
    if (
      el.parentElement === body &&
      (el.children.length === 0 || el.querySelector("[role='dialog']"))
    ) {
      toRemove.push(el);
    }
  });
  toRemove.forEach((el) => {
    try {
      el.remove();
    } catch {
    }
  });
}


describe("createProviderFormDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupDialogContainers();
  });

  it("Real API 模式下填完字段点击 Add → resolve 完整 Provider 对象", async () => {
    const user = userEvent.setup();

    const promise = createProviderFormDialog();
    await flushPromises();

    expect(screen.getByTestId("add-provider-dialog")).toBeInTheDocument();

    await user.type(screen.getByTestId("provider-field-label"), "My Provider");
    await user.type(screen.getByTestId("provider-field-base-url"), "https://api.example.com");
    await user.type(screen.getByTestId("provider-field-default-model"), "gpt-4o");
    await user.type(screen.getByTestId("provider-field-api-key"), "sk-test-12345");

    await user.click(screen.getByTestId("provider-add-button"));

    const provider = await promise;

    expect(provider).not.toBeNull();
    expect(provider!.id).toMatch(/^provider-/);
    expect(provider!.label).toBe("My Provider");
    expect(provider!.enabled).toBe(true);
    expect(provider!.apiKey).toBe("sk-test-12345");
    expect(provider!.llm.defaultModel).toBe("gpt-4o");
    expect(provider!.llm.baseUrl).toBe("https://api.example.com");
    expect(provider!.llm.apiType).toBe("anthropic-messages");
    expect(Array.isArray(provider!.llm.models)).toBe(true);
    expect(provider!.llm.modelsEndpoint).toBe("");
  });

  it("先选 Mock 自动填字段 → 再选 Real API → 字段清空", async () => {
    const user = userEvent.setup();

    const promise = createProviderFormDialog();
    await flushPromises();

    await user.click(screen.getByTestId("provider-type-mock"));

    const labelInput = screen.getByTestId("provider-field-label") as HTMLInputElement;
    const baseUrlInput = screen.getByTestId("provider-field-base-url") as HTMLInputElement;
    const defaultModelInput = screen.getByTestId("provider-field-default-model") as HTMLInputElement;
    const apiKeyInput = screen.getByTestId("provider-field-api-key") as HTMLInputElement;

    expect(labelInput.value).toBe("Mock");
    expect(baseUrlInput.value).toBe("http://127.0.0.1:50000/mock/anthropic");
    expect(defaultModelInput.value).toBe("mock-default");
    expect(apiKeyInput.value).toBe("");

    await user.click(screen.getByTestId("provider-type-real"));

    expect(labelInput.value).toBe("");
    expect(baseUrlInput.value).toBe("");
    expect(defaultModelInput.value).toBe("");
    expect(apiKeyInput.value).toBe("");

    await user.click(screen.getByTestId("provider-cancel-button"));

    const result = await promise;
    expect(result).toBeNull();
  });

  it("打开弹窗点击 Cancel → resolve(null)", async () => {
    const user = userEvent.setup();

    const promise = createProviderFormDialog();
    await flushPromises();

    expect(screen.getByTestId("add-provider-dialog")).toBeInTheDocument();

    await user.click(screen.getByTestId("provider-cancel-button"));

    const result = await promise;
    expect(result).toBeNull();
  });

  it("Mock 模式下修改 baseUrl → 点击 Add → resolve(provider.llm.base_url=<修改后的URL>)", async () => {
    const user = userEvent.setup();

    const promise = createProviderFormDialog();
    await flushPromises();

    await user.click(screen.getByTestId("provider-type-mock"));

    const baseUrlInput = screen.getByTestId("provider-field-base-url") as HTMLInputElement;
    await user.clear(baseUrlInput);
    await user.type(baseUrlInput, "http://127.0.0.1:51000/mock/anthropic");

    await user.click(screen.getByTestId("provider-add-button"));

    const provider = await promise;

    expect(provider).not.toBeNull();
    expect(provider!.llm.baseUrl).toBe("http://127.0.0.1:51000/mock/anthropic");
    expect(provider!.id).toMatch(/^mock-/);
  });
});
