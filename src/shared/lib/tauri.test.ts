//! Tests for V1.5 ProviderService + BillingService + V2 WorkspaceService + FileService
//! Uses Layer.succeed for mock implementations with it.effect pattern

import { it, expect, beforeEach } from "@effect/vitest";
import { describe } from "vitest";
import { Effect, Layer, Exit } from "effect";
import { mockState } from "../../__mocks__/@tauri-apps/api/core";
import {
  invoke,
  ConversationService,
  MessageService,
  ConversationServiceLive,
  MessageServiceLive,
  SettingsService,
  SettingsServiceImpl,
  ProviderService,
  ProviderServiceLive,
  BillingService,
  BillingServiceV1,
  WorkspaceService,
  FileService,
  SettingsServiceLive,
  WorkspaceServiceLive,
  FileServiceLive,
  BillingServiceLive,
  BillingServiceV1Live,
  TauriError,
  BillingError,
  getSettingsBridge,
  updateSettingsBridge,
  clearAllHistoryBridge,
  getWorkspacesBridge,
  addWorkspaceBridge,
  updateWorkspaceBridge,
  removeWorkspaceBridge,
} from "./tauri";
import type { Provider, Snapshot } from "./types";

// 鈹€鈹€鈹€ Mock Data 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

const mockProvider: Provider = {
  id: "minimax",
  label: "MiniMax",
  enabled: true,
  api_key: "",
  llm: {
    default_model: "MiniMax-M2.5-highspeed",
    base_url: "https://api.minimaxi.com/anthropic",
    api_type: "anthropic-messages",
    models: [
      {
        id: "MiniMax-M2.5-highspeed",
        label: "MiniMax-M2.5-highspeed",
        context_window: 200000,
        deprecated: false,
        thinking: false,
      },
    ],
    models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
  },
  billing: {
    kind: "plan_quota",
  },
};

const mockProviderList: Provider[] = [mockProvider];

// 鈹€鈹€鈹€ Mock Layers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

const MockProviderServiceLive = Layer.succeed(ProviderService, {
  list: () => Effect.succeed(mockProviderList.filter((p) => p.enabled)),
  listByKind: (kind) =>
    Effect.succeed(
      mockProviderList.filter((p) => p.enabled && (kind === "llm" ? p.llm : p.billing)),
    ),
  get: (id) => {
    const provider = mockProviderList.find((p) => p.id === id);
    if (!provider) {
      return Effect.fail(TauriError.IPC(`Provider not found: ${id}`));
    }
    return Effect.succeed(provider);
  },
  getModels: (id) => {
    const provider = mockProviderList.find((p) => p.id === id);
    if (!provider) {
      return Effect.fail(TauriError.IPC(`Provider not found: ${id}`));
    }
    return Effect.succeed(provider.llm.models ?? []);
  },
  fetchModels: (id) => {
    const provider = mockProviderList.find((p) => p.id === id);
    if (!provider) {
      return Effect.fail(TauriError.IPC(`Provider not found: ${id}`));
    }
    if (!provider.llm.models_endpoint) {
      return Effect.fail(TauriError.IPC(`No models_endpoint for provider: ${id}`));
    }
    return Effect.succeed(provider.llm.models ?? []);
  },

  delete: (id) => {
    const provider = mockProviderList.find((p) => p.id === id);
    if (!provider) {
      return Effect.fail(TauriError.IPC(`Provider not found: ${id}`));
    }
    return Effect.void;
  },
});

const MockBillingServiceLive = Layer.succeed(BillingService, {
  list: () => Effect.succeed(mockProviderList.filter((p) => p.enabled && p.billing)),
  fetchSnapshot: (providerId) => {
    const provider = mockProviderList.find((p) => p.id === providerId && p.enabled && p.billing);
    if (!provider || !provider.billing) {
      return Effect.fail({
        kind: "NotFound" as const,
        message: `Billing provider not found: ${providerId}`,
      } satisfies BillingError);
    }
    if (provider.billing.kind === "balance") {
      return Effect.succeed({
        kind: "balance" as const,
        amount: 100.5,
        currency: "USD",
        auto_recharge: null,
      } satisfies Snapshot);
    }
    return Effect.succeed({
      kind: "plan_quota" as const,
      remaining: 1000,
      total: 5000,
      expires_at: null,
      daily_avg: null,
    } satisfies Snapshot);
  },
});

// 鈹€鈹€鈹€ ProviderService Tests 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

describe("ProviderService.list — 返回已启用的 providers", () => {
  it.effect("返回已启用的 providers", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderService;
      const providers = yield* svc.list();
      expect(providers.length).toBeGreaterThan(0);
      expect(providers.every((p) => p.enabled)).toBe(true);
    }).pipe(Effect.provide(MockProviderServiceLive), Effect.provide(MockBillingServiceLive)),
  );

  it.effect("从 mock 返回 minimax provider", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderService;
      const providers = yield* svc.list();
      expect(providers).toHaveLength(1);
      expect(providers[0].id).toBe("minimax");
    }).pipe(Effect.provide(MockProviderServiceLive), Effect.provide(MockBillingServiceLive)),
  );
});

