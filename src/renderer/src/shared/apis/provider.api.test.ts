import { it, expect, beforeEach } from "@effect/vitest";
import { describe } from "vitest";
import { Effect, Layer, Exit } from "effect";
import { mockState } from "@codeman-frontend/__mocks__/ipc-mock";
import {
  ProviderApi,
} from "./provider.api";
import type { Provider } from "../lib/types";
import { TauriError } from "./invoke.api";


const mockProvider: Provider = {
  id: "minimax",
  label: "MiniMax",
  enabled: true,
  apiKey: "",
  llm: {
    defaultModel: "MiniMax-M2.5-highspeed",
    baseUrl: "https://api.minimaxi.com/anthropic",
    apiType: "anthropic-messages",
    models: [
      {
        id: "MiniMax-M2.5-highspeed",
        label: "MiniMax-M2.5-highspeed",
        contextWindow: 200000,
        deprecated: false,
        thinking: false,
      },
    ],
    modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
  },
};

const mockProviderList: Provider[] = [mockProvider];


const MockProviderApiLive = Layer.succeed(ProviderApi, {
  list: () => Effect.succeed(mockProviderList.filter((p) => p.enabled)),
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
    return Effect.tryPromise({
      try: async () => {
        const res = await fetch(provider.llm.modelsEndpoint, {
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
          },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        }
        const data = (await res.json()) as {
          data: Array<{ id: string; name: string; context_window?: number }>;
        };
        return data.data.map((m) => ({
          id: m.id,
          label: m.name,
          contextWindow: m.context_window,
          deprecated: false,
          thinking: false,
        }));
      },
      catch: (e) => TauriError.IPC(`fetchModels failed: ${String(e)}`),
    });
  },
  delete: () => Effect.succeed(undefined),
});

beforeEach(() => {
  mockState.calls = [];
  mockState.rejected = undefined;
  mockState.settings = {
    providers: [mockProvider],
    schemaVersion: "1.5",
    defaultLlmProviderId: "minimax",
    userLanguage: "en",
    theme: "system",
    startAtLogin: false,
    window: {
      rememberPosition: true,
      rememberSize: true,
      defaultSize: { width: 1280, height: 1280 },
      minSize: { width: 800, height: 800 },
    },
    systemPrompt: { default: "test", userCanEdit: true },
    conversations: { autoArchiveAfterDays: 30, maxHistory: 1000 },
    llmProviders: [],
  };
  mockState.v0FixtureActive = false;
});

describe("ProviderApi", () => {
  it.effect("list returns enabled providers", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderApi;
      const providers = yield* svc.list();
      expect(providers).toHaveLength(1);
      expect(providers[0].id).toBe("minimax");
    }).pipe(Effect.provide(MockProviderApiLive)),
  );

  it.effect("get returns provider by id", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderApi;
      const provider = yield* svc.get("minimax");
      expect(provider.id).toBe("minimax");
    }).pipe(Effect.provide(MockProviderApiLive)),
  );

  it.effect("get fails for unknown provider", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderApi;
      const exit = yield* Effect.exit(svc.get("nonexistent"));
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(MockProviderApiLive)),
  );

  it.effect("getModels returns provider models", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderApi;
      const models = yield* svc.getModels("minimax");
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe("MiniMax-M2.5-highspeed");
    }).pipe(Effect.provide(MockProviderApiLive)),
  );
});
