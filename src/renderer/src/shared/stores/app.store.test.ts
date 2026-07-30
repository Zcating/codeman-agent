
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

const { scheduleSaveMock } = vi.hoisted(() => ({
  scheduleSaveMock: vi.fn(),
}));

vi.mock("../../features/settings/lib/settings-saver", () => ({
  settingsSaver: {
    scheduleSave: scheduleSaveMock,
  },
}));

import { appStore, _resetAppStoreForTest } from "@codeman-frontend/shared/stores/app.store";

describe("appStore (ADR-0015 V1.7+ 无 debounce)", () => {
  beforeEach(async () => {
    _resetAppStoreForTest();
    mockState.calls = [];
    mockState.callArgs = [];
    mockState.resolved = undefined;
    mockState.settings = {
      providers: [],
      schemaVersion: "1.5",
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
    await Effect.runPromise(appStore.refresh());
  });

  afterEach(() => {
    _resetAppStoreForTest();
    vi.clearAllMocks();
    scheduleSaveMock.mockReset();
    mockState.rejected = undefined;
  });

  it("refresh() 返回 Effect; Effect.runPromise 加载 settings 并返回", async () => {
    const effect = appStore.refresh();
    expect(effect).toBeDefined();
    const fresh = await Effect.runPromise(effect);
    expect(fresh).toEqual(mockState.settings);
  });

  it("set() 同步更新 state, 不触发 IPC", () => {
    const result = appStore.set({ theme: "light" });
    expect(result).toBeUndefined();
    expect(appStore.state.value.theme).toBe("light");
    expect(mockState.calls.filter((c) => c === "updateSettings")).toHaveLength(0);
  });


  it("refreshProviderModels 写入新模型到 state 并返回", async () => {
    mockState.settings = {
      ...mockState.settings,
      providers: [
        {
          id: "minimax",
          label: "MiniMax",
          enabled: true,
          apiKey: "",
          llm: {
            defaultModel: "old-model",
            baseUrl: "https://api.example.com/v1",
            apiType: "anthropic-messages" as const,
            models: [{ id: "old-model", label: "Old", deprecated: false, thinking: false }],
            modelsEndpoint: "https://api.example.com/v1/models",
          },
        },
      ],
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

  it("refreshProviderModels: defaultModel 不在新列表时自动回退到第一个", async () => {
    mockState.settings = {
      ...mockState.settings,
      providers: [
        {
          id: "minimax",
          label: "MiniMax",
          enabled: true,
          apiKey: "",
          llm: {
            defaultModel: "old-model",
            baseUrl: "https://api.example.com/v1",
            apiType: "anthropic-messages" as const,
            models: [{ id: "old-model", label: "Old", deprecated: false, thinking: false }],
            modelsEndpoint: "https://api.example.com/v1/models",
          },
        },
      ],
    };
    await Effect.runPromise(appStore.refresh());
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "new-model-X", name: "New X" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await Effect.runPromiseExit(appStore.refreshProviderModels("minimax"));
    const provider = (appStore.state.value as any).providers.find((p: any) => p.id === "minimax");
    expect(provider.llm.defaultModel).toBe("new-model-X");
    fetchSpy.mockRestore();
  });

  it("refreshProviderModels: defaultModel 已在新列表时保留", async () => {
    mockState.settings = {
      ...mockState.settings,
      providers: [
        {
          id: "minimax",
          label: "MiniMax",
          enabled: true,
          apiKey: "",
          llm: {
            defaultModel: "old-model",
            baseUrl: "https://api.example.com/v1",
            apiType: "anthropic-messages" as const,
            models: [{ id: "old-model", label: "Old", deprecated: false, thinking: false }],
            modelsEndpoint: "https://api.example.com/v1/models",
          },
        },
      ],
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
    expect(provider.llm.defaultModel).toBe("kept-model");
    fetchSpy.mockRestore();
  });

  it("refreshProviderModels: API 返回无 context_window 的模型时回填 contextWindow", async () => {
    mockState.settings = {
      ...mockState.settings,
      providers: [
        {
          id: "minimax",
          label: "MiniMax",
          enabled: true,
          apiKey: "",
          llm: {
            defaultModel: "MiniMax-M2.7-highspeed",
            baseUrl: "https://api.minimaxi.com/anthropic",
            apiType: "anthropic-messages" as const,
            contextWindow: 200_000,
            models: [],
            modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
          },
        },
      ],
    };
    await Effect.runPromise(appStore.refresh());
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "MiniMax-M2.7-highspeed", object: "model", created: 123, owned_by: "minimax" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const exit = await Effect.runPromiseExit(appStore.refreshProviderModels("minimax"));
    expect(exit._tag).toBe("Success");
    if (exit._tag === "Success") {
      expect(exit.value[0].contextWindow).toBe(200_000);
    }
    fetchSpy.mockRestore();
  });

  it("refreshProviderModels: 未知 provider 报错 (AppError)", async () => {
    mockState.settings = {
      ...mockState.settings,
      providers: [
        {
          id: "minimax",
          label: "MiniMax",
          enabled: true,
          apiKey: "",
          llm: {
            defaultModel: "x",
            baseUrl: "https://api.example.com/v1",
            apiType: "anthropic-messages" as const,
            models: [],
            modelsEndpoint: "https://api.example.com/v1/models",
          },
        },
      ],
    };
    await Effect.runPromise(appStore.refresh());
    const exit = await Effect.runPromiseExit(appStore.refreshProviderModels("nonexistent"));
    expect(exit._tag).toBe("Failure");
  });
  it("forceFlush() 返回 Effect; Effect.runPromise 立即触发 IPC", async () => {
    appStore.set({ theme: "light" });
    const effect = appStore.forceFlush();
    expect(effect).toBeDefined();
    await Effect.runPromise(effect);
    expect(mockState.calls.filter((c) => c === "updateSettings")).toHaveLength(1);
  });

  it("forceFlush() invoke 拒绝时失败 → Effect.exit Failure with AppError", async () => {
    mockState.rejected = new Error("IPC boom");
    const exit = await Effect.runPromiseExit(appStore.forceFlush());
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause).toBeDefined();
    }
  });

  it("refresh() invoke 拒绝时失败 → Effect.exit Failure with AppError", async () => {
    mockState.rejected = new Error("getSettings IPC failed");
    const exit = await Effect.runPromiseExit(appStore.refresh());
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause).toBeDefined();
    }
  });

  it("refresh() 拒绝时保留错误形状 (AppError vs Unknown)", async () => {
    const err = new Error("backend error") as Error & { kind: string };
    err.kind = "IPC";
    mockState.rejected = err;
    const exit = await Effect.runPromiseExit(appStore.refresh());
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const cause = (exit.cause as any).error ?? exit.cause;
      expect(cause).toBeDefined();
    }
  });

  it("refreshProviderModels 空 models 数组 → defaultModel = ''", async () => {
    mockState.settings = {
      ...mockState.settings,
      providers: [
        {
          id: "minimax",
          label: "MiniMax",
          enabled: true,
          apiKey: "",
          llm: {
            defaultModel: "some-model",
            baseUrl: "https://api.example.com/v1",
            apiType: "anthropic-messages" as const,
            models: [{ id: "some-model", label: "Some", deprecated: false, thinking: false }],
            modelsEndpoint: "https://api.example.com/v1/models",
          },
        },
      ],
    };
    await Effect.runPromise(appStore.refresh());
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const exit = await Effect.runPromiseExit(appStore.refreshProviderModels("minimax"));
    expect(exit._tag).toBe("Success");
    const provider = (appStore.state.value as any).providers.find((p: any) => p.id === "minimax");
    expect(provider.llm.defaultModel).toBe("");
    fetchSpy.mockRestore();
  });

  it("pickWorkspacePath() 返回解析后的路径字符串", async () => {
    mockState.resolved = "/selected/workspace/path";
    const exit = await Effect.runPromiseExit(appStore.pickWorkspacePath());
    expect(exit._tag).toBe("Success");
    if (exit._tag === "Success") {
      expect(exit.value).toBe("/selected/workspace/path");
    }
    expect(mockState.invokeCalls.some((c) => c.name === "pickWorkspacePath")).toBe(true);
  });

  it("pickWorkspacePath() 用户取消时返回 null (resolved = null)", async () => {
    mockState.resolved = null;
    const exit = await Effect.runPromiseExit(appStore.pickWorkspacePath());
    expect(exit._tag).toBe("Success");
    if (exit._tag === "Success") {
      expect(exit.value).toBeNull();
    }
  });

  it("pickWorkspacePath() invoke 拒绝时失败 → Effect.exit Failure", async () => {
    mockState.rejected = new Error("pick cancelled or failed");
    const exit = await Effect.runPromiseExit(appStore.pickWorkspacePath());
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause).toBeDefined();
    }
  });

  it("deleteProvider(id) 从 state 中移除 provider", async () => {
    mockState.settings = {
      ...mockState.settings,
      providers: [
        {
          id: "minimax",
          label: "MiniMax",
          enabled: true,
          apiKey: "",
          llm: {
            defaultModel: "MiniMax-M2.5-highspeed",
            baseUrl: "https://api.minimaxi.com/anthropic",
            apiType: "anthropic-messages",
            models: [],
            modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
          },
        },
        {
          id: "deepseek",
          label: "DeepSeek",
          enabled: true,
          apiKey: "",
          llm: {
            defaultModel: "deepseek-chat",
            baseUrl: "https://api.deepseek.com/anthropic",
            apiType: "anthropic-messages",
            models: [],
            modelsEndpoint: "https://api.deepseek.com/models",
          },
        },
      ],
    };
    await Effect.runPromise(appStore.refresh());
    const exit = await Effect.runPromiseExit(appStore.deleteProvider("minimax"));
    expect(exit._tag).toBe("Success");
    const providers = (appStore.state.value as any).providers;
    expect(providers.length).toBe(1);
    expect(providers[0].id).toBe("deepseek");
  });

  it("deleteProvider(id) 未知 id → providers 不变", async () => {
    mockState.settings = {
      ...mockState.settings,
      providers: [
        {
          id: "deepseek",
          label: "DeepSeek",
          enabled: true,
          apiKey: "",
          llm: {
            defaultModel: "deepseek-chat",
            baseUrl: "https://api.deepseek.com/anthropic",
            apiType: "anthropic-messages",
            models: [],
            modelsEndpoint: "https://api.deepseek.com/models",
          },
        },
      ],
    };
    await Effect.runPromise(appStore.refresh());
    const exit = await Effect.runPromiseExit(appStore.deleteProvider("nonexistent"));
    expect(exit._tag).toBe("Success");
    const providers = (appStore.state.value as any).providers;
    expect(providers.length).toBe(1);
    expect(providers[0].id).toBe("deepseek");
  });

  it("clearAllHistory() 调用 clearAllHistory IPC", async () => {
    const exit = await Effect.runPromiseExit(appStore.clearAllHistory());
    expect(exit._tag).toBe("Success");
    expect(mockState.calls.some((c) => c === "clearAllHistory")).toBe(true);
  });

  it("clearAllHistory() IPC 拒绝时失败 → Effect.exit Failure", async () => {
    mockState.rejected = new Error("clearAllHistory failed");
    const exit = await Effect.runPromiseExit(appStore.clearAllHistory());
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause).toBeDefined();
    }
  });

  it("deleteProvider(id) 客户端变更先于 IPC 调用 — 即使 IPC 报错 provider 也被移除", async () => {
    mockState.settings = {
      ...mockState.settings,
      providers: [
        {
          id: "minimax",
          label: "MiniMax",
          enabled: true,
          apiKey: "",
          llm: {
            defaultModel: "MiniMax-M2.5-highspeed",
            baseUrl: "https://api.minimaxi.com/anthropic",
            apiType: "anthropic-messages",
            models: [],
            modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
          },
        },
      ],
    };
    await Effect.runPromise(appStore.refresh());
    expect((appStore.state.value as any).providers.length).toBe(1);
    mockState.rejected = new Error("delete IPC failed");
    const exit = await Effect.runPromiseExit(appStore.deleteProvider("minimax"));
    expect(exit._tag).toBe("Success");
    const providers = (appStore.state.value as any).providers;
    expect(providers.length).toBe(0); 
  });


});
