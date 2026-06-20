//! ProviderCard V1.7+ tests — ADR-0015 appStore refactor.
//! Tests for appStore integration, toggle, refresh, dropdown, billing subform,
//! delete removes provider from appStore, API Key input, and no Save buttons.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { mockState } from "../../../__mocks__/@tauri-apps/api/core";

// ─── Mock appStore — ALL variables inside factory to avoid hoisting issues ───────

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
    },
    _resetAppStoreForTest: vi.fn(),
    // Expose internals for test assertions via module mocking
    __setProviders: (p: any[]) => {
      providers = p;
    },
    __getLastSetCall: () => lastSetCall,
  };
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

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

// ─── Import provider-card AFTER mocking ─────────────────────────────────────────
import { ProviderCard } from "./provider-card";

// We need to access the mock internals - import the module to get the exposed functions
import * as appStoreMock from "../../../shared/stores/app.store";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const renderCard = (provider = mockProvider) =>
  render(() => <ProviderCard provider={provider} onUpdate={vi.fn()} onDelete={vi.fn()} />);

const getLastSetCall = () => (appStoreMock as any).__getLastSetCall();
const setProviders = (p: any[]) => (appStoreMock as any).__setProviders(p);

// ─── Tests ────────────────────────────────────────────────────────────────────

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

  // ── Test 1: renders 1 card with provider label ──
  it("renders 1 card with provider label and id", () => {
    renderCard();
    expect(screen.getByText("MiniMax")).toBeInTheDocument();
    expect(screen.getByText("minimax")).toBeInTheDocument(); // code element
  });

  // ── Test 2: toggling enabled checkbox calls appStore.set ──
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

  // ── Test 3: Refresh models button fetches models via ProviderService (HTTP) ──
  it("Refresh models button fetches models via ProviderService.fetchModels", async () => {
    const user = userEvent.setup();
    // Mock window.fetch — ProviderServiceLive.fetchModels does a direct HTTP fetch
    // to provider.llm.models_endpoint with Bearer auth (ADR-0015). No Tauri IPC.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "model-A", name: "Model A", context_window: 100_000 },
            { id: "model-B", name: "Model B" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    // get_settings returns the provider list — used by ProviderServiceLive
    mockState.resolved = { providers: [mockProvider] };

    renderCard();

    const refreshBtn = screen.getByRole("button", { name: /refresh models/i });
    await user.click(refreshBtn);

    // ProviderServiceLive fetched the models_endpoint
    expect(fetchSpy).toHaveBeenCalledWith(
      mockProvider.llm.models_endpoint,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${mockProvider.api_key}`,
        }),
      }),
    );
    // appStore.set was called with the new models list
    const lastSet = getLastSetCall();
    expect(lastSet).toBeTruthy();
    const updated = lastSet.providers.find((p: any) => p.id === "minimax");
    expect(updated.llm.models).toEqual([
      {
        id: "model-A",
        label: "Model A",
        context_window: 100_000,
        deprecated: false,
        thinking: false,
      },
      {
        id: "model-B",
        label: "Model B",
        context_window: undefined,
        deprecated: false,
        thinking: false,
      },
    ]);

    fetchSpy.mockRestore();
  });

  // ── Test 4: model dropdown calls appStore.set on change ──
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

  // ── Test 5: LLM-only provider hides billing subform ──
  it("LLM-only provider (no billing) hides billing subform", () => {
    render(() => (
      <ProviderCard provider={mockProviderNoBilling} onUpdate={vi.fn()} onDelete={vi.fn()} />
    ));

    // LLM section visible
    expect(screen.getByText("LLM")).toBeInTheDocument();
    // Billing section NOT visible
    expect(screen.queryByText("Billing")).not.toBeInTheDocument();
  });

  // ── Test 6: provider with billing renders billing subform with kind dropdown ──
  it("provider with billing renders billing subform with kind dropdown", () => {
    renderCard();

    expect(screen.getByText("LLM")).toBeInTheDocument();
    expect(screen.getByText("Billing")).toBeInTheDocument();
    expect(screen.getByText("Kind")).toBeInTheDocument();

    const selects = document.querySelectorAll("select");
    // 2 selects: model + billing kind
    expect(selects.length).toBeGreaterThanOrEqual(2);
  });

  // ── Test 7: delete button removes provider from appStore ──
  it("delete button removes provider from appStore and calls onDelete", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    // Mock confirm to return true
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(() => <ProviderCard provider={mockProvider} onUpdate={vi.fn()} onDelete={onDelete} />);

    const deleteBtn = screen.getByRole("button", { name: /delete provider/i });
    await user.click(deleteBtn);

    const lastSet = getLastSetCall();
    expect(lastSet).toBeTruthy();
    const updatedProviders = lastSet.providers;
    expect(updatedProviders.find((p: any) => p.id === "minimax")).toBeUndefined();
    expect(onDelete).toHaveBeenCalledWith("minimax");
  });

  // ── Test 8: API Key input onInput calls appStore.set ──
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

  // ── Test 9: No Save buttons in LLM or Billing subform sections ──
  it("no Save button appears in LLM or Billing subform sections", () => {
    renderCard();

    // There should be no button with text "Save" anywhere in the card
    const saveButtons = screen.queryAllByRole("button", { name: /save/i });
    expect(saveButtons.length).toBe(0);
  });
});
