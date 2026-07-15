//! ProviderCard V1.7+ tests 鈥?ADR-0015 appStore refactor.
//! Tests for appStore integration, toggle, refresh, dropdown,
//! delete removes provider from appStore, API Key input, and no Save buttons.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { Effect } from "effect";
import { mockState } from "../../../__mocks__/ipc-mock";

// 鈹€鈹€鈹€ Mock appStore 鈥?ALL variables inside factory to avoid hoisting issues 鈹€鈹€鈹€鈹€鈹€鈹€鈹€

// vi.mock is hoisted, so we must define everything inside the factory
vi.mock("../../../shared/stores/app.store", () => {
  // These are initialized inside the factory, so they're available when the mock runs
  let providers: any[] = [];
  let lastSetCall: any = null;

  return {
    appStore: {
      state: {
        get value() {
          return { providers };
        },
      },
      set: vi.fn((patch: any) => {
        lastSetCall = patch;
        if (patch.providers !== undefined) {
          providers = patch.providers;
        }
      }),
      forceFlush: vi.fn(),
      refresh: vi.fn(),
      refreshProviderModels: vi.fn(),
      deleteProvider: vi.fn(),
      pickWorkspacePath: vi.fn(),
      clearAllHistory: vi.fn(),
    },
    _resetAppStoreForTest: vi.fn(),
    // Expose internals for test assertions via module mocking
    __setProviders: (p: any[]) => {
      providers = p;
    },
    __getLastSetCall: () => lastSetCall,
  };
});

// 鈹€鈹€鈹€ Fixtures 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

const mockProvider = {
  id: "minimax",
  label: "MiniMax",
  enabled: true,
  apiKey: "test-key",
  llm: {
    defaultModel: "MiniMax-M2.5-highspeed",
    baseUrl: "https://api.minimaxi.com/anthropic",
    apiType: "anthropic-messages" as const,
    models: [
      {
        id: "MiniMax-M2.5-highspeed",
        label: "MiniMax-M2.5-highspeed",
        deprecated: false,
        thinking: false,
      },
      {
        id: "MiniMax-M2.1-highspeed",
        label: "MiniMax-M2.1-highspeed",
        deprecated: true,
        thinking: false,
      },
    ],
    modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
  },
};

const _mockProviderDisabled = {
  id: "deepseek",
  label: "DeepSeek",
  enabled: false,
  apiKey: "test-key",
  llm: {
    defaultModel: "deepseek-chat",
    baseUrl: "https://api.deepseek.com/anthropic",
    apiType: "anthropic-messages" as const,
    models: [{ id: "deepseek-chat", label: "deepseek-chat", deprecated: false, thinking: false }],
    modelsEndpoint: "https://api.deepseek.com/models",
  },
};
void _mockProviderDisabled;

// 鈹€鈹€鈹€ Import provider-card AFTER mocking 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
import { ProviderCard } from "./provider-card";

// We need to access the mock internals - import the module to get the exposed functions
import * as appStoreMock from "../../../shared/stores/app.store";
import { _resetSettingsSaverForTest } from "../lib/settings-saver";

// 鈹€鈹€鈹€ Helpers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

const renderCard = (provider = mockProvider) =>
  render(() => <ProviderCard provider={provider} onUpdate={vi.fn()} onDelete={vi.fn()} />);

const getLastSetCall = () => (appStoreMock as any).__getLastSetCall();
const setProviders = (p: any[]) => (appStoreMock as any).__setProviders(p);

// 鈹€鈹€鈹€ Tests 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

