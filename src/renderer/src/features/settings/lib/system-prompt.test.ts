import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Effect } from "effect";
import { mockState } from "@codeman-frontend/__mocks__/ipc-mock";

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
import {
  getDefaultSystemPrompt,
  getUserCanEdit,
  updateDefaultSystemPrompt,
  resolveSystemPromptForConversation,
} from "@codeman-frontend/features/settings/lib/system-prompt";

describe("system-prompt (ADR-0015)", () => {
  beforeEach(async () => {
    _resetAppStoreForTest();
    mockState.settings = {
      ...mockState.settings,
      systemPrompt: { default: "You are a helpful assistant.", userCanEdit: true },
    };
    await Effect.runPromise(appStore.refresh());
  });

  afterEach(() => {
    _resetAppStoreForTest();
  });

  it("getDefaultSystemPrompt returns settings default", () => {
    expect(getDefaultSystemPrompt()).toBe("You are a helpful assistant.");
  });

  it("getUserCanEdit returns settings flag", () => {
    expect(getUserCanEdit()).toBe(true);
  });

  it("updateDefaultSystemPrompt writes via appStore", () => {
    updateDefaultSystemPrompt("New prompt");
    expect(getDefaultSystemPrompt()).toBe("New prompt");
  });

  it("resolveSystemPromptForConversation prefers conversation.systemPrompt", () => {
    const conv = {
      id: "c1",
      title: "T",
      systemPrompt: "Conv prompt",
      workspaceId: "",
      createdAt: 0,
      updatedAt: 0,
      archivedAt: null,
    };
    expect(resolveSystemPromptForConversation(conv)).toBe("Conv prompt");
  });

  it("resolveSystemPromptForConversation falls back to settings default", () => {
    const conv = {
      id: "c1",
      title: "T",
      systemPrompt: null,
      workspaceId: "",
      createdAt: 0,
      updatedAt: 0,
      archivedAt: null,
    };
    expect(resolveSystemPromptForConversation(conv)).toBe("You are a helpful assistant.");
  });
});
