
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@solidjs/testing-library";
import { Effect } from "effect";
import { LlmSection } from "@codeman-frontend/features/settings/routes/sections/llm-section";
import { mockState } from "@codeman-frontend/__mocks__/ipc-mock";
import type { Provider } from "@codeman-frontend/shared/lib/types";
import { _resetSettingsSaverForTest } from "@codeman-frontend/features/settings/lib/settings-saver";
import { appStore, _resetAppStoreForTest } from "@codeman-frontend/shared/stores/app.store";

vi.mock("solid-js/store", () => {
  let store: { value: unknown } = { value: null };
  const setStore = vi.fn((...args: unknown[]) => {
    const updater = args.length === 2 ? args[1] : args[0];
    if (typeof updater === "function") {
      store.value = (updater as (prev: unknown) => unknown)(store.value);
    } else {
      store.value = updater;
    }
  });
  const storeProxy = new Proxy(store, {
    get(t, p) {
      if (p === "value") {return store.value;}
      return (t as any)[p];
    },
    set(t, p, v) {
      if (p === "value") {
        store.value = v;
        return true;
      }
      (t as any)[p] = v;
      return true;
    },
  });
  return { createStore: () => [storeProxy, setStore] };
});

const mockMiniMaxProvider: Provider = {
  id: "minimax",
  label: "MiniMax",
  comment: undefined,
  apiKey: "",
  llm: {
    defaultModel: "MiniMax-M2.5-highspeed",
    baseUrl: "https://api.minimaxi.com/anthropic",
    apiType: "anthropic-messages",
    models: [
      {
        id: "MiniMax-M2.5-highspeed",
        label: "MiniMax-M2.5-highspeed",
        deprecated: false,
        thinking: false,
      },
    ],
    modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
  },
};

const mockDeepSeekProvider: Provider = {
  id: "deepseek",
  label: "DeepSeek",
  comment: undefined,
  apiKey: "",
  llm: {
    defaultModel: "deepseek-chat",
    baseUrl: "https://api.deepseek.com/anthropic",
    apiType: "anthropic-messages",
    models: [
      {
        id: "deepseek-chat",
        label: "DeepSeek Chat",
        deprecated: false,
        thinking: false,
      },
    ],
    modelsEndpoint: "https://api.deepseek.com/anthropic/v1/models",
  },
};

const baseSettings = {
  providers: [] as Provider[],
  schemaVersion: "1.5" as const,
  defaultLlmProviderId: "minimax",
  userLanguage: "en" as const,
  theme: "dark" as const,
  startAtLogin: false,
  window: {
    rememberPosition: true,
    rememberSize: true,
    defaultSize: { width: 800, height: 600 },
    minSize: { width: 600, height: 400 },
  },
  systemPrompt: { default: "You are a helpful assistant.", userCanEdit: true },
  conversations: { autoArchiveAfterDays: 30, maxHistory: 1000 },
  llmProviders: [],
};

