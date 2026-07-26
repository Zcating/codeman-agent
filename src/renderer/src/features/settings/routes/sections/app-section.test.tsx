//! AppSection — `/settings/app` route component tests.

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@solidjs/testing-library";
import { Effect } from "effect";
import { AppSection } from "@codeman-frontend/features/settings/routes/sections/app-section";
import { mockState, SettingsV15 } from "@codeman-frontend/__mocks__/ipc-mock";

// Mock solid-js/store (jsdom lacks Solid reactive context)
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

import { appStore, _resetAppStoreForTest } from "@codeman-frontend/shared/stores/app.store";

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
  systemPrompt: { default: "", userCanEdit: true },
  conversations: { autoArchiveAfterDays: 30, maxHistory: 1000 },
  llmProviders: [],
};

describe("AppSection — /settings/app", () => {
  beforeEach(async () => {
    _resetAppStoreForTest();
    mockState.settings = { ...baseSettings, startAtLogin: false };
    mockState.resolved = undefined;
    mockState.v0FixtureActive = false;
    await Effect.runPromise(appStore.refresh());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders 'Start at login' label", () => {
    render(() => <AppSection />);
    expect(screen.getByText("Start at login")).toBeInTheDocument();
  });

  it("renders startAtLogin checkbox", () => {
    render(() => <AppSection />);
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(false);
  });

  it("checkbox reflects current startAtLogin value (true)", async () => {
    mockState.settings = { ...baseSettings, startAtLogin: true };
    await Effect.runPromise(appStore.refresh());
    render(() => <AppSection />);
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("clicking checkbox calls appStore.set({ startAtLogin: true })", () => {
    const setSpy = vi.spyOn(appStore, "set");
    render(() => <AppSection />);
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(setSpy).toHaveBeenCalledWith({ startAtLogin: true });
  });
});