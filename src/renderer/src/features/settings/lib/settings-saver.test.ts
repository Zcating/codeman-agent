
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Effect } from "effect";
import { mockState } from "@codeman-frontend/__mocks__/ipc-mock";
import { logger } from "@codeman-frontend/shared/lib/logger";

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

import { appStore, _resetAppStoreForTest } from "@codeman-frontend/shared/stores/app.store";
import { settingsSaver, _resetSettingsSaverForTest } from "@codeman-frontend/features/settings/lib/settings-saver";

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

    expect(mockState.calls.filter((c) => c === "updateSettings")).toHaveLength(0);

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(mockState.calls.filter((c) => c === "updateSettings")).toHaveLength(1);
  });

  it("flushNow() triggers IPC immediately (skip debounce)", async () => {
    appStore.set({ theme: "light" });
    settingsSaver.scheduleSave();
    await settingsSaver.flushNow();

    expect(mockState.calls.filter((c) => c === "updateSettings")).toHaveLength(1);
  });

  it("cancelPending() cancels pending debounce", async () => {
    appStore.set({ theme: "light" });
    settingsSaver.scheduleSave();
    settingsSaver.cancelPending();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(mockState.calls.filter((c) => c === "updateSettings")).toHaveLength(0);
  });

  it("scheduleSave() 触发 flush 失败时 logger.error 被调", async () => {
    vi.useFakeTimers();

    appStore.set({ theme: "light" });
    settingsSaver.scheduleSave();

    mockState.rejected = new Error("boom");

    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    vi.advanceTimersByTime(510);

    await vi.runAllTimersAsync();

    expect(errorSpy).toHaveBeenCalledWith(
      "[settingsSaver] debounced flush failed:",
      expect.stringContaining("boom"),
    );

    errorSpy.mockRestore();
    mockState.rejected = undefined;
    vi.useRealTimers();
  });

  it("flushNow() 在 forceFlush 失败时 reject with formatted error", async () => {
    mockState.rejected = new Error("forceFlush failed: IPC error");

    let thrownError: unknown;
    try {
      await settingsSaver.flushNow();
    } catch (e) {
      thrownError = e;
    }
    expect(thrownError).toBeTruthy();
    expect((thrownError as Error).message).toContain("IPC error");

    mockState.rejected = undefined;
  });
});
