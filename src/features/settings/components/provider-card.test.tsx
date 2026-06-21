//! ProviderCard V1.7+ tests 鈥?ADR-0015 appStore refactor.
//! Tests for appStore integration, toggle, refresh, dropdown, billing subform,
//! delete removes provider from appStore, API Key input, and no Save buttons.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { Effect } from "effect";
import { mockState } from "../../../__mocks__/@tauri-apps/api/core";

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
  api_key: "test-key",
  llm: {
    default_model: "MiniMax-M2.5-highspeed",
    base_url: "https://api.minimaxi.com/anthropic",
    api_type: "anthropic-messages" as const,
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
    models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
  },
  billing: { kind: "plan_quota" as const },
};

const mockProviderNoBilling = {
  id: "deepseek",
  label: "DeepSeek",
  enabled: false,
  api_key: "test-key",
  llm: {
    default_model: "deepseek-chat",
    base_url: "https://api.deepseek.com/anthropic",
    api_type: "anthropic-messages" as const,
    models: [{ id: "deepseek-chat", label: "deepseek-chat", deprecated: false, thinking: false }],
    models_endpoint: "https://api.deepseek.com/models",
  },
};

// 鈹€鈹€鈹€ Import provider-card AFTER mocking 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
import { ProviderCard } from "./provider-card";

// We need to access the mock internals - import the module to get the exposed functions
import * as appStoreMock from "../../../shared/stores/app.store";

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
      { id: "model-A", label: "Model A", context_window: 100_000, deprecated: false, thinking: false },
      { id: "model-B", label: "Model B", deprecated: false, thinking: false },
    ];
    (appStoreMock as any).appStore.refreshProviderModels.mockReturnValue(Effect.succeed(mockModels));
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
    expect(updatedProviders.find((p: any) => p.id === "minimax")?.llm.default_model).toBe(
      "MiniMax-M2.1-highspeed",
    );
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "minimax",
        llm: expect.objectContaining({ default_model: "MiniMax-M2.1-highspeed" }),
      }),
    );
  });

  // 鈹€鈹€ Test 5: LLM-only provider hides billing subform 鈹€鈹€
  it("LLM-only provider (no billing) hides billing subform", () => {
    render(() => (
      <ProviderCard provider={mockProviderNoBilling} onUpdate={vi.fn()} onDelete={vi.fn()} />
    ));

    // LLM section visible
    expect(screen.getByText("LLM")).toBeInTheDocument();
    // Billing section NOT visible
    expect(screen.queryByText("Billing")).not.toBeInTheDocument();
  });

  // 鈹€鈹€ Test 6: provider with billing renders billing subform with kind dropdown 鈹€鈹€
  it("provider with billing renders billing subform with kind dropdown", () => {
    renderCard();

    expect(screen.getByText("LLM")).toBeInTheDocument();
    expect(screen.getByText("Billing")).toBeInTheDocument();
    expect(screen.getByText("Kind")).toBeInTheDocument();

    const selects = document.querySelectorAll("select");
    // 2 selects: model + billing kind
    expect(selects.length).toBeGreaterThanOrEqual(2);
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
  it("API Key input onInput calls appStore.set with updated api_key", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(() => <ProviderCard provider={mockProvider} onUpdate={onUpdate} onDelete={vi.fn()} />);

    // Find the first password input (LLM API Key)
    const apiKeyInputs = document.querySelectorAll('input[type="password"]');
    expect(apiKeyInputs.length).toBeGreaterThanOrEqual(2); // LLM + Billing

    const llmApiKeyInput = apiKeyInputs[0] as HTMLInputElement;
    await user.clear(llmApiKeyInput);
    await user.type(llmApiKeyInput, "new-secret-key");

    const lastSet = getLastSetCall();
    expect(lastSet).toBeTruthy();
    const updatedProviders = lastSet.providers;
    expect(updatedProviders.find((p: any) => p.id === "minimax")?.api_key).toBe("new-secret-key");
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "minimax", api_key: "new-secret-key" }),
    );
  });

  // 鈹€鈹€ Test 9: No Save buttons in LLM or Billing subform sections 鈹€鈹€
  it("no Save button appears in LLM or Billing subform sections", () => {
    renderCard();

    // There should be no button with text "Save" anywhere in the card
    const saveButtons = screen.queryAllByRole("button", { name: /save/i });
    expect(saveButtons.length).toBe(0);
  });
});




