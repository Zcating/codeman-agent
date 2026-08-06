
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
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

describe("LlmSection — accordion + operation auto-save", () => {
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

  // ─── Operation auto-save (no page-level Save) ────────────────────────────────

  it("star click immediately updates appStore.defaultLlmProviderId", async () => {
    mockState.settings = {
      ...baseSettings,
      providers: [mockMiniMaxProvider, mockDeepSeekProvider],
      defaultLlmProviderId: "minimax",
    };
    await Effect.runPromise(appStore.refresh());

    render(() => <LlmSection />);
    await wait();

    // DeepSeek star button (title="设为默认"); minimax is already default
    const starButtons = screen.getAllByTitle("设为默认");
    expect(starButtons).toHaveLength(1);
    starButtons[0].closest("button")!.click();
    await wait();

    expect(appStore.state.value.defaultLlmProviderId).toBe("deepseek");
  });

  it("card save persists directly to appStore", async () => {
    render(() => <LlmSection />);
    await wait();

    screen.getByTestId("provider-row").click();
    await wait();
    expect(screen.getByText("基础配置")).toBeInTheDocument();

    // Modify Base URL
    const input = screen.getByPlaceholderText("https://api.example.com/v1");
    await userEvent.clear(input);
    await userEvent.type(input, "https://new.example.com/anthropic");
    await wait();

    // Card-level save commits immediately (no page-level Save needed)
    screen.getByRole("button", { name: /保存/i }).click();
    await wait();

    expect(appStore.state.value.providers?.[0].llm.baseUrl).toBe(
      "https://new.example.com/anthropic",
    );
  });

  it("deleting default provider transfers default to remaining first in appStore", async () => {
    mockState.settings = {
      ...baseSettings,
      providers: [mockMiniMaxProvider, mockDeepSeekProvider],
      defaultLlmProviderId: "minimax",
    };
    await Effect.runPromise(appStore.refresh());

    vi.stubGlobal("confirm", () => true);

    render(() => <LlmSection />);
    await wait();

    // Hover first row to reveal delete button, then delete minimax (default)
    // 注：jsdom + Solid mouseenter 委托在多个 ProviderCard 时会把所有行置为 hover
    // 状态（单行场景正常），这里取第一个（minimax）即可，行为断言不受影响
    const rows = screen.getAllByTestId("provider-row");
    fireEvent.mouseOver(rows[0]);
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /delete provider/i }).length).toBeGreaterThan(0);
    });
    await userEvent.click(screen.getAllByRole("button", { name: /delete provider/i })[0]);
    await wait(50);

    // Deleted from appStore immediately, default transferred to remaining first
    expect(appStore.state.value.providers?.map((p) => p.id)).toEqual(["deepseek"]);
    expect(appStore.state.value.defaultLlmProviderId).toBe("deepseek");

    vi.restoreAllMocks();
  });

  // ─── Buttons ─────────────────────────────────────────────────────────────────

  it("renders Add provider button in bottom bar", async () => {
    render(() => <LlmSection />);
    await wait();
    expect(screen.getByRole("button", { name: /add provider/i })).toBeInTheDocument();
  });

  it("does NOT render a page-level Save button", async () => {
    render(() => <LlmSection />);
    await wait();
    expect(screen.queryByRole("button", { name: /save|未保存/i })).not.toBeInTheDocument();
  });
});
