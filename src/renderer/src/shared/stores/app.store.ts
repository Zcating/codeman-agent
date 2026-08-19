
import { createStore } from "solid-js/store";
import { Effect } from "effect";
import type { Settings, Provider, ModelMeta, Workspace } from "@codeman-frontend/shared/lib/types";
import { logger } from "@codeman-frontend/shared/lib/logger";
import { Unknown, type AppError } from "@codeman-frontend/shared/lib/errors";
import { decodeAppError } from "@codeman-frontend/shared/lib/decode-app-error";
import {
  invoke as ipcInvoke,
  ProviderApi,
  ProviderApiLive,
  SettingsApi,
  SettingsApiLive,
} from "@codeman-frontend/shared/apis";
import { WorkspaceService, WorkspaceServiceLive } from "@codeman-frontend/shared/lib/workspace-service";
import { lookupContextWindow } from "@codeman-frontend/core/llm/context-window-fallback";
import { enforceDefaultModelInvariant } from "@codeman-frontend/shared/lib/provider-invariant";
const DEFAULT_MINIMAX_PROVIDER: Provider = {
  id: "minimax",
  label: "MiniMax",
  apiKey: "",
  llm: {
    defaultModel: "MiniMax-M2.5-highspeed",
    baseUrl: "https://api.minimaxi.com/anthropic",
    apiType: "anthropic-messages",
    contextWindow: 200_000,
    models: [
      {
        id: "MiniMax-M2.5-highspeed",
        label: "MiniMax-M2.5-highspeed",
        contextWindow: 200_000,
        deprecated: false,
        thinking: false,
      } as ModelMeta,
    ],
    modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
  },
};

export const defaultSettings: Settings = {
  providers: [DEFAULT_MINIMAX_PROVIDER],
  schemaVersion: "1.5",
  defaultLlmProviderId: "minimax",
  userLanguage: "auto",
  theme: "system",
  startAtLogin: true,
  window: {
    rememberPosition: true,
    rememberSize: true,
    defaultSize: { width: 1280, height: 1280 },
    minSize: { width: 800, height: 800 },
  },
  systemPrompt: {
    default: "",
    userCanEdit: true,
  },
  conversations: { autoArchiveAfterDays: 30, maxHistory: 1000 },
  llmProviders: [],
  compaction: { enabled: true, reserveTokens: 16384, prune: true, preserveRecentTokens: 2000, tailTurns: 2 },
};

const [settings, setSettings] = createStore<{ value: Settings }>({
  value: defaultSettings,
});

function applyPatch(patch: Partial<Settings>, opts?: { enforceInvariant?: boolean }): void {
  setSettings("value", (prev) => {
    if (opts?.enforceInvariant !== false && patch.providers) {
      const providers = patch.providers.map((p) => ({
        ...p,
        llm: enforceDefaultModelInvariant(p.llm),
      }));
      let defaultLlmProviderId = prev.defaultLlmProviderId;
      if (patch.defaultLlmProviderId !== undefined) {
        defaultLlmProviderId = patch.defaultLlmProviderId;
      } else if (defaultLlmProviderId !== null && !providers.some((p) => p.id === defaultLlmProviderId)) {
        defaultLlmProviderId = providers.length > 0 ? providers[0].id : undefined;
      }
      return { ...prev, ...patch, providers, defaultLlmProviderId };
    }
    return { ...prev, ...patch };
  });
}

function toAppError(e: unknown): AppError {
  if (e && typeof e === "object" && ("kind" in e || "_tag" in e)) {
    return decodeAppError(e);
  }
  return new Unknown({ message: e instanceof Error ? e.message : String(e) });
}

const flushImpl = Effect.fn(function* () {
  yield* ipcInvoke("updateSettings", {
    newSettings: JSON.parse(JSON.stringify(settings.value)),
  });
});

const refreshImpl = Effect.fn(function* () {
  const fresh = yield* ipcInvoke<Settings>("getSettings");
  const freshWithInvariant: Settings = {
    ...fresh,
    providers: (fresh.providers ?? []).map((p) => ({
      ...p,
      llm: enforceDefaultModelInvariant(p.llm),
    })),
  };
  setSettings("value", freshWithInvariant);
  return freshWithInvariant;
});

const refreshProviderModelsImpl = Effect.fn(
  function* (id: string) {
    const svc = yield* ProviderApi;
    const models = yield* svc.fetchModels(id);
    const provider = (settings.value.providers ?? []).find((p) => p.id === id);
    if (provider) {
      for (const m of models) {
        if (m.contextWindow == null) {
          m.contextWindow = lookupContextWindow(m, provider);
        }
      }
    }
    setSettings("value", (prev) => {
      const providers = (prev.providers ?? []).map((p) => {
        if (p.id !== id) {
          return p;
        }
        const newLlm = enforceDefaultModelInvariant({ ...p.llm, models });
        return { ...p, llm: newLlm };
      });
      return { ...prev, providers };
    });
    return models;
  },
  Effect.provide(ProviderApiLive),
  Effect.mapError((e: unknown) => toAppError(e)),
);

const pickWorkspacePathImpl = Effect.fn(
  function* () {
    const svc = yield* WorkspaceService;
    return yield* svc.pickPath();
  },
  Effect.provide(WorkspaceServiceLive),
  Effect.mapError((e: unknown) => toAppError(e)),
);

const deleteProviderImpl = Effect.fn(
  function* (id: string) {
    const providers = (settings.value.providers ?? []).filter((p) => p.id !== id);
    let defaultLlmProviderId = settings.value.defaultLlmProviderId;
    if (defaultLlmProviderId === id) {
      defaultLlmProviderId = providers.length > 0 ? providers[0].id : undefined;
    }
    setSettings("value", (prev) => ({ ...prev, providers, defaultLlmProviderId }));
    const svc = yield* ProviderApi;
    yield* svc.delete(id);
  },
  Effect.provide(ProviderApiLive),
  Effect.mapError((e: unknown) => toAppError(e)),
);

const clearAllHistoryImpl = Effect.fn(
  function* () {
    const svc = yield* SettingsApi;
    yield* svc.clearAllHistory();
  },
  Effect.provide(SettingsApiLive),
  Effect.mapError((e: unknown) => toAppError(e)),
);

export const appStore = {
  state: settings,

  set(patch: Partial<Settings>, opts?: { enforceInvariant?: boolean }): void {
    applyPatch(patch, opts);
  },

  forceFlush(): Effect.Effect<void, AppError> {
    return flushImpl();
  },

  refresh(): Effect.Effect<Settings, AppError> {
    return refreshImpl();
  },

  refreshProviderModels(id: string): Effect.Effect<ModelMeta[], AppError> {
    return refreshProviderModelsImpl(id);
  },

  pickWorkspacePath(): Effect.Effect<string | null, AppError> {
    return pickWorkspacePathImpl();
  },

  addWorkspace(_rootPath: string): Workspace | null {
    logger.warn("appStore.addWorkspace is deprecated - use WorkspaceService instead");
    return null;
  },

  deleteProvider(id: string): Effect.Effect<void, AppError> {
    return deleteProviderImpl(id);
  },

  clearAllHistory(): Effect.Effect<void, AppError> {
    return clearAllHistoryImpl();
  },

  setLastUsedWorkspaceId(_id: string | null): void {
  },

  getLastUsedWorkspaceId(): string | null {
    return null;
  },

  selectedWorkspaceId(): string | null {
    return null;
  },
};

export function _resetAppStoreForTest(): void {
  setSettings("value", defaultSettings);
}