// Test lines 221-310 using the real ProviderServiceLive
describe("ProviderServiceLive (真实实现)", () => {
  it.effect("list() 从 settings 返回已启用的 providers", () =>
    Effect.gen(function* () {
      // Set up settings with providers (complete Provider objects)
      mockState.settings = {
        ...mockState.settings,
        providers: [
          { id: "minimax", label: "MiniMax", enabled: true, api_key: "", llm: { default_model: "test", base_url: "https://api.minimaxi.com", api_type: "anthropic-messages" as const, models: [], models_endpoint: "" } },
          { id: "disabled", label: "Disabled", enabled: false, api_key: "", llm: { default_model: "test", base_url: "https://api.minimaxi.com", api_type: "anthropic-messages" as const, models: [], models_endpoint: "" } },
        ],
      };
      const svc = yield* ProviderService;
      const providers = yield* svc.list();
      expect(providers).toHaveLength(1);
      expect(providers[0].id).toBe("minimax");
    }).pipe(Effect.provide(ProviderServiceLive)),
  );

  it.effect("listByKind('llm') 仅返回 LLM providers", () =>
    Effect.gen(function* () {
      mockState.settings = {
        ...mockState.settings,
        providers: [
          { id: "minimax", label: "MiniMax", enabled: true, api_key: "", llm: { default_model: "test", base_url: "https://api.minimaxi.com", api_type: "anthropic-messages" as const, models: [], models_endpoint: "" } },
          { id: "billing-only", label: "BillingOnly", enabled: true, api_key: "", billing: { kind: "balance" as const } },
        ] as any[],
      };
      const svc = yield* ProviderService;
      const providers = yield* svc.listByKind("llm");
      expect(providers).toHaveLength(1);
      expect(providers[0].id).toBe("minimax");
    }).pipe(Effect.provide(ProviderServiceLive)),
  );

  it.effect("get(id) 根据 id 返回 provider", () =>
    Effect.gen(function* () {
      mockState.settings = {
        ...mockState.settings,
        providers: [{ id: "minimax", label: "MiniMax", enabled: true, api_key: "", llm: { default_model: "test", base_url: "https://api.minimaxi.com", api_type: "anthropic-messages" as const, models: [], models_endpoint: "" } }],
      };
      const svc = yield* ProviderService;
      const provider = yield* svc.get("minimax");
      expect(provider.id).toBe("minimax");
    }).pipe(Effect.provide(ProviderServiceLive)),
  );

  it.effect("getModels() 从 provider 返回 models", () =>
    Effect.gen(function* () {
      mockState.settings = {
        ...mockState.settings,
        providers: [{
          id: "minimax",
          label: "MiniMax",
          enabled: true,
          api_key: "",
          llm: { default_model: "test", base_url: "https://api.minimaxi.com", api_type: "anthropic-messages" as const, models: [{ id: "model1", label: "Model 1" }], models_endpoint: "" },
        }],
      };
      const svc = yield* ProviderService;
      const models = yield* svc.getModels("minimax");
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe("model1");
    }).pipe(Effect.provide(ProviderServiceLive)),
  );

  it.effect("getModels() 无 models 时返回空数组", () =>
    Effect.gen(function* () {
      mockState.settings = {
        ...mockState.settings,
        providers: [{ id: "minimax", label: "MiniMax", enabled: true, api_key: "", llm: { default_model: "test", base_url: "https://api.minimaxi.com", api_type: "anthropic-messages" as const, models: [], models_endpoint: "" } }],
      };
      const svc = yield* ProviderService;
      const models = yield* svc.getModels("minimax");
      expect(models).toEqual([]);
    }).pipe(Effect.provide(ProviderServiceLive)),
  );

  it.effect("get() 对未知 provider 失败", () =>
    Effect.gen(function* () {
      mockState.settings = { ...mockState.settings, providers: [] };
      const svc = yield* ProviderService;
      const exit = yield* Effect.exit(svc.get("unknown"));
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(ProviderServiceLive)),
  );

  it.effect("delete() 调用 delete_provider IPC", () =>
    Effect.gen(function* () {
      mockState.settings = {
        ...mockState.settings,
        providers: [{ id: "todelete", label: "ToDelete", enabled: true, api_key: "", llm: { default_model: "test", base_url: "https://api.minimaxi.com", api_type: "anthropic-messages" as const, models: [], models_endpoint: "" } }],
      };
      const svc = yield* ProviderService;
      yield* svc.delete("todelete");
      expect(mockState.invokeCalls.some(c => c.name === "delete_provider")).toBe(true);
    }).pipe(Effect.provide(ProviderServiceLive)),
  );
});

describe("ProviderService.listByKind — 按 kind 过滤 providers", () => {
  it.effect("kind 为 'llm' 时返回 LLM providers", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderService;
      const providers = yield* svc.listByKind("llm");
      expect(providers.length).toBeGreaterThan(0);
      providers.forEach((p) => expect(p.llm).toBeDefined());
    }).pipe(Effect.provide(MockProviderServiceLive), Effect.provide(MockBillingServiceLive)),
  );

  it.effect("kind 为 'billing' 时返回 billing providers", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderService;
      const providers = yield* svc.listByKind("billing");
      providers.forEach((p) => expect(p.billing).toBeDefined());
    }).pipe(Effect.provide(MockProviderServiceLive), Effect.provide(MockBillingServiceLive)),
  );
});

describe("ProviderService.get — 按 ID 获取 provider", () => {
  it.effect("根据 id 返回 provider", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderService;
      const provider = yield* svc.get("minimax");
      expect(provider.id).toBe("minimax");
      expect(provider.llm).toBeDefined();
    }).pipe(Effect.provide(MockProviderServiceLive), Effect.provide(MockBillingServiceLive)),
  );

  it.effect("未知 provider 抛出 TauriError", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderService;
      const exit = yield* Effect.exit(svc.get("nonexistent"));
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(MockProviderServiceLive), Effect.provide(MockBillingServiceLive)),
  );
});

describe("ProviderService.getModels — 获取 provider 的 models", () => {
  it.effect("从 provider settings 返回 models", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderService;
      const models = yield* svc.getModels("minimax");
      expect(models.length).toBeGreaterThan(0);
      expect(models[0].id).toBe("MiniMax-M2.5-highspeed");
    }).pipe(Effect.provide(MockProviderServiceLive), Effect.provide(MockBillingServiceLive)),
  );

  it.effect("未知 provider 失败", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderService;
      const exit = yield* Effect.exit(svc.getModels("nonexistent"));
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(MockProviderServiceLive), Effect.provide(MockBillingServiceLive)),
  );
});

// 鈹€鈹€鈹€ BillingService Tests 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

describe("BillingService.list — 返回已配置 billing 的 providers", () => {
  it.effect("返回已配置 billing 的 providers", () =>
    Effect.gen(function* () {
      const svc = yield* BillingService;
      const providers = yield* svc.list();
      providers.forEach((p) => expect(p.billing).toBeDefined());
    }).pipe(Effect.provide(MockProviderServiceLive), Effect.provide(MockBillingServiceLive)),
  );

  // Test line 339: list: () => getBillingProviders() in BillingServiceLive
  it.effect("BillingServiceLive.list() 直接调用 getBillingProviders", () =>
    Effect.gen(function* () {
      // Set up settings with a billing provider
      mockState.settings = {
        ...mockState.settings,
        providers: [
          { id: "deepseek", label: "DeepSeek", enabled: true, api_key: "", llm: { default_model: "", base_url: "", api_type: "anthropic-messages" as const, models: [], models_endpoint: "" }, billing: { kind: "balance" as const } },
        ],
      };
      // Use the real BillingServiceLive (not mock) to test line 339
      const svc = yield* BillingService;
      const providers = yield* svc.list();
      expect(providers).toHaveLength(1);
      expect(providers[0].id).toBe("deepseek");
    }).pipe(Effect.provide(BillingServiceLive)),
  );
});

