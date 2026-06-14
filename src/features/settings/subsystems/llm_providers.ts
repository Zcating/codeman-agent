//! LLM provider Effect 服务（CRUD + API 密钥）。
//!
//! Effect 签名：
//!   LLMProviderService 暴露 7 个方法；每个返回
//!   Effect<A, AppError, never>。
//!
//! api_key 存储在 Tauri store 中（**不**在 Settings JSON 中，**不**
//! 在 keyring 中）。双命名空间规则（AGENTS.md）。

import { Effect, Context, Layer } from "effect";
import { invoke, SettingsServiceLive } from "../../../shared/lib/tauri";
import { SettingsService } from "../../../shared/lib/tauri";
import type { AppError, LLMProvider } from "../../../shared/types";

export class LLMProviderService extends Context.Tag("LLMProviderService")<
  LLMProviderService,
  {
    readonly list: () => Effect.Effect<LLMProvider[], AppError>;
    readonly add: (provider: LLMProvider) => Effect.Effect<void, AppError>;
    readonly update: (id: string, patch: Partial<LLMProvider>) => Effect.Effect<void, AppError>;
    readonly remove: (id: string) => Effect.Effect<void, AppError>;
    readonly setApiKey: (id: string, key: string) => Effect.Effect<void, AppError>;
    readonly hasApiKey: (id: string) => Effect.Effect<boolean, AppError>;
    readonly setActive: (id: string) => Effect.Effect<void, AppError>;
  }
>() {}

export const LLMProviderServiceLive = Layer.effect(
  LLMProviderService,
  Effect.gen(function* () {
    const svc = yield* SettingsService;

    return {
      list: () =>
        Effect.gen(function* () {
          const settings = yield* svc.getSettings();
          return settings.llm_providers;
        }),

      add: (provider) =>
        Effect.gen(function* () {
          const settings = yield* svc.getSettings();
          yield* svc.updateSettings({ llm_providers: [...settings.llm_providers, provider] });
        }),

      update: (id, patch) =>
        Effect.gen(function* () {
          const settings = yield* svc.getSettings();
          const next = settings.llm_providers.map((p) =>
            p.id === id ? { ...p, ...patch, id: p.id } : p,
          );
          yield* svc.updateSettings({ llm_providers: next });
        }),

      remove: (id) =>
        Effect.gen(function* () {
          const settings = yield* svc.getSettings();
          const next = settings.llm_providers.filter((p) => p.id !== id);
          yield* svc.updateSettings({ llm_providers: next });
        }),

      setApiKey: (id, key) => invoke<void>("set_llm_key", { providerId: id, key }),
      hasApiKey: (id) => invoke<boolean>("has_llm_key", { providerId: id }),

      setActive: (id) =>
        Effect.gen(function* () {
          yield* svc.updateSettings({ default_llm_provider_id: id });
        }),
    };
  }),
);

// ─── 桥接函数（基于 Promise，用于 Solid UI） ───────────────────────────

export async function setApiKeyForProvider(id: string, key: string): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* LLMProviderService;
    yield* svc.setApiKey(id, key);
  }).pipe(Effect.provide(LLMProviderServiceLive), Effect.provide(SettingsServiceLive));
  await Effect.runPromise(program);
}

export async function hasApiKeyForProvider(id: string): Promise<boolean> {
  const program = Effect.gen(function* () {
    const svc = yield* LLMProviderService;
    return yield* svc.hasApiKey(id);
  }).pipe(Effect.provide(LLMProviderServiceLive), Effect.provide(SettingsServiceLive));
  return Effect.runPromise(program);
}
