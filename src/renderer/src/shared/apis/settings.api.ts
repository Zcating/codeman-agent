// SettingsApi - rendered SettingsApi Tag + Live Layer + Bridge Functions for settings domain IPC.
import { Effect, Context, Layer } from "effect";
import type { Settings, LLMProvider } from "../lib/types";
import type { AppError } from "@codeman-frontend/shared/lib/errors";
import { invoke } from "./invoke.api";

export class SettingsApi extends Context.Tag("SettingsApi")<
  SettingsApi,
  {
    readonly getSettings: () => Effect.Effect<Settings, AppError>;
    readonly updateSettings: (patch: unknown) => Effect.Effect<Settings, AppError>;
    readonly clearAllHistory: () => Effect.Effect<void, AppError>;
    readonly getActiveLlmProvider: () => Effect.Effect<LLMProvider | null, AppError>;
  }
>() {}

export const SettingsApiLive = Layer.succeed(SettingsApi, {
  getSettings: () => invoke<Settings>("getSettings"),
  updateSettings: (patch) => invoke<Settings>("updateSettings", { newSettings: patch }),
  clearAllHistory: () => invoke<void>("clearAllHistory"),
  getActiveLlmProvider: () =>
    Effect.gen(function* () {
      const settings = yield* invoke<Settings>("getSettings");
      const id = settings.defaultLlmProviderId;
      if (!id) {
        return yield* Effect.succeed(null);
      }
      return yield* Effect.succeed(
        (() => {
          const p = (settings.providers ?? []).find(
            (p) => p.id === id && p.enabled,
          );
          if (!p || !p.llm) {return null;}
          const v1: LLMProvider = {
            id: p.id,
            label: p.label,
            enabled: p.enabled,
            defaultModel: p.llm.defaultModel,
            baseUrl: p.llm.baseUrl,
            apiType: p.llm.apiType,
            apiKeyRef: "",
          };
          return v1;
        })(),
      );
    }),
});

// ─── Bridge functions (Promise-based, for Solid UI) ─────────────

export async function getSettingsBridge(): Promise<Settings> {
  const program = Effect.gen(function* () {
    const svc = yield* SettingsApi;
    return yield* svc.getSettings();
  }).pipe(Effect.provide(SettingsApiLive));
  return Effect.runPromise(program);
}

export async function updateSettingsBridge(patch: Partial<Settings>): Promise<Settings> {
  const program = Effect.gen(function* () {
    const svc = yield* SettingsApi;
    return yield* svc.updateSettings(patch);
  }).pipe(Effect.provide(SettingsApiLive));
  return Effect.runPromise(program);
}

export async function clearAllHistoryBridge(): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* SettingsApi;
    yield* svc.clearAllHistory();
  }).pipe(Effect.provide(SettingsApiLive));
  await Effect.runPromise(program);
}
