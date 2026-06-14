//! LLMProviderService Effect 服务测试。
//!
//! Effect 签名：
//!   LLMProviderService.list(): Effect<LLMProvider[], AppError>
//!   LLMProviderService.add(provider): Effect<void, AppError>
//!   LLMProviderService.update(id, patch): Effect<void, AppError>
//!   LLMProviderService.remove(id): Effect<void, AppError>
//!   LLMProviderService.setApiKey(id, key): Effect<void, AppError>
//!   LLMProviderService.hasApiKey(id): Effect<boolean, AppError>
//!   LLMProviderService.setActive(id): Effect<void, AppError>

import { it, expect, beforeEach } from "@effect/vitest";
import { describe } from "vitest";
import { Effect, Layer } from "effect";
import { LLMProviderService, LLMProviderServiceLive } from "./llm_providers";
import { SettingsService } from "../../../shared/lib/tauri";
import type { Settings, LLMProvider } from "../../../shared/types";
import { mockState } from "../../../shared/shared-mock-state";

const mockImpl: {
  resolved: unknown;
  rejected: Error | undefined;
  calls: string[];
} = {
  resolved: undefined,
  rejected: undefined,
  calls: [],
};

const providerA: LLMProvider = {
  id: "deepseek",
  label: "DeepSeek",
  enabled: true,
  default_model: "deepseek-chat",
  base_url: "https://api.deepseek.com",
  api_key_ref: "llm_providers/deepseek/api_key",
};
const providerB: LLMProvider = {
  id: "minimax",
  label: "MiniMax",
  enabled: false,
  default_model: "abab6",
  base_url: "https://api.minimax.chat",
  api_key_ref: "llm_providers/minimax/api_key",
};

let settingsState: Settings = {
  llm_providers: [providerA, providerB],
  default_llm_provider_id: "deepseek",
  user_language: "en",
  theme: "dark",
  start_at_login: false,
  window: {
    remember_position: false,
    remember_size: false,
    default_size: { width: 800, height: 600 },
    min_size: { width: 400, height: 300 },
  },
  system_prompt: { default: "You are a helpful assistant.", user_can_edit: true },
  billing_providers: [],
  conversations: { auto_archive_after_days: 30, max_history: 1000 },
};

const MockSettingsServiceLive = Layer.succeed(SettingsService, {
  getSettings: () => Effect.succeed({ ...settingsState }),
  updateSettings: (patch: unknown) => {
    settingsState = { ...settingsState, ...(patch as Partial<Settings>) };
    return Effect.succeed({ ...settingsState });
  },
  clearAllHistory: () => Effect.succeed(undefined),
  getActiveLlmProvider: () =>
    Effect.succeed(
      settingsState.llm_providers.find((p) => p.id === settingsState.default_llm_provider_id) ??
        null,
    ),
});

describe("LLMProviderService", () => {
  beforeEach(() => {
    settingsState = {
      llm_providers: [providerA, providerB],
      default_llm_provider_id: "deepseek",
      user_language: "en",
      theme: "dark",
      start_at_login: false,
      window: {
        remember_position: false,
        remember_size: false,
        default_size: { width: 800, height: 600 },
        min_size: { width: 400, height: 300 },
      },
      system_prompt: { default: "You are a helpful assistant.", user_can_edit: true },
      billing_providers: [],
      conversations: { auto_archive_after_days: 30, max_history: 1000 },
    };
    mockImpl.resolved = undefined;
    mockImpl.calls = [];
    mockImpl.rejected = undefined;
    mockState.resolved = undefined;
    mockState.calls = [];
    mockState.rejected = undefined;
  });

  it.effect("list 返回所有 provider", () =>
    Effect.gen(function* () {
      const svc = yield* LLMProviderService;
      const result = yield* svc.list();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("deepseek");
      expect(result[1].id).toBe("minimax");
    }).pipe(Effect.provide(LLMProviderServiceLive), Effect.provide(MockSettingsServiceLive)),
  );

  it.effect("add 追加 provider 到列表", () =>
    Effect.gen(function* () {
      const svc = yield* LLMProviderService;
      const newProvider: LLMProvider = {
        id: "openai",
        label: "OpenAI",
        enabled: true,
        api_key_ref: "llm_providers/openai/api_key",
      };
      yield* svc.add(newProvider);
      const result = yield* svc.list();
      expect(result).toHaveLength(3);
      expect(result[2].id).toBe("openai");
    }).pipe(Effect.provide(LLMProviderServiceLive), Effect.provide(MockSettingsServiceLive)),
  );

  it.effect("update 修改 provider 字段", () =>
    Effect.gen(function* () {
      const svc = yield* LLMProviderService;
      yield* svc.update("minimax", { label: "MiniMax Updated", enabled: true });
      const result = yield* svc.list();
      const minimax = result.find((p) => p.id === "minimax");
      expect(minimax?.label).toBe("MiniMax Updated");
    }).pipe(Effect.provide(LLMProviderServiceLive), Effect.provide(MockSettingsServiceLive)),
  );

  it.effect("remove 从列表中过滤掉 provider", () =>
    Effect.gen(function* () {
      const svc = yield* LLMProviderService;
      yield* svc.remove("minimax");
      const result = yield* svc.list();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("deepseek");
    }).pipe(Effect.provide(LLMProviderServiceLive), Effect.provide(MockSettingsServiceLive)),
  );

  it.effect("setActive 更新 settings 中的 default_llm_provider_id", () =>
    Effect.gen(function* () {
      const svc = yield* LLMProviderService;
      yield* svc.setActive("minimax");
      expect(settingsState.default_llm_provider_id).toBe("minimax");
    }).pipe(Effect.provide(LLMProviderServiceLive), Effect.provide(MockSettingsServiceLive)),
  );

  it.effect("hasApiKey 委托给 mock invoke（deepseek 有 key）", () =>
    Effect.gen(function* () {
      mockState.resolved = true;
      const svc = yield* LLMProviderService;
      const result = yield* svc.hasApiKey("deepseek");
      expect(result).toBe(true);
      expect(mockState.calls).toContain("has_llm_key");
    }).pipe(Effect.provide(LLMProviderServiceLive), Effect.provide(MockSettingsServiceLive)),
  );

  it.effect("hasApiKey 委托给 mock invoke（unknown 无 key）", () =>
    Effect.gen(function* () {
      mockState.resolved = false;
      const svc = yield* LLMProviderService;
      const result = yield* svc.hasApiKey("unknown");
      expect(result).toBe(false);
    }).pipe(Effect.provide(LLMProviderServiceLive), Effect.provide(MockSettingsServiceLive)),
  );
});