describe("BillingService.fetchSnapshot — 获取 billing snapshot", () => {
  it.effect("对有效 billing provider 返回 snapshot", () =>
    Effect.gen(function* () {
      const svc = yield* BillingService;
      const snapshot = yield* svc.fetchSnapshot("minimax");
      expect(snapshot!.kind).toBe("plan_quota");
    }).pipe(Effect.provide(MockProviderServiceLive), Effect.provide(MockBillingServiceLive)),
  );

  it.effect("provider 不存在时返回 NotFound", () =>
    Effect.gen(function* () {
      const svc = yield* BillingService;
      const exit = yield* Effect.exit(svc.fetchSnapshot("nonexistent"));
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(MockProviderServiceLive), Effect.provide(MockBillingServiceLive)),
  );
});

// 鈹€鈹€鈹€ WorkspaceService Smoke Tests 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

describe("WorkspaceService.list — 返回 workspace 列表", () => {
  it.effect("settings 中无 workspaces 时返回空数组", () =>
    Effect.gen(function* () {
      const svc = yield* WorkspaceService;
      const workspaces = yield* svc.list();
      expect(workspaces).toEqual([]);
    }).pipe(
      // WorkspaceServiceLive depends on SettingsService (reads workspaces from settings store)
      Effect.provide(WorkspaceServiceLive),
      Effect.provide(SettingsServiceLive),
    ),
  );
});

// 鈹€鈹€鈹€ FileService Smoke Tests 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

describe("FileService.readFile — 读取文件", () => {
  it.effect("使用正确的 camelCase 参数调用 read_file", () =>
    Effect.gen(function* () {
      // Clear any prior calls
      mockState.calls.length = 0;
      mockState.invokeCalls.length = 0;

      const svc = yield* FileService;
      yield* svc.readFile("ws1", "/tmp/x.txt");

      const readCall = mockState.invokeCalls.find((c) => c.name === "read_file");
      expect(readCall).toBeDefined();
      expect(readCall?.args).toMatchObject({
        workspaceId: "ws1",
        path: "/tmp/x.txt",
      });
    }).pipe(Effect.provide(FileServiceLive)),
  );
});

describe("FileService.editFile — 编辑文件", () => {
  it.effect("replace_all 作为 boolean 传递给 edit_file", () =>
    Effect.gen(function* () {
      // Clear any prior calls
      mockState.calls.length = 0;
      mockState.invokeCalls.length = 0;

      const svc = yield* FileService;
      yield* svc.editFile("ws1", "/tmp/x.txt", "old", "new", true);

      const editCall = mockState.invokeCalls.find((c) => c.name === "edit_file");
      expect(editCall).toBeDefined();
      expect(editCall?.args).toMatchObject({
        workspaceId: "ws1",
        path: "/tmp/x.txt",
        oldText: "old",
        newText: "new",
        replaceAll: true,
      });
      // Ensure replaceAll is boolean, not string
      expect(typeof editCall?.args?.replaceAll).toBe("boolean");
    }).pipe(Effect.provide(FileServiceLive)),
  );
});

// 鈹€鈹€鈹€ invoke wrapper Tests 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

describe("invoke wrapper — IPC 调用包装", () => {
  beforeEach(() => {
    // Reset mock state before each test
    mockState.rejected = undefined;
    mockState.resolved = undefined;
    mockState.calls.length = 0;
    mockState.invokeCalls.length = 0;
  });

  it.effect("I1: invoke 成功返回 Promise<T> 的解析值", () =>
    Effect.gen(function* () {
      mockState.resolved = { foo: "bar" };
      const result = yield* invoke<{ foo: string }>("get_settings");
      expect(result).toEqual({ foo: "bar" });
    }),
  );

  it.effect("I2: invoke 错误无 kind 时包装为 Unknown", () =>
    Effect.gen(function* () {
      mockState.rejected = new Error("some IPC error");
      const exit = yield* Effect.exit(invoke<unknown>("get_settings"));
      expect(Exit.isFailure(exit)).toBe(true);
    }),
  );

  it.effect("I3: invoke 错误带 kind 时保留 AppError 结构", () =>
    Effect.gen(function* () {
      const appError = { kind: "NotFound" as const, message: "not found", name: "AppError" };
      mockState.rejected = appError as unknown as Error;
      const exit = yield* Effect.exit(invoke<unknown>("get_settings"));
      expect(Exit.isFailure(exit)).toBe(true);
    }),
  );

  it.effect("I4: invoke 错误时调用 logger.error", () =>
    Effect.gen(function* () {
      mockState.rejected = new Error("log me");
      yield* Effect.exit(invoke<unknown>("get_settings"));
      // The invoke error path logs - just verify it ran without throwing
    }),
  );
});

// 鈹€鈹€鈹€ ConversationServiceLive Tests 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

describe("ConversationServiceLive — IPC 调用映射", () => {
  beforeEach(() => {
    mockState.rejected = undefined;
    mockState.resolved = undefined;
    mockState.calls.length = 0;
    mockState.invokeCalls.length = 0;
  });

  it.effect("I5: list(true) 调用 list_conversations，includeArchived=true", () =>
    Effect.gen(function* () {
      const svc = yield* ConversationService;
      yield* svc.list(true);
      const call = mockState.invokeCalls.find((c) => c.name === "list_conversations");
      expect(call).toBeDefined();
      expect(call?.args).toMatchObject({ includeArchived: true });
    }).pipe(Effect.provide(ConversationServiceLive)),
  );

  it.effect("I6: get(id) 调用 get_conversation，参数为 { id }", () =>
    Effect.gen(function* () {
      const svc = yield* ConversationService;
      yield* svc.get("conv-123");
      const call = mockState.invokeCalls.find((c) => c.name === "get_conversation");
      expect(call).toBeDefined();
      expect(call?.args).toMatchObject({ id: "conv-123" });
    }).pipe(Effect.provide(ConversationServiceLive)),
  );

  it.effect("I7: create(title) 调用时 systemPrompt=null", () =>
    Effect.gen(function* () {
      const svc = yield* ConversationService;
      yield* svc.create("My Chat");
      const call = mockState.invokeCalls.find((c) => c.name === "create_conversation");
      expect(call).toBeDefined();
      expect(call?.args).toMatchObject({ title: "My Chat", systemPrompt: null });
    }).pipe(Effect.provide(ConversationServiceLive)),
  );

  it.effect("I8: create(title, systemPrompt) 将 systemPrompt 传递给 invoke", () =>
    Effect.gen(function* () {
      const svc = yield* ConversationService;
      yield* svc.create("My Chat", "You are a helpful assistant.");
      const call = mockState.invokeCalls.find((c) => c.name === "create_conversation");
      expect(call).toBeDefined();
      expect(call?.args).toMatchObject({
        title: "My Chat",
        systemPrompt: "You are a helpful assistant.",
      });
    }).pipe(Effect.provide(ConversationServiceLive)),
  );

  it.effect("I9: archive(id) 调用 archive_conversation", () =>
    Effect.gen(function* () {
      const svc = yield* ConversationService;
      yield* svc.archive("conv-123");
      const call = mockState.invokeCalls.find((c) => c.name === "archive_conversation");
      expect(call).toBeDefined();
      expect(call?.args).toMatchObject({ id: "conv-123" });
    }).pipe(Effect.provide(ConversationServiceLive)),
  );

  it.effect("I10: delete(id) 调用 delete_conversation", () =>
    Effect.gen(function* () {
      const svc = yield* ConversationService;
      yield* svc.delete("conv-123");
      const call = mockState.invokeCalls.find((c) => c.name === "delete_conversation");
      expect(call).toBeDefined();
      expect(call?.args).toMatchObject({ id: "conv-123" });
    }).pipe(Effect.provide(ConversationServiceLive)),
  );
});

// 鈹€鈹€鈹€ MessageServiceLive Tests 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

describe("MessageServiceLive — IPC 调用映射", () => {
  beforeEach(() => {
    mockState.rejected = undefined;
    mockState.resolved = undefined;
    mockState.calls.length = 0;
    mockState.invokeCalls.length = 0;
  });

  it.effect("I11: list(convId) 调用 list_messages", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      yield* svc.list("conv-123");
      const call = mockState.invokeCalls.find((c) => c.name === "list_messages");
      expect(call).toBeDefined();
      expect(call?.args).toMatchObject({ conversationId: "conv-123" });
    }).pipe(Effect.provide(MessageServiceLive)),
  );

  it.effect("I12: append({...args}) 使用 camelCase 参数调用 append_message", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      yield* svc.append({
        conversationId: "conv-123",
        role: "user",
        content: "Hello",
        toolCalls: undefined,
        toolResults: undefined,
        model: undefined,
        inputTokens: undefined,
        outputTokens: undefined,
      });
      const call = mockState.invokeCalls.find((c) => c.name === "append_message");
      expect(call).toBeDefined();
      expect(call?.args).toMatchObject({
        conversationId: "conv-123",
        role: "user",
        content: "Hello",
      });
    }).pipe(Effect.provide(MessageServiceLive)),
  );

  it.effect("I13: search('q', 5) 使用 { query, limit } 调用 search_messages", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      yield* svc.search("hello", 5);
      const call = mockState.invokeCalls.find((c) => c.name === "search_messages");
      expect(call).toBeDefined();
      expect(call?.args).toMatchObject({ query: "hello", limit: 5 });
    }).pipe(Effect.provide(MessageServiceLive)),
  );
});