describe("ProviderCard", () => {
  beforeEach(() => {
    mockState.calls = [];
    mockState.resolved = undefined;
    mockState.rejected = undefined;
    setProviders([{ ...mockProvider }]);
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    // 2026-07 form pattern: settingsSaver.flushNow() is async; cancel the pending
    // debounce to prevent the timer from firing after test teardown (when the
    // Effect runtime is already disposed → "Cannot read properties of undefined
    // (reading '_op')" unhandled rejection).
    _resetSettingsSaverForTest();
  });

  // 鈹€鈹€ Test 1: renders 1 card with provider label 鈹€鈹€
  it("renders 1 card with provider label and id", () => {
    renderCard();
    expect(screen.getByText("MiniMax")).toBeInTheDocument();
    expect(screen.getByText("minimax")).toBeInTheDocument(); // code element
  });

  // 鈹€鈹€ Test 2: toggling enabled checkbox calls appStore.set 鈹€鈹€
  it("toggling enabled checkbox calls appStore.set and updates state", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(() => <ProviderCard provider={mockProvider} onUpdate={onUpdate} onDelete={vi.fn()} />);

    const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(true);

    await user.click(checkbox);

    // appStore.set was called with updated providers
    const lastSet = getLastSetCall();
    expect(lastSet).toBeTruthy();
    const updatedProviders = lastSet.providers;
    expect(updatedProviders.find((p: any) => p.id === "minimax")?.enabled).toBe(false);
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "minimax", enabled: false }),
    );
  });

  // ── Test 3 (V1.8+ ADR-0016 D1): Refresh models calls appStore.refreshProviderModels ──
  it("Refresh models calls appStore.refreshProviderModels and shows success", async () => {
    const user = userEvent.setup();
    const mockModels = [
      {
        id: "model-A",
        label: "Model A",
        contextWindow: 100_000,
        deprecated: false,
        thinking: false,
      },
      { id: "model-B", label: "Model B", deprecated: false, thinking: false },
    ];
    (appStoreMock as any).appStore.refreshProviderModels.mockReturnValue(
      Effect.succeed(mockModels),
    );
    renderCard();
    const refreshBtn = screen.getByRole("button", { name: /refresh models/i });
    await user.click(refreshBtn);
    await waitFor(() => {
      expect(screen.getByText(/Loaded 2 model/i)).toBeInTheDocument();
    });
    expect((appStoreMock as any).appStore.refreshProviderModels).toHaveBeenCalledWith("minimax");
  });

  it("Refresh models failure shows error message", async () => {
    const user = userEvent.setup();
    (appStoreMock as any).appStore.refreshProviderModels.mockReturnValue(
      Effect.fail({ kind: "IPC" as const, message: "fetchModels failed: HTTP 401" }),
    );
    renderCard();
    const refreshBtn = screen.getByRole("button", { name: /refresh models/i });
    await user.click(refreshBtn);
    await waitFor(() => {
      expect(screen.getByText(/Refresh failed.*IPC.*fetchModels failed/i)).toBeInTheDocument();
    });
  });

  // 鈹€鈹€ Test 4: model dropdown calls appStore.set on change 鈹€鈹€
  it("model dropdown calls appStore.set with new model", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(() => <ProviderCard provider={mockProvider} onUpdate={onUpdate} onDelete={vi.fn()} />);

    const select = document.querySelector("select") as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe("MiniMax-M2.5-highspeed");

    await user.selectOptions(select, "MiniMax-M2.1-highspeed");

    const lastSet = getLastSetCall();
    expect(lastSet).toBeTruthy();
    const updatedProviders = lastSet.providers;
    expect(updatedProviders.find((p: any) => p.id === "minimax")?.llm.defaultModel).toBe(
      "MiniMax-M2.1-highspeed",
    );
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "minimax",
        llm: expect.objectContaining({ defaultModel: "MiniMax-M2.1-highspeed" }),
      }),
    );
  });

  // ── Test 5: Provider card renders LLM section ──
  it("renders LLM section with model + base_url + api key", () => {
    renderCard();

    expect(screen.getByText("LLM")).toBeInTheDocument();
    // V2: model select only (billing subform removed)
    const selects = document.querySelectorAll("select");
    expect(selects.length).toBe(1);
  });

  // ── Test 7 (V1.8+ ADR-0016 D4): delete button calls appStore.deleteProvider + onDelete ──
  it("delete button calls appStore.deleteProvider and onDelete", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    (appStoreMock as any).appStore.deleteProvider.mockReturnValue(Effect.void);
    render(() => <ProviderCard provider={mockProvider} onUpdate={vi.fn()} onDelete={onDelete} />);
    const deleteBtn = screen.getByRole("button", { name: /delete provider/i });
    await user.click(deleteBtn);
    await waitFor(() => {
      expect((appStoreMock as any).appStore.deleteProvider).toHaveBeenCalledWith("minimax");
    });
    expect(onDelete).toHaveBeenCalledWith("minimax");
  });

  // 鈹€鈹€ Test 8: API Key input onInput calls appStore.set 鈹€鈹€
  it("API Key input onBlur commits to appStore with updated api_key (2026-07 form pattern)", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(() => <ProviderCard provider={mockProvider} onUpdate={onUpdate} onDelete={vi.fn()} />);

    // Find the LLM API Key password input (V2: only 1 — billing removed)
    const apiKeyInputs = document.querySelectorAll('input[type="password"]');
    expect(apiKeyInputs.length).toBe(1);

    const llmApiKeyInput = apiKeyInputs[0] as HTMLInputElement;
    await user.clear(llmApiKeyInput);
    await user.type(llmApiKeyInput, "new-secret-key");
    // 2026-07 fix: typing 不再立即写 store;commit 在 onBlur 触发 form.handleSubmit()
    await user.tab(); // 触发 blur

    const lastSet = getLastSetCall();
    expect(lastSet).toBeTruthy();
    const updatedProviders = lastSet.providers;
    expect(updatedProviders.find((p: any) => p.id === "minimax")?.apiKey).toBe("new-secret-key");
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "minimax", apiKey: "new-secret-key" }),
    );
  });

  // ── Test 9: No Save buttons in LLM subform section ──
  it("no Save button appears in LLM subform section", () => {
    renderCard();

    // There should be no button with text "Save" anywhere in the card
    const saveButtons = screen.queryAllByRole("button", { name: /save/i });
    expect(saveButtons.length).toBe(0);
  });

  // ── Test 10: Base URL input commits on blur (2026-07 form pattern) ──
  it("Base URL input commits on blur and updates state (regression 2026-07: typing no longer writes store)", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(() => <ProviderCard provider={mockProvider} onUpdate={onUpdate} onDelete={vi.fn()} />);

    // Find the Base URL input (text input in LLM section)
    const textInputs = document.querySelectorAll('input[type="text"]');
    const baseUrlInput = textInputs[0] as HTMLInputElement;
    expect(baseUrlInput).toBeTruthy();
    expect(baseUrlInput.value).toBe("https://api.minimaxi.com/anthropic");

    await user.clear(baseUrlInput);
    await user.type(baseUrlInput, "https://api.example.com/v1");
    // 2026-07 fix: typing 不再立即写 store;commit 在 onBlur 触发 form.handleSubmit()
    await user.tab(); // 触发 blur

    const lastSet = getLastSetCall();
    expect(lastSet).toBeTruthy();
    const updatedProviders = lastSet.providers;
    expect(updatedProviders.find((p: any) => p.id === "minimax")?.llm.baseUrl).toBe(
      "https://api.example.com/v1",
    );
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "minimax",
        llm: expect.objectContaining({ baseUrl: "https://api.example.com/v1" }),
      }),
    );
  });

  // ── Test 10b (regression 2026-07): typing in Base URL preserves focus + value ──
  it("typing in Base URL input preserves focus (regression: <For> remount on each keystroke)", async () => {
    const user = userEvent.setup();
    render(() => <ProviderCard provider={mockProvider} onUpdate={vi.fn()} onDelete={vi.fn()} />);

    const textInputs = document.querySelectorAll('input[type="text"]');
    const baseUrlInput = textInputs[0] as HTMLInputElement;
    expect(baseUrlInput).toBeTruthy();

    // Focus + clear first (mockProvider.baseUrl is non-empty)
    baseUrlInput.focus();
    await user.clear(baseUrlInput);
    expect(document.activeElement).toBe(baseUrlInput);

    // Type multiple characters — pre-fix, the input element was replaced on each
    // keystroke (Solid <For> + array.map() reference-equal unmount), causing focus loss.
    await user.type(baseUrlInput, "abcdef");

    // After typing 6 characters, input should still be focused AND have the typed value.
    expect(document.activeElement).toBe(baseUrlInput);
    expect(baseUrlInput.value).toBe("abcdef");
  });

  // ── Test 10c (regression 2026-07): Base URL pattern validation on blur ──
  it("Base URL input shows validation error on blur when invalid (no http:// prefix)", async () => {
    const user = userEvent.setup();
    render(() => <ProviderCard provider={mockProvider} onUpdate={vi.fn()} onDelete={vi.fn()} />);

    const textInputs = document.querySelectorAll('input[type="text"]');
    const baseUrlInput = textInputs[0] as HTMLInputElement;

    await user.clear(baseUrlInput);
    await user.type(baseUrlInput, "not-a-url");
    await user.tab(); // 触发 onBlur validator

    // Validation error should be displayed
    await waitFor(() => {
      expect(
        screen.getByText(/Base URL must start with http/i),
      ).toBeInTheDocument();
    });
  });

  // ── Test 11: delete confirm=false 时不调 deleteProvider ──
  it("delete confirm=false 时不调 deleteProvider", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    (appStoreMock as any).appStore.deleteProvider.mockReturnValue(Effect.void);
    const onDelete = vi.fn();

    render(() => <ProviderCard provider={mockProvider} onUpdate={vi.fn()} onDelete={onDelete} />);

    const deleteBtn = screen.getByRole("button", { name: /delete provider/i });
    await user.click(deleteBtn);

    expect(confirmSpy).toHaveBeenCalled();
    expect((appStoreMock as any).appStore.deleteProvider).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  // ── Test 14: delete 失败时显示 'Delete failed' ──
  it("delete 失败时显示 Delete failed 错误信息", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    (appStoreMock as any).appStore.deleteProvider.mockReturnValue(
      Effect.fail({ kind: "IPC" as const, message: "delete failed: provider not found" }),
    );

    render(() => <ProviderCard provider={mockProvider} onUpdate={vi.fn()} onDelete={vi.fn()} />);

    const deleteBtn = screen.getByRole("button", { name: /delete provider/i });
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(screen.getByText(/Delete failed.*IPC.*delete failed: provider not found/i)).toBeInTheDocument();
    });
  });

  // ── Test 15 (TDD RED): dev badge renders when base_url points at local mock server ──
  it("llm.base_url 指向本地 mock server (http://127.0.0.1:...) → 显示 (dev) 徽标", () => {
    const devProvider = {
      id: "mock-test",
      label: "Mock Test",
      enabled: true,
      apiKey: "",
      llm: {
        defaultModel: "mock-default",
        baseUrl: "http://127.0.0.1:50000/mock/anthropic",
        apiType: "anthropic-messages" as const,
        models: [{ id: "mock-default", label: "Mock", deprecated: false, thinking: false }],
        modelsEndpoint: "",
      },
    };
    render(() => <ProviderCard provider={devProvider} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("(dev)")).toBeInTheDocument();
  });
});
