//! settingsSaver 单测 (ADR-0015 V1.7+).
//!
//! 测试覆盖：
//! - scheduleSave() 500ms debounce coalesce
//! - flushNow() 立即 IPC（跳过 debounce）
//! - cancelPending() 取消 pending timer

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Effect } from "effect";
import { mockState } from "../../../__mocks__/@tauri-apps/api/core";

// Mock solid-js/store（jsdom 没有 Solid reactive context）
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
import { settingsSaver, _resetSettingsSaverForTest } from "./settings-saver";

describe("settingsSaver (ADR-0015 V1.7+)", () => {
  beforeEach(async () => {
    _resetAppStoreForTest();
    _resetSettingsSaverForTest();
    mockState.calls = [];
    mockState.callArgs = [];
    mockState.settings = {
      ...mockState.settings,
      providers: [],
      theme: "dark",
    };
    await Effect.runPromise(appStore.refresh());
  });

  afterEach(() => {
    _resetAppStoreForTest();
    _resetSettingsSaverForTest();
    vi.clearAllMocks();
  });

  it("scheduleSave() debounces 500ms", async () => {
    appStore.set({ theme: "light" });
    settingsSaver.scheduleSave();
    appStore.set({ theme: "dark" });
    settingsSaver.scheduleSave();
    appStore.set({ theme: "light" });
    settingsSaver.scheduleSave();

    // No flush yet
    expect(mockState.calls.filter((c) => c === "update_settings")).toHaveLength(0);

    // After 600ms the debounced flush fires
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(mockState.calls.filter((c) => c === "update_settings")).toHaveLength(1);
  });

  it("flushNow() triggers IPC immediately (skip debounce)", async () => {
    appStore.set({ theme: "light" });
    settingsSaver.scheduleSave();
    await settingsSaver.flushNow();

    expect(mockState.calls.filter((c) => c === "update_settings")).toHaveLength(1);
  });

  it("cancelPending() cancels pending debounce", async () => {
    appStore.set({ theme: "light" });
    settingsSaver.scheduleSave();
    settingsSaver.cancelPending();
    await new Promise((resolve) => setTimeout(resolve, 600));
    // No IPC should have fired
    expect(mockState.calls.filter((c) => c === "update_settings")).toHaveLength(0);
  });
});