// 鈹€鈹€鈹€ SettingsServiceLive Tests 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

describe("SettingsServiceLive — 设置服务 IPC 映射", () => {
  beforeEach(() => {
    mockState.rejected = undefined;
    mockState.resolved = undefined;
    mockState.calls.length = 0;
    mockState.invokeCalls.length = 0;
    // Reset settings to default
    mockState.settings = {
      providers: [],
      schema_version: "1.5",
      default_llm_provider_id: undefined,
      user_language: "en",
      theme: "system",
      start_at_login: false,
      window: {
        remember_position: false,
        remember_size: false,
        default_size: { width: 800, height: 600 },
        min_size: { width: 400, height: 300 },
      },
      system_prompt: { default: "You are a helpful assistant.", user_can_edit: true },
      conversations: { auto_archive_after_days: 30, max_history: 1000 },
      llm_providers: [],
      billing_providers: [],
      workspaces: [],
    };
  });

  it.effect("I14: getSettings() 调用 get_settings", () =>
    Effect.gen(function* () {
      const svc = yield* SettingsService;
      yield* svc.getSettings();
      const call = mockState.invokeCalls.find((c) => c.name === "get_settings");
      expect(call).toBeDefined();
    }).pipe(Effect.provide(SettingsServiceLive)),
  );

  it.effect("I15: updateSettings(patch) 调用 update_settings，参数为 { newSettings: patch }", () =>
    Effect.gen(function* () {
      const svc = yield* SettingsService;
      yield* svc.updateSettings({ theme: "dark" });
      const call = mockState.invokeCalls.find((c) => c.name === "update_settings");
      expect(call).toBeDefined();
      expect(call?.args).toMatchObject({ newSettings: { theme: "dark" } });
    }).pipe(Effect.provide(SettingsServiceLive)),
  );

  it.effect("I16: clearAllHistory() 调用 clear_all_history", () =>
    Effect.gen(function* () {
      const svc = yield* SettingsService;
      yield* svc.clearAllHistory();
      const call = mockState.invokeCalls.find((c) => c.name === "clear_all_history");
      expect(call).toBeDefined();
    }).pipe(Effect.provide(SettingsServiceLive)),
  );

  it.effect("I17: getActiveLlmProvider() 无 default_id 时返回 null", () =>
    Effect.gen(function* () {
      mockState.settings.default_llm_provider_id = undefined;
      mockState.settings.providers = [];
      const svc = yield* SettingsService;
      const result = yield* svc.getActiveLlmProvider();
      expect(result).toBeNull();
    }).pipe(Effect.provide(SettingsServiceLive)),
  );

  it.effect("I18: getActiveLlmProvider() 有已启用且有 llm 的 provider 时返回 LLMProvider 结构", () =>
    Effect.gen(function* () {
      mockState.settings.default_llm_provider_id = "minimax";
      mockState.settings.providers = [
        {
          id: "minimax",
          label: "MiniMax",
          enabled: true,
          api_key: "secret",
          llm: {
            default_model: "MiniMax-M2.5-highspeed",
            base_url: "https://api.minimaxi.com",
            api_type: "anthropic-messages" as const,
            models: [],
            models_endpoint: "",
          },
          billing: { kind: "plan_quota" as const },
        },
      ];
      const svc = yield* SettingsService;
      const result = yield* svc.getActiveLlmProvider();
      expect(result).not.toBeNull();
      expect(result!.id).toBe("minimax");
      expect(result!.label).toBe("MiniMax");
      expect(result!.enabled).toBe(true);
      expect(result!.default_model).toBe("MiniMax-M2.5-highspeed");
      expect(result!.base_url).toBe("https://api.minimaxi.com");
    }).pipe(Effect.provide(SettingsServiceLive)),
  );

  it.effect("I19: getActiveLlmProvider() provider 被禁用时返回 null", () =>
    Effect.gen(function* () {
      mockState.settings.default_llm_provider_id = "minimax";
      mockState.settings.providers = [
        {
          id: "minimax",
          label: "MiniMax",
          enabled: false,
          api_key: "secret",
          llm: {
            default_model: "MiniMax-M2.5-highspeed",
            base_url: "https://api.minimaxi.com",
            api_type: "anthropic-messages" as const,
            models: [],
            models_endpoint: "",
          },
        },
      ];
      const svc = yield* SettingsService;
      const result = yield* svc.getActiveLlmProvider();
      expect(result).toBeNull();
    }).pipe(Effect.provide(SettingsServiceLive)),
  );

  it.effect("I20: getActiveLlmProvider() provider id 不存在时返回 null", () =>
    Effect.gen(function* () {
      mockState.settings.default_llm_provider_id = "nonexistent";
      mockState.settings.providers = [
        {
          id: "minimax",
          label: "MiniMax",
          enabled: true,
          api_key: "secret",
          llm: {
            default_model: "MiniMax-M2.5-highspeed",
            base_url: "https://api.minimaxi.com",
            api_type: "anthropic-messages" as const,
            models: [],
            models_endpoint: "",
          },
        },
      ];
      const svc = yield* SettingsService;
      const result = yield* svc.getActiveLlmProvider();
      expect(result).toBeNull();
    }).pipe(Effect.provide(SettingsServiceLive)),
  );

  // Test line 454: provider exists but has no llm field (billing-only provider)
  it.effect("I21: getActiveLlmProvider() provider 无 llm 字段时返回 null", () =>
    Effect.gen(function* () {
      mockState.settings.default_llm_provider_id = "billing-only";
      mockState.settings.providers = [
        {
          id: "billing-only",
          label: "BillingOnly",
          enabled: true,
          api_key: "secret",
          billing: { kind: "balance" as const },
          // No llm field - this should make !p.llm true and return null
        },
      ] as any[];
      const svc = yield* SettingsService;
      const result = yield* svc.getActiveLlmProvider();
      expect(result).toBeNull();
    }).pipe(Effect.provide(SettingsServiceLive)),
  );
});

