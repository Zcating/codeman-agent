//! app.store 鍗曟祴 (ADR-0015 V1.7+).
//!
//! 娴嬭瘯瑕嗙洊锛?
//! - set() 鍚屾鏇存柊 state锛屼笉瑙﹀彂 IPC锛坉ebounce 閫昏緫鍦?settings-saver锛?
//! - refresh() 杩斿洖 Effect锛孍ffect.runPromise 鍚庢嬁鍒?Settings
//! - forceFlush() 杩斿洖 Effect锛宻kip debounce 绔嬪嵆 IPC
//!
//! 鍏抽敭绾︽潫锛歴tore 鍑芥暟杩斿洖 `void` 鎴?`Effect<A, E, R>`锛岀粷涓?Promise銆?

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Effect } from "effect";
import { mockState } from "../../__mocks__/@tauri-apps/api/core";

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
      if (p === "value") return store.value;
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

import { appStore, _resetAppStoreForTest } from "./app.store";

describe("appStore (ADR-0015 V1.7+ no debounce)", () => {
  beforeEach(async () => {
    _resetAppStoreForTest();
    mockState.calls = [];
    mockState.callArgs = [];
    mockState.resolved = undefined;
    mockState.settings = {
      providers: [],
      schema_version: "1.5",
      user_language: "en",
      theme: "dark",
      start_at_login: false,
      window: {
        remember_position: true,
        remember_size: true,
        default_size: { width: 800, height: 600 },
        min_size: { width: 600, height: 400 },
      },
      system_prompt: { default: "", user_can_edit: true },
      conversations: { auto_archive_after_days: 30, max_history: 1000 },
      llm_providers: [],
      billing_providers: [],
    };
    await Effect.runPromise(appStore.refresh());
  });

  afterEach(() => {
    _resetAppStoreForTest();
    vi.clearAllMocks();
  });

  it("refresh() returns Effect; Effect.runPromise loads settings and returns them", async () => {
    const effect = appStore.refresh();
    expect(effect).toBeDefined();
    const fresh = await Effect.runPromise(effect);
    expect(fresh).toEqual(mockState.settings);
  });

  it("set() is synchronous and does NOT trigger IPC", () => {
    // set returns void
    const result = appStore.set({ theme: "light" });
    expect(result).toBeUndefined();
    // State immediately reflects the change
    expect(appStore.state.value.theme).toBe("light");
    // No IPC fires (debounce is now in settings-saver, NOT in appStore)
    expect(mockState.calls.filter((c) => c === "update_settings")).toHaveLength(0);
  });

  
  // ─── V1.8+ ADR-0016 D1 + D2: refreshProviderModels ───

  it("refreshProviderModels writes new models to state and returns them", async () => {
    mockState.settings = {
      ...mockState.settings,
      providers: [{
        id: "minimax",
        label: "MiniMax",
        enabled: true,
        api_key: "",
        llm: {
          default_model: "old-model",
          base_url: "https://api.example.com/v1",
          api_type: "anthropic-messages" as const,
          models: [{ id: "old-model", label: "Old", deprecated: false, thinking: false }],
          models_endpoint: "https://api.example.com/v1/models",
        },
        billing: { kind: "plan_quota" as const },
      }],
    };
    await Effect.runPromise(appStore.refresh());
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "new-model-A", name: "New A" },
            { id: "new-model-B", name: "New B" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const exit = await Effect.runPromiseExit(appStore.refreshProviderModels("minimax"));
    expect(exit._tag).toBe("Success");
    if (exit._tag === "Success") {
      expect(exit.value.length).toBe(2);
      expect(exit.value[0].id).toBe("new-model-A");
    }
    const provider = (appStore.state.value as any).providers.find((p: any) => p.id === "minimax");
    expect(provider.llm.models.length).toBe(2);
    expect(provider.llm.models[0].id).toBe("new-model-A");
    fetchSpy.mockRestore();
  });

  it("refreshProviderModels auto-fallback when default_model not in new list", async () => {
    mockState.settings = {
      ...mockState.settings,
      providers: [{
        id: "minimax",
        label: "MiniMax",
        enabled: true,
        api_key: "",
        llm: {
          default_model: "old-model",
          base_url: "https://api.example.com/v1",
          api_type: "anthropic-messages" as const,
          models: [{ id: "old-model", label: "Old", deprecated: false, thinking: false }],
          models_endpoint: "https://api.example.com/v1/models",
        },
        billing: { kind: "plan_quota" as const },
      }],
    };
    await Effect.runPromise(appStore.refresh());
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ id: "new-model-X", name: "New X" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await Effect.runPromiseExit(appStore.refreshProviderModels("minimax"));
    const provider = (appStore.state.value as any).providers.find((p: any) => p.id === "minimax");
    expect(provider.llm.default_model).toBe("new-model-X");
    fetchSpy.mockRestore();
  });

  it("refreshProviderModels keeps default_model when already in new list", async () => {
    mockState.settings = {
      ...mockState.settings,
      providers: [{
        id: "minimax",
        label: "MiniMax",
        enabled: true,
        api_key: "",
        llm: {
          default_model: "kept-model",
          base_url: "https://api.example.com/v1",
          api_type: "anthropic-messages" as const,
          models: [{ id: "kept-model", label: "Kept", deprecated: false, thinking: false }],
          models_endpoint: "https://api.example.com/v1/models",
        },
        billing: { kind: "plan_quota" as const },
      }],
    };
    await Effect.runPromise(appStore.refresh());
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "kept-model", name: "Kept" },
            { id: "new-model", name: "New" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await Effect.runPromiseExit(appStore.refreshProviderModels("minimax"));
    const provider = (appStore.state.value as any).providers.find((p: any) => p.id === "minimax");
    expect(provider.llm.default_model).toBe("kept-model");
    fetchSpy.mockRestore();
  });

  it("refreshProviderModels fails for unknown provider (AppError)", async () => {
    mockState.settings = {
      ...mockState.settings,
      providers: [{
        id: "minimax",
        label: "MiniMax",
        enabled: true,
        api_key: "",
        llm: {
          default_model: "x",
          base_url: "https://api.example.com/v1",
          api_type: "anthropic-messages" as const,
          models: [],
          models_endpoint: "https://api.example.com/v1/models",
        },
        billing: { kind: "plan_quota" as const },
      }],
    };
    await Effect.runPromise(appStore.refresh());
    const exit = await Effect.runPromiseExit(appStore.refreshProviderModels("nonexistent"));
    expect(exit._tag).toBe("Failure");
  });
it("forceFlush() returns Effect; Effect.runPromise triggers IPC immediately", async () => {
    appStore.set({ theme: "light" });
    const effect = appStore.forceFlush();
    expect(effect).toBeDefined();
    await Effect.runPromise(effect);
    expect(mockState.calls.filter((c) => c === "update_settings")).toHaveLength(1);
  });
});

