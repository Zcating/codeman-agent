//! app.store 单测 (ADR-0015 V1.7+).
//!
//! 测试覆盖：
//! - set() 同步更新 state，不触发 IPC（debounce 逻辑在 settings-saver）
//! - refresh() 返回 Effect，Effect.runPromise 后拿到 Settings
//! - forceFlush() 返回 Effect，skip debounce 立即 IPC
//!
//! 关键约束：store 函数返回 `void` 或 `Effect<A, E, R>`，绝不 Promise。

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

  it("forceFlush() returns Effect; Effect.runPromise triggers IPC immediately", async () => {
    appStore.set({ theme: "light" });
    const effect = appStore.forceFlush();
    expect(effect).toBeDefined();
    await Effect.runPromise(effect);
    expect(mockState.calls.filter((c) => c === "update_settings")).toHaveLength(1);
  });
});