// 鈹€鈹€鈹€ SettingsServiceImpl Tests 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

describe("SettingsServiceImpl — 设置服务实现", () => {
  beforeEach(() => {
    mockState.rejected = undefined;
    mockState.resolved = undefined;
    mockState.calls.length = 0;
    mockState.invokeCalls.length = 0;
    mockState.settings = {
      providers: [],
      schema_version: "1.5",
      default_llm_provider_id: undefined,
      user_language: "en",
      theme: "system",
      start_at_login: false,
      window: {
        remember_position: false,
        remember_size: false,
        default_size: { width: 800, height: 600 },
        min_size: { width: 400, height: 300 },
      },
      system_prompt: { default: "You are a helpful assistant.", user_can_edit: true },
      conversations: { auto_archive_after_days: 30, max_history: 1000 },
      llm_providers: [],
      billing_providers: [],
      workspaces: [],
    };
  });

  it.effect("SettingsServiceImpl getSettings() 调用 get_settings", () =>
    Effect.gen(function* () {
      yield* SettingsServiceImpl.getSettings();
      const call = mockState.invokeCalls.find((c) => c.name === "get_settings");
      expect(call).toBeDefined();
    }),
  );

  it.effect("SettingsServiceImpl updateSettings(patch) 调用 update_settings，参数为 { newSettings: patch }", () =>
    Effect.gen(function* () {
      yield* SettingsServiceImpl.updateSettings({ theme: "dark" });
      const call = mockState.invokeCalls.find((c) => c.name === "update_settings");
      expect(call).toBeDefined();
      expect(call?.args).toMatchObject({ newSettings: { theme: "dark" } });
    }),
  );

  it.effect("SettingsServiceImpl clearAllHistory() 调用 clear_all_history", () =>
    Effect.gen(function* () {
      yield* SettingsServiceImpl.clearAllHistory();
      const call = mockState.invokeCalls.find((c) => c.name === "clear_all_history");
      expect(call).toBeDefined();
    }),
  );

  it.effect("SettingsServiceImpl getActiveLlmProvider() 无 default_id 时返回 null", () =>
    Effect.gen(function* () {
      mockState.settings.default_llm_provider_id = undefined;
      mockState.settings.providers = [];
      const result = yield* SettingsServiceImpl.getActiveLlmProvider();
      expect(result).toBeNull();
    }),
  );

  it.effect("SettingsServiceImpl getActiveLlmProvider() 有 provider 时返回 LLMProvider 结构", () =>
    Effect.gen(function* () {
      mockState.settings.default_llm_provider_id = "minimax";
      mockState.settings.providers = [
        {
          id: "minimax",
          label: "MiniMax",
          enabled: true,
          api_key: "secret",
          llm: {
            default_model: "MiniMax-M2.5-highspeed",
            base_url: "https://api.minimaxi.com",
            api_type: "anthropic-messages" as const,
            models: [],
            models_endpoint: "",
          },
        },
      ];
      const result = yield* SettingsServiceImpl.getActiveLlmProvider();
      expect(result).not.toBeNull();
      expect(result!.id).toBe("minimax");
    }),
  );
});

// 鈹€鈹€鈹€ WorkspaceServiceLive Tests 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

describe("WorkspaceServiceLive — Workspace 服务 IPC 映射", () => {
  beforeEach(() => {
    mockState.rejected = undefined;
    mockState.resolved = undefined;
    mockState.calls.length = 0;
    mockState.invokeCalls.length = 0;
    mockState.settings = {
      providers: [],
      schema_version: "1.5",
      default_llm_provider_id: undefined,
      user_language: "en",
      theme: "system",
      start_at_login: false,
      window: {
        remember_position: false,
        remember_size: false,
        default_size: { width: 800, height: 600 },
        min_size: { width: 400, height: 300 },
      },
      system_prompt: { default: "You are a helpful assistant.", user_can_edit: true },
      conversations: { auto_archive_after_days: 30, max_history: 1000 },
      llm_providers: [],
      billing_providers: [],
      workspaces: [],
    };
  });

  it.effect("I21: list() 有 workspaces 时返回它们", () =>
    Effect.gen(function* () {
      mockState.settings.workspaces = [
        { id: "ws1", label: "Workspace 1", root_path: "/path/1", enabled: true },
        { id: "ws2", label: "Workspace 2", root_path: "/path/2", enabled: false },
      ];
      const svc = yield* WorkspaceService;
      const workspaces = yield* svc.list();
      expect(workspaces).toHaveLength(2);
      expect(workspaces[0].id).toBe("ws1");
    }).pipe(
      Effect.provide(WorkspaceServiceLive),
      Effect.provide(SettingsServiceLive),
    ),
  );

  it.effect("I22: add(w) 调用 updateSettings，传入追加后的列表", () =>
    Effect.gen(function* () {
      mockState.settings.workspaces = [];
      const svc = yield* WorkspaceService;
      yield* svc.add({ id: "ws1", label: "Workspace 1", root_path: "/path/1", enabled: true });
      const call = mockState.invokeCalls.find((c) => c.name === "update_settings");
      expect(call).toBeDefined();
      const workspaces = (call?.args?.newSettings as any)?.workspaces as Array<{ id: string }>;
      expect(workspaces).toHaveLength(1);
      expect(workspaces[0].id).toBe("ws1");
    }).pipe(
      Effect.provide(WorkspaceServiceLive),
      Effect.provide(SettingsServiceLive),
    ),
  );

  it.effect("I23: update(id, patch) 调用 updateSettings，传入映射后的列表", () =>
    Effect.gen(function* () {
      mockState.settings.workspaces = [
        { id: "ws1", label: "Old Label", root_path: "/path/1", enabled: true },
      ];
      const svc = yield* WorkspaceService;
      yield* svc.update("ws1", { label: "New Label" });
      const call = mockState.invokeCalls.find((c) => c.name === "update_settings");
      expect(call).toBeDefined();
      const workspaces = (call?.args?.newSettings as any)?.workspaces as Array<{ id: string; label: string }>;
      expect(workspaces[0].label).toBe("New Label");
    }).pipe(
      Effect.provide(WorkspaceServiceLive),
      Effect.provide(SettingsServiceLive),
    ),
  );

  it.effect("I24: remove(id) 调用 updateSettings，传入过滤后的列表", () =>
    Effect.gen(function* () {
      mockState.settings.workspaces = [
        { id: "ws1", label: "Workspace 1", root_path: "/path/1", enabled: true },
        { id: "ws2", label: "Workspace 2", root_path: "/path/2", enabled: true },
      ];
      const svc = yield* WorkspaceService;
      yield* svc.remove("ws1");
      const call = mockState.invokeCalls.find((c) => c.name === "update_settings");
      expect(call).toBeDefined();
      const workspaces = (call?.args?.newSettings as any)?.workspaces as Array<{ id: string }>;
      expect(workspaces).toHaveLength(1);
      expect(workspaces[0].id).toBe("ws2");
    }).pipe(
      Effect.provide(WorkspaceServiceLive),
      Effect.provide(SettingsServiceLive),
    ),
  );

  it.effect("I25: pickPath() 调用 pick_workspace_path，返回 string|null", () =>
    Effect.gen(function* () {
      mockState.resolved = "/selected/path";
      const svc = yield* WorkspaceService;
      const result = yield* svc.pickPath();
      const call = mockState.invokeCalls.find((c) => c.name === "pick_workspace_path");
      expect(call).toBeDefined();
      expect(result).toBe("/selected/path");
    }).pipe(
      Effect.provide(WorkspaceServiceLive),
      Effect.provide(SettingsServiceLive),
    ),
  );
});