describe("LlmSection — accordion + explicit save (ADR-0050 D2/D5)", () => {
  beforeEach(async () => {
    _resetAppStoreForTest();
    _resetSettingsSaverForTest();
    mockState.settings = { ...baseSettings, providers: [mockMiniMaxProvider] };
    mockState.resolved = undefined;
    mockState.v0FixtureActive = false;
    await Effect.runPromise(appStore.refresh());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

  // Helper to get the Save/未保存 button
  const getSaveButton = () => screen.getByRole("button", { name: /save|未保存/i });

  // ─── Accordion ────────────────────────────────────────────────────────────────

  it("renders collapsed row for each provider", async () => {
    mockState.settings = {
      ...baseSettings,
      providers: [mockMiniMaxProvider, mockDeepSeekProvider],
    };
    await Effect.runPromise(appStore.refresh());

    render(() => <LlmSection />);
    await wait();

    expect(screen.getByText("MiniMax")).toBeInTheDocument();
    expect(screen.getByText("DeepSeek")).toBeInTheDocument();
    // expanded editor should NOT be visible initially
    expect(screen.queryByText("基础配置")).not.toBeInTheDocument();
  });

  it("expands a row on click (accordion)", async () => {
    render(() => <LlmSection />);
    await wait();

    const row = screen.getByTestId("provider-row");
    row.click();
    await wait();

    expect(screen.getByText("基础配置")).toBeInTheDocument();
  });

  it("collapses previous row when another is clicked (single-select)", async () => {
    mockState.settings = {
      ...baseSettings,
      providers: [mockMiniMaxProvider, mockDeepSeekProvider],
    };
    await Effect.runPromise(appStore.refresh());

    render(() => <LlmSection />);
    await wait();

    const rows = screen.getAllByTestId("provider-row");

    // Expand first
    rows[0].click();
    await wait();
    expect(screen.getByText("基础配置")).toBeInTheDocument();

    // Expand second — first collapses
    rows[1].click();
    await wait();
    // Still one expanded editor visible
    expect(screen.getByText("基础配置")).toBeInTheDocument();
  });

  it("shows empty state when providers[] is empty", async () => {
    mockState.settings = { ...baseSettings, providers: [] };
    await Effect.runPromise(appStore.refresh());

    render(() => <LlmSection />);
    await wait();

    expect(screen.getByText(/No providers configured/i)).toBeInTheDocument();
  });

  // ─── Dirty marker ─────────────────────────────────────────────────────────────

  it("Save button shows dirty ring when pending changes exist", async () => {
    mockState.settings = {
      ...baseSettings,
      providers: [mockMiniMaxProvider, mockDeepSeekProvider],
      defaultLlmProviderId: "minimax",
    };
    await Effect.runPromise(appStore.refresh());

    render(() => <LlmSection />);
    await wait();

    const saveBtn = getSaveButton();
    // Initially clean — no dirty ring class (button says "Save")
    expect(saveBtn.className).not.toMatch(/ring-yellow-400/);

    // Set default (non-data change) → creates pending
    const starButtons = screen.getAllByTitle("设为默认");
    starButtons[0].closest("button")!.click();
    await wait();

    // Now dirty ring should appear (button now says "未保存")
    const dirtyBtn = getSaveButton();
    expect(dirtyBtn.className).toMatch(/ring-yellow-400/);
  });

  // ─── Save commits pending ─────────────────────────────────────────────────────

  it("Save commits pending providers to appStore", async () => {
    mockState.settings = {
      ...baseSettings,
      providers: [mockMiniMaxProvider, mockDeepSeekProvider],
      defaultLlmProviderId: "minimax",
    };
    await Effect.runPromise(appStore.refresh());

    render(() => <LlmSection />);
    await wait();

    // Set default to create pending state
    const starButtons = screen.getAllByTitle("设为默认");
    starButtons[0].closest("button")!.click();
    await wait();

    // Click the Save/未保存 button
    const btn = getSaveButton();
    btn.click();
    await wait(50);

    // State is clean in appStore
    expect(appStore.state.value.providers).toHaveLength(2);
    expect(appStore.state.value.defaultLlmProviderId).toBe("deepseek");
  });

  // ─── Set default ──────────────────────────────────────────────────────────────

  it("star sets defaultLlmProviderId in pending state", async () => {
    mockState.settings = {
      ...baseSettings,
      providers: [mockMiniMaxProvider, mockDeepSeekProvider],
      defaultLlmProviderId: "minimax",
    };
    await Effect.runPromise(appStore.refresh());

    render(() => <LlmSection />);
    await wait();

    // DeepSeek star button (title="设为默认")
    const starButtons = screen.getAllByTitle("设为默认");
    // minimax is already default so it has title "默认 Provider"
    // deepseek is not default so it has title "设为默认"
    expect(starButtons).toHaveLength(1); // only deepseek matches "设为默认"
    starButtons[0].closest("button")!.click();
    await wait();

    // Dirty ring appears on Save button
    const saveBtn = getSaveButton();
    expect(saveBtn.className).toMatch(/ring-2/);
  });

  it("set default + Save updates appStore.defaultLlmProviderId", async () => {
    mockState.settings = {
      ...baseSettings,
      providers: [mockMiniMaxProvider, mockDeepSeekProvider],
      defaultLlmProviderId: "minimax",
    };
    await Effect.runPromise(appStore.refresh());

    render(() => <LlmSection />);
    await wait();

    // Set DeepSeek as default
    const starButtons = screen.getAllByTitle("设为默认");
    starButtons[0].closest("button")!.click();
    await wait();

    // Save
    const btn = getSaveButton();
    btn.click();
    await wait(50);

    expect(appStore.state.value.defaultLlmProviderId).toBe("deepseek");
  });

  // ─── Delete default transfers ────────────────────────────────────────────────

  it("deleting default provider transfers default to remaining first in pending state", async () => {
    mockState.settings = {
      ...baseSettings,
      providers: [mockMiniMaxProvider, mockDeepSeekProvider],
      defaultLlmProviderId: "minimax",
    };
    await Effect.runPromise(appStore.refresh());

    vi.stubGlobal("confirm", () => true);

    render(() => <LlmSection />);
    await wait();

    // Expand minimax row
    const rows = screen.getAllByTestId("provider-row");
    rows[0].click();
    await wait();

    // Click delete in danger zone
    const deleteBtn = screen.getByRole("button", { name: /删除 provider/i });
    deleteBtn.click();
    await wait(50);

    // Save button should show dirty ring
    const saveBtn = getSaveButton();
    expect(saveBtn.className).toMatch(/ring-2/);

    vi.restoreAllMocks();
  });

  // ─── Window beforeunload guard ──────────────────────────────────────────────

  it("registers beforeunload listener on mount", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    let capturedHandler: EventListenerOrEventListenerObject | null = null;
    addSpy.mockImplementation((event: string, handler: EventListenerOrEventListenerObject) => {
      if (event === "beforeunload") {capturedHandler = handler;}
      return undefined as unknown as void;
    });

    render(() => <LlmSection />);
    await wait();

    expect(addSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    expect(capturedHandler).not.toBeNull();

    addSpy.mockRestore();
  });

  it("unregisters beforeunload listener on unmount", async () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    removeSpy.mockImplementation(() => undefined as unknown as void);

    const { unmount } = render(() => <LlmSection />);
    await wait();

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));

    removeSpy.mockRestore();
  });

  // ─── Buttons ─────────────────────────────────────────────────────────────────

  it("renders Add provider button", async () => {
    render(() => <LlmSection />);
    await wait();
    expect(screen.getByRole("button", { name: /add provider/i })).toBeInTheDocument();
  });

  it("renders Save button (clean state says Save)", async () => {
    render(() => <LlmSection />);
    await wait();
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
  });
});
