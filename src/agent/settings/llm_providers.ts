//! LLM provider Effect service (CRUD + API keys).
//!
//! Effect signature:
//!   LLMProviderService exposes 7 methods; each returns
//!   Effect<A, AppError, never>.
//!
//! The api_key is stored in Tauri store (NOT in Settings JSON, NOT in
//! keyring). Two-namespace rule (AGENTS.md).

import { Effect, Context, Layer } from "effect";
import { invoke } from "../../lib/tauri";
import { SettingsService, SettingsServiceLive } from "../../lib/tauri";
import type { AppError, LLMProvider } from "../../lib/types";

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

export const LLMProviderServiceLive = Layer.succeed(LLMProviderService, {
  list: () =>
    Effect.gen(function* () {
      const svc = yield* SettingsService;
      const settings = yield* svc.getSettings();
      return settings.llm_providers;
    }).pipe(Effect.provide(SettingsServiceLive)),

  add: (provider) =>
    Effect.gen(function* () {
      const svc = yield* SettingsService;
      const settings = yield* svc.getSettings();
      yield* svc.updateSettings({ llm_providers: [...settings.llm_providers, provider] });
    }).pipe(Effect.provide(SettingsServiceLive)),

  update: (id, patch) =>
    Effect.gen(function* () {
      const svc = yield* SettingsService;
      const settings = yield* svc.getSettings();
      const next = settings.llm_providers.map((p) =>
        p.id === id ? { ...p, ...patch, id: p.id } : p
      );
      yield* svc.updateSettings({ llm_providers: next });
    }).pipe(Effect.provide(SettingsServiceLive)),

  remove: (id) =>
    Effect.gen(function* () {
      const svc = yield* SettingsService;
      const settings = yield* svc.getSettings();
      const next = settings.llm_providers.filter((p) => p.id !== id);
      yield* svc.updateSettings({ llm_providers: next });
    }).pipe(Effect.provide(SettingsServiceLive)),

  // API keys go in Tauri store (NOT in Settings JSON). The Rust side
  // exposes set_llm_key / has_llm_key commands (T22).
  setApiKey: (id, key) => invoke<void>("set_llm_key", { providerId: id, key }),
  hasApiKey: (id) => invoke<boolean>("has_llm_key", { providerId: id }),

  setActive: (id) =>
    Effect.gen(function* () {
      const svc = yield* SettingsService;
      yield* svc.updateSettings({ default_llm_provider_id: id });
    }).pipe(Effect.provide(SettingsServiceLive)),
});