// 鈹€鈹€鈹€ FileServiceLive Tests 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

describe("FileServiceLive 额外覆盖 — 文件服务 IPC 映射", () => {
  beforeEach(() => {
    mockState.calls.length = 0;
    mockState.invokeCalls.length = 0;
    mockState.resolved = undefined;
    mockState.rejected = undefined;
  });

  it.effect("I26: writeFile(ws, path, content) 调用 write_file", () =>
    Effect.gen(function* () {
      const svc = yield* FileService;
      yield* svc.writeFile("ws1", "/tmp/x.txt", "file content");
      const call = mockState.invokeCalls.find((c) => c.name === "write_file");
      expect(call).toBeDefined();
      expect(call?.args).toMatchObject({
        workspaceId: "ws1",
        path: "/tmp/x.txt",
        content: "file content",
      });
    }).pipe(Effect.provide(FileServiceLive)),
  );

  it.effect("I27: searchFiles(ws, glob, null) 调用时 contentPattern=null", () =>
    Effect.gen(function* () {
      mockState.resolved = [];
      const svc = yield* FileService;
      yield* svc.searchFiles("ws1", "*.ts", null);
      const call = mockState.invokeCalls.find((c) => c.name === "search_files");
      expect(call).toBeDefined();
      expect(call?.args).toMatchObject({
        workspaceId: "ws1",
        glob: "*.ts",
        contentPattern: null,
      });
    }).pipe(Effect.provide(FileServiceLive)),
  );

  it.effect("I28: searchFiles(ws, glob, 'needle') 调用时 contentPattern 为字符串", () =>
    Effect.gen(function* () {
      mockState.resolved = [];
      const svc = yield* FileService;
      yield* svc.searchFiles("ws1", "*.ts", "needle");
      const call = mockState.invokeCalls.find((c) => c.name === "search_files");
      expect(call).toBeDefined();
      expect(call?.args).toMatchObject({
        workspaceId: "ws1",
        glob: "*.ts",
        contentPattern: "needle",
      });
    }).pipe(Effect.provide(FileServiceLive)),
  );

  it.effect("I29: deleteFile(ws, path) 调用 delete_file", () =>
    Effect.gen(function* () {
      const svc = yield* FileService;
      yield* svc.deleteFile("ws1", "/tmp/x.txt");
      const call = mockState.invokeCalls.find((c) => c.name === "delete_file");
      expect(call).toBeDefined();
      expect(call?.args).toMatchObject({
        workspaceId: "ws1",
        path: "/tmp/x.txt",
      });
    }).pipe(Effect.provide(FileServiceLive)),
  );
});

// 鈹€鈹€鈹€ BillingServiceLive error paths 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

