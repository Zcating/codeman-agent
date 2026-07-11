//! SettingsPage 路由测试 (V1.5)。
//!
//! Mocked: SettingsService Effect 服务（通过 src/__mocks__/@tauri-apps/api/core.ts）。
//! V1.5: 测试 providers[] 渲染，空状态、2 providers 场景。
//! Link 从 @tanstack/solid-router mock 以避免需要 RouterProvider。

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@solidjs/testing-library";
import { Effect } from "effect";
import { SettingsPage } from "./settings";
import { mockState, SettingsV15 } from "../../../__mocks__/ipc-mock";
import type { Provider } from "../../../shared/lib/types";

// Mock solid-js/store — SettingsPage 导入 appStore, appStore 用 createStore。
// jsdom 没有 Solid reactive context,需要这个 mock。
// **不**在 vitest.setup.ts 全局注册(per ADR-0020):conversations.store.test.ts
// 用 createRoot + 真 Solid 运行时,全局 mock 会与真 Solid signal 冲突。
// 因此本文件内联 28 行 mock 块——6 个 settings/shared 测试文件保持同一模式。
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
      if (p === "value") {
        return store.value;
      }
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

import { appStore, _resetAppStoreForTest } from "../../../shared/stores/app.store";

vi.mock("@tanstack/solid-router", async () => {
  const actual = await vi.importActual("@tanstack/solid-router");
  return {
    ...actual,
    // Mock Link 以避免需要 useRouter/useLinkProps（需要 RouterProvider context）。
    Link: (props: { to?: string; href?: string; class?: string; children?: unknown }) => (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <a href={props.to ?? props.href} class={props.class}>
        {props.children as any}
      </a>
    ),
  };
});

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
    models: [{ id: "deepseek-chat", label: "DeepSeek Chat", deprecated: false, thinking: false }],
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

describe("SettingsPage — V1.5 provider rendering", () => {
  beforeEach(async () => {
    // 重置 appStore,避免 appStore.state.value 为 null 导致 render 时崩溃
    _resetAppStoreForTest();
    // Reset to default V1.5 settings with 1 provider (MiniMax)
    mockState.settings = {
      ...baseSettings,
      providers: [mockMiniMaxProvider],
    };
    // Clear resolved so the mock handler is used
    mockState.resolved = undefined;
    mockState.v0FixtureActive = false;
    // 触发 refresh 把 mockState.settings 同步到 appStore
    await Effect.runPromise(appStore.refresh());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders 1 card for 1 provider (MiniMax)", async () => {
    render(() => <SettingsPage />);
    // Wait for async loading to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    // MiniMax provider card should be visible
    expect(screen.getByText("MiniMax")).toBeInTheDocument();
    // Should NOT show empty state
    expect(screen.queryByText(/No providers configured/i)).not.toBeInTheDocument();
  });

  it("renders 2 cards for 2 providers", async () => {
    mockState.settings = {
      ...baseSettings,
      providers: [mockMiniMaxProvider, mockDeepSeekProvider],
    };
    await Effect.runPromise(appStore.refresh());

    render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(screen.getByText("MiniMax")).toBeInTheDocument();
    expect(screen.getByText("DeepSeek")).toBeInTheDocument();
  });

  it("shows empty state when providers[] is empty", async () => {
    mockState.settings = {
      ...baseSettings,
      providers: [],
    };
    await Effect.runPromise(appStore.refresh());

    render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(screen.getByText(/No providers configured/i)).toBeInTheDocument();
    expect(screen.getByText(/Add your first provider/i)).toBeInTheDocument();
  });

  it("renders 5 tabs", async () => {
    const { container } = render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const tabs = container.querySelectorAll("nav button");
    expect(tabs.length).toBe(4); // V2: billing tab removed
  });

  it("header has Back link with correct text", async () => {
    const { container } = render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const backLink = container.querySelector("header a");
    expect(backLink?.textContent).toContain("Back");
  });

  it("footer has Save button", async () => {
    const { container } = render(() => <SettingsPage />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const saveBtn = container.querySelector("footer button");
    expect(saveBtn?.textContent).toContain("Save");
  });
});


