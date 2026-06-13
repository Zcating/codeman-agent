//! LLMProviderService Effect service tests.
//!
//! Effect signature:
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
import { SettingsService } from "../../lib/tauri";
import type { Settings, LLMProvider } from "../../lib/types";

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
  start_minimized: false,
  close_behavior: "hide_to_tray",
  window: {
    remember_position: false,
    remember_size: false,
    default_size: { width: 800, height: 600 },
    min_size: { width: 400, height: 300 },
  },
  system_prompt: { default: "You are a helpful assistant.", user_can_edit: true },
  hotkeys: { toggle_window: "", new_conversation: "", open_settings: "" },
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
    Effect.succeed(settingsState.llm_providers.find((p) => p.id === settingsState.default_llm_provider_id) ?? null),
});

describe("LLMProviderService", () => {
  beforeEach(() => {
    settingsState = {
      llm_providers: [providerA, providerB],
      default_llm_provider_id: "deepseek",
      user_language: "en",
      theme: "dark",
      start_at_login: false,
      start_minimized: false,
      close_behavior: "hide_to_tray",
      window: {
        remember_position: false,
        remember_size: false,
        default_size: { width: 800, height: 600 },
        min_size: { width: 400, height: 300 },
      },
      system_prompt: { default: "You are a helpful assistant.", user_can_edit: true },
      hotkeys: { toggle_window: "", new_conversation: "", open_settings: "" },
      billing_providers: [],
      conversations: { auto_archive_after_days: 30, max_history: 1000 },
    };
    mockImpl.resolved = undefined;
    mockImpl.calls = [];
    mockImpl.rejected = undefined;
  });

  it.effect("list returns all providers", () =>
    Effect.gen(function* () {
      const svc = yield* LLMProviderService;
      const result = yield* svc.list();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("deepseek");
      expect(result[1].id).toBe("minimax");
    }).pipe(Effect.provide(LLMProviderServiceLive), Effect.provide(MockSettingsServiceLive))
  );

  it.effect("add appends provider to list", () =>
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
    }).pipe(Effect.provide(LLMProviderServiceLive), Effect.provide(MockSettingsServiceLive))
  );

  it.effect("update modifies provider fields", () =>
    Effect.gen(function* () {
      const svc = yield* LLMProviderService;
      yield* svc.update("minimax", { label: "MiniMax Updated", enabled: true });
      const result = yield* svc.list();
      const minimax = result.find((p) => p.id === "minimax");
      expect(minimax?.label).toBe("MiniMax Updated");
    }).pipe(Effect.provide(LLMProviderServiceLive), Effect.provide(MockSettingsServiceLive))
  );

  it.effect("remove filters out provider", () =>
    Effect.gen(function* () {
      const svc = yield* LLMProviderService;
      yield* svc.remove("minimax");
      const result = yield* svc.list();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("deepseek");
    }).pipe(Effect.provide(LLMProviderServiceLive), Effect.provide(MockSettingsServiceLive))
  );

  it.effect("setActive updates default_llm_provider_id in settings", () =>
    Effect.gen(function* () {
      const svc = yield* LLMProviderService;
      yield* svc.setActive("minimax");
      expect(settingsState.default_llm_provider_id).toBe("minimax");
    }).pipe(Effect.provide(LLMProviderServiceLive), Effect.provide(MockSettingsServiceLive))
  );

  it.effect("hasApiKey delegates to mocked invoke (deepseek has key)", () =>
    Effect.gen(function* () {
      mockImpl.resolved = true;
      const svc = yield* LLMProviderService;
      const result = yield* svc.hasApiKey("deepseek");
      expect(result).toBe(true);
      expect(mockImpl.calls).toContain("has_llm_key");
    }).pipe(Effect.provide(LLMProviderServiceLive), Effect.provide(MockSettingsServiceLive))
  );

  it.effect("hasApiKey delegates to mocked invoke (unknown has no key)", () =>
    Effect.gen(function* () {
      mockImpl.resolved = false;
      const svc = yield* LLMProviderService;
      const result = yield* svc.hasApiKey("unknown");
      expect(result).toBe(false);
    }).pipe(Effect.provide(LLMProviderServiceLive), Effect.provide(MockSettingsServiceLive))
  );
});