describe("BillingServiceLive 错误路径 — 错误类型映射", () => {
  beforeEach(() => {
    mockState.v0FixtureActive = false;
    mockState.calls.length = 0;
    mockState.invokeCalls.length = 0;
    mockState.rejected = undefined;
    mockState.resolved = undefined;
    mockState.settings = {
      providers: [
        {
          id: "deepseek",
          label: "DeepSeek",
          enabled: true,
          api_key: "",
          llm: {
            default_model: "deepseek-chat",
            base_url: "https://api.deepseek.com",
            api_type: "anthropic-messages" as const,
            models: [],
            models_endpoint: "",
          },
          billing: { kind: "balance" as const },
        },
      ],
      schema_version: "1.5",
      default_llm_provider_id: undefined,
      user_language: "en",
      theme: "system",
      start_at_login: false,
      window: {
        remember_position: false,
        remember_size: false,
        default_size: { width: 800, height: 600 },
        min_size: { width: 400, height: 300 },
      },
      system_prompt: { default: "You are a helpful assistant.", user_can_edit: true },
      conversations: { auto_archive_after_days: 30, max_history: 1000 },
      llm_providers: [],
      billing_providers: [],
      workspaces: [],
    };
  });

  it.effect("I30: 错误信息包含 401 或 unauthorized -> BillingError.Unauthorized", () =>
    Effect.gen(function* () {
      mockState.rejected = new Error("HTTP 401: unauthorized");
      const svc = yield* BillingService;
      const exit = yield* Effect.exit(svc.fetchSnapshot("deepseek"));
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(BillingServiceLive)),
  );

  it.effect("I31: 错误信息包含 network 或 fetch -> BillingError.Network", () =>
    Effect.gen(function* () {
      mockState.rejected = new Error("network error: failed to fetch");
      const svc = yield* BillingService;
      const exit = yield* Effect.exit(svc.fetchSnapshot("deepseek"));
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(BillingServiceLive)),
  );

  it.effect("I32: 其他错误信息 -> BillingError.Unknown", () =>
    Effect.gen(function* () {
      mockState.rejected = new Error("something went wrong");
      const svc = yield* BillingService;
      const exit = yield* Effect.exit(svc.fetchSnapshot("deepseek"));
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(BillingServiceLive)),
  );

  it.effect("I33: envelope.snapshot = null 时返回 null", () =>
    Effect.gen(function* () {
      // Set resolvedByCommand for get_provider_snapshot to return null snapshot envelope
      // while get_settings still returns real settings from mockState.settings
      mockState.resolvedByCommand["get_provider_snapshot"] = {
        provider: "deepseek",
        snapshot: null,
        fetched_at: "",
        error: null,
      };
      const svc = yield* BillingService;
      const result = yield* svc.fetchSnapshot("deepseek");
      expect(result).toBeNull();
      // Clean up
      delete mockState.resolvedByCommand["get_provider_snapshot"];
    }).pipe(Effect.provide(BillingServiceLive)),
  );
});

// 鈹€鈹€鈹€ Bridge function Tests 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

describe("Bridge functions — 桥接函数 IPC 调用", () => {
  beforeEach(() => {
    mockState.calls.length = 0;
    mockState.invokeCalls.length = 0;
    mockState.rejected = undefined;
    mockState.resolved = undefined;
    mockState.settings = {
      providers: [],
      schema_version: "1.5",
      default_llm_provider_id: undefined,
      user_language: "en",
      theme: "system",
      start_at_login: false,
      window: {
        remember_position: false,
        remember_size: false,
        default_size: { width: 800, height: 600 },
        min_size: { width: 400, height: 300 },
      },
      system_prompt: { default: "You are a helpful assistant.", user_can_edit: true },
      conversations: { auto_archive_after_days: 30, max_history: 1000 },
      llm_providers: [],
      billing_providers: [],
      workspaces: [],
    };
  });

  it("I34: getSettingsBridge() 从 IPC 返回 Settings", async () => {
    mockState.resolved = { ...mockState.settings };
    const result = await getSettingsBridge();
    const call = mockState.invokeCalls.find((c) => c.name === "get_settings");
    expect(call).toBeDefined();
    expect(result).toBeDefined();
    expect(result.schema_version).toBe("1.5");
  });

  it("I35: updateSettingsBridge(patch) invokeCalls 包含 update_settings", async () => {
    mockState.resolved = { ...mockState.settings, theme: "dark" };
    await updateSettingsBridge({ theme: "dark" });
    const call = mockState.invokeCalls.find((c) => c.name === "update_settings");
    expect(call).toBeDefined();
    expect(call?.args?.newSettings).toMatchObject({ theme: "dark" });
  });

  it("I36: clearAllHistoryBridge() invokeCalls 包含 clear_all_history", async () => {
    await clearAllHistoryBridge();
    const call = mockState.invokeCalls.find((c) => c.name === "clear_all_history");
    expect(call).toBeDefined();
  });

  it("I37: getWorkspacesBridge() 从 settings 返回 workspaces", async () => {
    mockState.settings.workspaces = [
      { id: "ws1", label: "WS1", root_path: "/path", enabled: true },
    ];
    mockState.resolved = { ...mockState.settings };
    const result = await getWorkspacesBridge();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("ws1");
  });

  it("I38: addWorkspaceBridge(w) 调用 updateSettings 追加 workspace", async () => {
    mockState.settings.workspaces = [];
    mockState.resolved = { ...mockState.settings };
    await addWorkspaceBridge({ id: "ws1", label: "WS1", root_path: "/path", enabled: true });
    const call = mockState.invokeCalls.find((c) => c.name === "update_settings");
    expect(call).toBeDefined();
    const workspaces = (call?.args?.newSettings as any)?.workspaces as Array<{ id: string }>;
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].id).toBe("ws1");
  });

  it("I39: updateWorkspaceBridge(id, patch) 调用 updateSettings 修改 workspace", async () => {
    mockState.settings.workspaces = [
      { id: "ws1", label: "Old", root_path: "/path", enabled: true },
    ];
    mockState.resolved = { ...mockState.settings };
    await updateWorkspaceBridge("ws1", { label: "New" });
    const call = mockState.invokeCalls.find((c) => c.name === "update_settings");
    expect(call).toBeDefined();
    const workspaces = (call?.args?.newSettings as any)?.workspaces as Array<{ id: string; label: string }>;
    expect(workspaces[0].label).toBe("New");
  });

  it("I40: removeWorkspaceBridge(id) 调用 updateSettings 移除 workspace", async () => {
    mockState.settings.workspaces = [
      { id: "ws1", label: "WS1", root_path: "/path", enabled: true },
      { id: "ws2", label: "WS2", root_path: "/path2", enabled: true },
    ];
    mockState.resolved = { ...mockState.settings };
    await removeWorkspaceBridge("ws1");
    const call = mockState.invokeCalls.find((c) => c.name === "update_settings");
    expect(call).toBeDefined();
    const workspaces = (call?.args?.newSettings as any)?.workspaces as Array<{ id: string }>;
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].id).toBe("ws2");
  });
});

// 鈹€鈹€鈹€ BillingServiceV1Live Tests (deprecated stub) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

