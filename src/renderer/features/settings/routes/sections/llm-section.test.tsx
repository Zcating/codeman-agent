//! LlmSection — `/settings/llm` route component tests.
//!
//! Migrated from settings.test.tsx (V1.5 provider rendering tests).
//! Verifies:
//! - Renders 1 card for 1 provider
//! - Renders 2 cards for 2 providers
//! - Shows empty state when providers[] is empty
//! - Footer has Save button
//! - Add provider button is visible

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@solidjs/testing-library";
import { Effect } from "effect";
import { LlmSection } from "./llm-section";
import { mockState, SettingsV15 } from "../../../../__mocks__/ipc-mock";
import type { Provider } from "../../../../shared/lib/types";

// Mock solid-js/store — LlmSection imports appStore, appStore uses createStore.
// jsdom lacks Solid reactive context, this mock provides minimal proxy.
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

import { appStore, _resetAppStoreForTest } from "../../../../shared/stores/app.store";

// V1.5 mock providers
const mockMiniMaxProvider: Provider = {
  id: "minimax",
  label: "MiniMax",
  enabled: true,
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
  enabled: true,
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

const baseSettings: SettingsV15 = {
  providers: [],
  schemaVersion: "1.5",
  defaultLlmProviderId: "minimax",
  userLanguage: "en",
  theme: "dark",
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

describe("LlmSection — /settings/llm", () => {
  beforeEach(async () => {
    _resetAppStoreForTest();
    mockState.settings = {
      ...baseSettings,
      providers: [mockMiniMaxProvider],
    };
    mockState.resolved = undefined;
    mockState.v0FixtureActive = false;
    await Effect.runPromise(appStore.refresh());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders 1 card for 1 provider (MiniMax)", async () => {
    render(() => <LlmSection />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText("MiniMax")).toBeInTheDocument();
    expect(
      screen.queryByText(/No providers configured/i),
    ).not.toBeInTheDocument();
  });

  it("renders 2 cards for 2 providers", async () => {
    mockState.settings = {
      ...baseSettings,
      providers: [mockMiniMaxProvider, mockDeepSeekProvider],
    };
    await Effect.runPromise(appStore.refresh());

    render(() => <LlmSection />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(screen.getByText("MiniMax")).toBeInTheDocument();
    expect(screen.getByText("DeepSeek")).toBeInTheDocument();
  });

  it("shows empty state when providers[] is empty", async () => {
    mockState.settings = { ...baseSettings, providers: [] };
    await Effect.runPromise(appStore.refresh());

    render(() => <LlmSection />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(
      screen.getByText(/No providers configured/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Add your first provider/i),
    ).toBeInTheDocument();
  });

  it("renders Save button (force flush for provider edits)", async () => {
    render(() => <LlmSection />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("renders Add provider button", async () => {
    render(() => <LlmSection />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText("Add provider")).toBeInTheDocument();
  });
});