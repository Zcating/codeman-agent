import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Effect } from "effect";
import { mockState } from "../../../__mocks__/@tauri-apps/api/core";

// Mock solid-js/store before importing app.store (same as app.store.test.ts)
// 必须支持 Solid setStore 的两种签名：
//   - 1-arg: setStore(valueOrFn) — 整体替换
//   - 2-arg: setStore("path", valueOrFn) — 路径更新（app.store.ts 用的就是这种）
// 不在 vitest.setup.ts 全局注册:见 settings.test.tsx 同位置注释。
vi.mock("solid-js/store", () => {
  let store: { value: unknown } = { value: null };
  const setStore = vi.fn((...args: unknown[]) => {
    // 取正确的 updater 参数：2-arg 时是 args[1]，1-arg 时是 args[0]
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
import {
  getDefaultSystemPrompt,
  getUserCanEdit,
  updateDefaultSystemPrompt,
  resolveSystemPromptForConversation,
} from "./system-prompt";

describe("system-prompt (ADR-0015)", () => {
  beforeEach(async () => {
    _resetAppStoreForTest();
    mockState.settings = {
      ...mockState.settings,
      system_prompt: { default: "You are a helpful assistant.", user_can_edit: true },
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

  it("resolveSystemPromptForConversation prefers conversation.system_prompt", () => {
    const conv = {
      id: "c1",
      title: "T",
      system_prompt: "Conv prompt",
      created_at: 0,
      updated_at: 0,
      archived_at: null,
    };
    expect(resolveSystemPromptForConversation(conv)).toBe("Conv prompt");
  });

  it("resolveSystemPromptForConversation falls back to settings default", () => {
    const conv = {
      id: "c1",
      title: "T",
      system_prompt: null,
      created_at: 0,
      updated_at: 0,
      archived_at: null,
    };
    expect(resolveSystemPromptForConversation(conv)).toBe("You are a helpful assistant.");
  });
});