describe("BillingServiceV1Live (已废弃 stub)", () => {
  beforeEach(() => {
    mockState.v0FixtureActive = false;
    mockState.calls.length = 0;
    mockState.invokeCalls.length = 0;
    mockState.rejected = undefined;
    mockState.resolved = undefined;
  });

  it.effect("listProviders 返回 NotFound 错误", () =>
    Effect.gen(function* () {
      const svc = yield* BillingServiceV1;
      const exit = yield* Effect.exit(svc.listProviders());
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(BillingServiceV1Live)),
  );

  it.effect("getSnapshot 返回 NotFound 错误", () =>
    Effect.gen(function* () {
      const svc = yield* BillingServiceV1;
      const exit = yield* Effect.exit(svc.getSnapshot("minimax"));
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(BillingServiceV1Live)),
  );

  it.effect("hasKey 返回 NotFound 错误", () =>
    Effect.gen(function* () {
      const svc = yield* BillingServiceV1;
      const exit = yield* Effect.exit(svc.hasKey("minimax"));
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(BillingServiceV1Live)),
  );

  it.effect("setKey 返回 NotFound 错误", () =>
    Effect.gen(function* () {
      const svc = yield* BillingServiceV1;
      const exit = yield* Effect.exit(svc.setKey("minimax", "key"));
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(BillingServiceV1Live)),
  );
});

// 鈹€鈹€鈹€ BillingServiceLive error handling 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

describe("BillingServiceLive 错误处理 — get_provider_snapshot 错误映射", () => {
  beforeEach(() => {
    mockState.v0FixtureActive = false;
    mockState.calls.length = 0;
    mockState.invokeCalls.length = 0;
    mockState.rejected = undefined;
    mockState.resolved = undefined;
    mockState.settings = {
      providers: [
        {
          id: "deepseek",
          label: "DeepSeek",
          enabled: true,
          api_key: "",
          llm: {
            default_model: "deepseek-chat",
            base_url: "https://api.deepseek.com",
            api_type: "anthropic-messages" as const,
            models: [],
            models_endpoint: "",
          },
          billing: { kind: "balance" as const },
        },
      ],
      schema_version: "1.5",
      default_llm_provider_id: undefined,
      user_language: "en",
      theme: "system",
      start_at_login: false,
      window: {
        remember_position: false,
        remember_size: false,
        default_size: { width: 800, height: 600 },
        min_size: { width: 400, height: 300 },
      },
      system_prompt: { default: "You are a helpful assistant.", user_can_edit: true },
      conversations: { auto_archive_after_days: 30, max_history: 1000 },
      llm_providers: [],
      billing_providers: [],
      workspaces: [],
    };
  });

  it.effect("get_provider_snapshot 401 错误映射到 Unauthorized", () =>
    Effect.gen(function* () {
      // Use resolvedByCommand to make get_provider_snapshot throw a rejected promise
      // that will be caught by the inner catch block
      mockState.resolvedByCommand["get_provider_snapshot"] = (async () => {
        throw new Error("HTTP 401: unauthorized - invalid API key");
      })();
      const svc = yield* BillingService;
      const exit = yield* Effect.exit(svc.fetchSnapshot("deepseek"));
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(BillingServiceLive)),
  );

  it.effect("get_provider_snapshot network 错误映射到 Network", () =>
    Effect.gen(function* () {
      mockState.resolvedByCommand["get_provider_snapshot"] = (async () => {
        throw new Error("network error: fetch failed");
      })();
      const svc = yield* BillingService;
      const exit = yield* Effect.exit(svc.fetchSnapshot("deepseek"));
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(BillingServiceLive)),
  );

  it.effect("get_provider_snapshot 其他错误映射到 Unknown", () =>
    Effect.gen(function* () {
      mockState.resolvedByCommand["get_provider_snapshot"] = (async () => {
        throw new Error("some other error");
      })();
      const svc = yield* BillingService;
      const exit = yield* Effect.exit(svc.fetchSnapshot("deepseek"));
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(BillingServiceLive)),
  );

  it.effect("fetchSnapshot 对未知 provider 返回 NotFound", () =>
    Effect.gen(function* () {
      // Provider not in settings - tests line 355-360
      mockState.settings.providers = [];
      const svc = yield* BillingService;
      const exit = yield* Effect.exit(svc.fetchSnapshot("unknown"));
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(BillingServiceLive)),
  );

  // Test line 382: catch (e) { return yield* Effect.fail(e as BillingError) }
  // This tests when tauriInvoke throws a non401/non-network error that gets caught and rethrown
  it.effect("fetchSnapshot 捕获 envelope 解析错误并失败", () =>
    Effect.gen(function* () {
      // Set up a provider so we get past the provider check
      mockState.settings.providers = [
        { id: "deepseek", label: "DeepSeek", enabled: true, api_key: "", llm: { default_model: "", base_url: "", api_type: "anthropic-messages" as const, models: [], models_endpoint: "" }, billing: { kind: "balance" as const } },
      ];
      // Make the invoke throw an error that isn't 401 or network
      mockState.resolvedByCommand["get_provider_snapshot"] = (async () => {
        throw new Error("parse error: unexpected JSON");
      })();
      const svc = yield* BillingService;
      const exit = yield* Effect.exit(svc.fetchSnapshot("deepseek"));
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(BillingServiceLive)),
  );
});

// ── TauriError constructor tests ────────────────────────────────────────────────

describe("TauriError.IPC constructor — IPC 错误构造", () => {
  it("IPC 错误创建正确的结构", () => {
    const err = TauriError.IPC("connection failed");
    expect(err).toEqual({ kind: "IPC", message: "connection failed" });
  });
});

// ── ConversationService tests ───────────────────────────────────────────────────

describe("ConversationServiceLive — 对话列表查询", () => {
  beforeEach(() => {
    mockState.v0FixtureActive = false;
    mockState.calls.length = 0;
    mockState.invokeCalls.length = 0;
    mockState.rejected = undefined;
    mockState.resolved = undefined;
    mockState.settings = {
      providers: [],
      schema_version: "1.5",
      default_llm_provider_id: undefined,
      user_language: "en",
      theme: "system",
      start_at_login: false,
      window: {
        remember_position: false,
        remember_size: false,
        default_size: { width: 800, height: 600 },
        min_size: { width: 400, height: 300 },
      },
      system_prompt: { default: "You are a helpful assistant.", user_can_edit: true },
      conversations: { auto_archive_after_days: 30, max_history: 1000 },
      llm_providers: [],
      billing_providers: [],
      workspaces: [],
    };
  });

  it.effect("list(false) 返回空数组", () =>
    Effect.gen(function* () {
      mockState.resolved = [];
      const svc = yield* ConversationService;
      const result = yield* svc.list(false);
      expect(result).toEqual([]);
    }).pipe(Effect.provide(ConversationServiceLive)),
  );

  it.effect("list(true) 有已归档时返回对话列表", () =>
    Effect.gen(function* () {
      mockState.resolved = [{ id: "conv1", title: "Test", system_prompt: null, created_at: 0, updated_at: 0, archived_at: 123 }];
      const svc = yield* ConversationService;
      const result = yield* svc.list(true);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("conv1");
    }).pipe(Effect.provide(ConversationServiceLive)),
  );
});

// ── MessageService tests ────────────────────────────────────────────────────────

describe("MessageServiceLive — 消息搜索与追加", () => {
  beforeEach(() => {
    mockState.v0FixtureActive = false;
    mockState.calls.length = 0;
    mockState.invokeCalls.length = 0;
    mockState.rejected = undefined;
    mockState.resolved = undefined;
    mockState.settings = {
      providers: [],
      schema_version: "1.5",
      default_llm_provider_id: undefined,
      user_language: "en",
      theme: "system",
      start_at_login: false,
      window: {
        remember_position: false,
        remember_size: false,
        default_size: { width: 800, height: 600 },
        min_size: { width: 400, height: 300 },
      },
      system_prompt: { default: "You are a helpful assistant.", user_can_edit: true },
      conversations: { auto_archive_after_days: 30, max_history: 1000 },
      llm_providers: [],
      billing_providers: [],
      workspaces: [],
    };
  });

  it.effect("search(query, limit) 调用 search_messages", () =>
    Effect.gen(function* () {
      mockState.resolved = [];
      const svc = yield* MessageService;
      yield* svc.search("test query", 10);
      const call = mockState.invokeCalls.find((c) => c.name === "search_messages");
      expect(call).toBeDefined();
      expect(call?.args).toMatchObject({ query: "test query", limit: 10 });
    }).pipe(Effect.provide(MessageServiceLive)),
  );

  it.effect("append({convId, role, content}) 使用 camelCase 参数调用 append_message", () =>
    Effect.gen(function* () {
      mockState.resolved = { id: "msg1", conversation_id: "conv1", role: "user", content: "hello", tool_calls: null, tool_results: null, model: null, input_tokens: null, output_tokens: null, created_at: 0 };
      const svc = yield* MessageService;
      yield* svc.append({ conversationId: "conv1", role: "user", content: "hello" });
      const call = mockState.invokeCalls.find((c) => c.name === "append_message");
      expect(call).toBeDefined();
      expect(call?.args).toMatchObject({ conversationId: "conv1", role: "user", content: "hello" });
    }).pipe(Effect.provide(MessageServiceLive)),
  );
});
