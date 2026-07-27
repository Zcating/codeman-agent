// ProviderService - rendered ProviderService Tag + Live Layer for provider domain IPC.
import { Effect, Context, Layer } from "effect";
import type { Provider, ModelMeta } from "../lib/types";
import { invoke } from "./invoke.api";
import { TauriError } from "./invoke.api";
import { parseModelsApiResponse } from "@codeman-frontend/shared/lib/parse-models-api-response";

export class ProviderService extends Context.Tag("ProviderService")<
  ProviderService,
  {
    readonly list: () => Effect.Effect<Provider[], TauriError>;
    readonly get: (id: string) => Effect.Effect<Provider, TauriError>;
    readonly getModels: (id: string) => Effect.Effect<ModelMeta[], TauriError>;
    readonly fetchModels: (id: string) => Effect.Effect<ModelMeta[], TauriError>;
    readonly delete: (id: string) => Effect.Effect<void, TauriError>;
  }
>() {}

// ProviderService uses settings.providers (V1.5 unified schema) — calls
// getSettings via the codeman dispatch.
export const ProviderServiceLive = Layer.effect(
  ProviderService,
  Effect.gen(function* () {
    const getProviders = invoke<{ providers: Provider[] }>("getSettings").pipe(
      Effect.map((s) => s.providers ?? []),
      Effect.mapError((e) => TauriError.IPC(String(e))),
    );

    const getProvider = (id: string) =>
      Effect.gen(function* () {
        const providers = yield* getProviders;
        const provider = providers.find((p) => p.id === id);
        if (!provider) {
          return yield* Effect.fail(TauriError.IPC(`Provider not found: ${id}`));
        }
        return provider;
      });

    return {
      list: () =>
        Effect.gen(function* () {
          const providers = yield* getProviders;
          return providers.filter((p) => p.enabled);
        }),

      get: (id) => getProvider(id),

      getModels: (id) =>
        Effect.gen(function* () {
          const provider = yield* getProvider(id);
          if (!provider.llm.models) {
            return yield* Effect.succeed([]);
          }
          return provider.llm.models;
        }),

      fetchModels: (id) =>
        Effect.gen(function* () {
          const provider = yield* getProvider(id);
          const { modelsEndpoint } = provider.llm;
          if (!modelsEndpoint) {
            return yield* Effect.fail(
              TauriError.IPC(`No modelsEndpoint for provider: ${id}`),
            );
          }
          const apiKey = provider.apiKey;
          // fetch + JSON parse happens in the Effect body; the unknown-shape
          // response is normalized via parseModelsApiResponse (handles both
          // OpenAI `{ id, name? }` and MiniMax `{ id }`-only shapes).
          const response = yield* Effect.tryPromise({
            try: async () => {
              const res = await fetch(modelsEndpoint, {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
              });
              if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${await res.text()}`);
              }
              return res.json();
            },
            catch: (e) => TauriError.IPC(`fetchModels failed: ${String(e)}`),
          });
          return parseModelsApiResponse(response);
        }),

      delete: (id) =>
        invoke<void>("deleteProvider", { id }).pipe(
          Effect.catchAll(() => Effect.void),
        ),
    };
  }),
);
