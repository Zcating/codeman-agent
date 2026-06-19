//! Effect-TS IPC 层 — 所有命令都经过这里。
//! Services 是 Effect.Context.Tag 类；UI 从
//! `src/agent/store/*.ts`（桥接层）导入，**永不**直接从这里导入。
//!
//! Effect 签名：
//!   invoke<T>(name, args): Effect<T, AppError>
//!   ConversationService.list(includeArchived): Effect<Conversation[], AppError>
//!   MessageService.list(conversationId): Effect<Message[], AppError>
//!   ProviderService.list(): Effect<Provider[], TauriError>
//!   BillingService.fetchSnapshot(providerId, args): Effect<Snapshot, BillingError>

import { Effect, Context, Layer } from "effect";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type {
  AppError,
  Conversation,
  Message,
  Settings,
  LLMProvider,
  BillingProviderMeta,
  Snapshot,
  Provider,
  ModelMeta,
  Workspace,
  FileMatch,
} from "./types";

// ─── Error Types ────────────────────────────────────────────

/** Tauri IPC error - distinct from AppError for service-specific error handling */
export interface TauriError {
  readonly kind: "IPC";
  readonly message: string;
}

export const TauriError = {
  IPC: (message: string): TauriError => ({ kind: "IPC" as const, message }),
};

/** Billing-specific errors */
export type BillingError =
  | { kind: "NotFound"; message: string }
  | { kind: "Network"; message: string; cause?: string }
  | { kind: "Unauthorized"; message: string }
  | { kind: "InvalidResponse"; message: string }
  | { kind: "Unknown"; message: string };

/** 包装在 Effect 中的原始 Tauri invoke。 */
export const invoke = <T>(
  name: string,
  args?: Record<string, unknown>,
): Effect.Effect<T, AppError> =>
  Effect.tryPromise({
    try: () => tauriInvoke<T>(name, args),
    catch: (e) => {
      // 保留上游 AppError 形状(若有 kind 字段),否则退化为 Unknown。
      // 否则 sandbox 错误会被 `String(e)` 打成 "[object Object]",错误种类丢失。
      if (e && typeof e === "object" && "kind" in e) {
        return e as AppError;
      }
      return { kind: "Unknown" as const, message: String(e) };
    },
  });

// ─── Service 标签 ──────────────────────────────────────────
export class ConversationService extends Context.Tag("ConversationService")<
  ConversationService,
  {
    readonly list: (includeArchived: boolean) => Effect.Effect<Conversation[], AppError>;
    readonly get: (id: string) => Effect.Effect<Conversation, AppError>;
    readonly create: (
      title: string,
      systemPrompt?: string,
    ) => Effect.Effect<Conversation, AppError>;
    readonly archive: (id: string) => Effect.Effect<void, AppError>;
    readonly delete: (id: string) => Effect.Effect<void, AppError>;
  }
>() {}

export class MessageService extends Context.Tag("MessageService")<
  MessageService,
  {
    readonly list: (conversationId: string) => Effect.Effect<Message[], AppError>;
    readonly append: (args: {
      // Tauri 2 IPC 约定 camelCase 参数:Rust `conversation_id: String`
      // 通过自动 serde rename 映射。`Message` 返回值本身的字段仍是
      // snake_case(镜像 Rust serde 默认)。
      conversationId: string;
      role: string;
      content: string;
      toolCalls?: string;
      toolResults?: string;
      model?: string;
      inputTokens?: number;
      outputTokens?: number;
    }) => Effect.Effect<Message, AppError>;
    readonly search: (query: string, limit: number) => Effect.Effect<Message[], AppError>;
  }
>() {}

// ─── ProviderService (V1.5) ──────────────────────────────────

export class ProviderService extends Context.Tag("ProviderService")<
  ProviderService,
  {
    readonly list: () => Effect.Effect<Provider[], TauriError>;
    readonly listByKind: (kind: "llm" | "billing") => Effect.Effect<Provider[], TauriError>;
    readonly get: (id: string) => Effect.Effect<Provider, TauriError>;
    readonly getModels: (id: string) => Effect.Effect<ModelMeta[], TauriError>;
    readonly fetchModels: (id: string) => Effect.Effect<ModelMeta[], TauriError>;
  }
>() {}

// ─── BillingService (V1.5) ──────────────────────────────────

export class BillingService extends Context.Tag("BillingService")<
  BillingService,
  {
    /** List providers that have billing configured */
    readonly list: () => Effect.Effect<Provider[], BillingError>;
    /** Fetch billing snapshot for a provider */
    readonly fetchSnapshot: (
      providerId: string,
      args?: { force_refresh?: boolean },
    ) => Effect.Effect<Snapshot, BillingError>;
  }
>() {}

/** @deprecated V1 stub — use BillingService from V1.5 */
export class BillingServiceV1 extends Context.Tag("BillingServiceV1")<
  BillingServiceV1,
  {
    readonly listProviders: () => Effect.Effect<BillingProviderMeta[], AppError>;
    readonly getSnapshot: (providerId: string) => Effect.Effect<Snapshot, AppError>;
    readonly hasKey: (providerId: string) => Effect.Effect<boolean, AppError>;
    readonly setKey: (providerId: string, key: string) => Effect.Effect<void, AppError>;
  }
>() {}

export class SettingsService extends Context.Tag("SettingsService")<
  SettingsService,
  {
    readonly getSettings: () => Effect.Effect<Settings, AppError>;
    readonly updateSettings: (patch: unknown) => Effect.Effect<Settings, AppError>;
    readonly clearAllHistory: () => Effect.Effect<void, AppError>;
    readonly getActiveLlmProvider: () => Effect.Effect<LLMProvider | null, AppError>;
  }
>() {}

// ─── WorkspaceService (V2 File IO — ADR-0013) ─────────────────────────────

export class WorkspaceService extends Context.Tag("WorkspaceService")<
  WorkspaceService,
  {
    /** Returns all workspaces from settings */
    readonly list: () => Effect.Effect<Workspace[], AppError>;
    /** Adds a new workspace to settings */
    readonly add: (workspace: Workspace) => Effect.Effect<void, AppError>;
    /** Updates an existing workspace by id */
    readonly update: (id: string, patch: Partial<Workspace>) => Effect.Effect<void, AppError>;
    /** Removes a workspace by id */
    readonly remove: (id: string) => Effect.Effect<void, AppError>;
  }
>() {}

// ─── FileService (V2 File IO — ADR-0013) ──────────────────────────────────

export class FileService extends Context.Tag("FileService")<
  FileService,
  {
    readonly readFile: (workspaceId: string, path: string) => Effect.Effect<string, AppError>;
    readonly writeFile: (
      workspaceId: string,
      path: string,
      content: string,
    ) => Effect.Effect<void, AppError>;
    readonly editFile: (
      workspaceId: string,
      path: string,
      oldText: string,
      newText: string,
      replaceAll: boolean,
    ) => Effect.Effect<void, AppError>;
    // Note: IPC layer uses string | null for contentPattern (Option.None = null)
    readonly searchFiles: (
      workspaceId: string,
      glob: string,
      contentPattern: string | null,
    ) => Effect.Effect<FileMatch[], AppError>;
    readonly deleteFile: (workspaceId: string, path: string) => Effect.Effect<void, AppError>;
  }
>() {}

// ─── Live layers ────────────────────────────────────────────

export const ConversationServiceLive = Layer.succeed(ConversationService, {
  list: (includeArchived) => invoke<Conversation[]>("list_conversations", { includeArchived }),
  get: (id) => invoke<Conversation>("get_conversation", { id }),
  create: (title, systemPrompt) =>
    invoke<Conversation>("create_conversation", { title, systemPrompt: systemPrompt ?? null }),
  archive: (id) => invoke<void>("archive_conversation", { id }),
  delete: (id) => invoke<void>("delete_conversation", { id }),
});
export const MessageServiceLive = Layer.succeed(MessageService, {
  list: (conversationId) => invoke<Message[]>("list_messages", { conversationId }),
  append: (args) => invoke<Message>("append_message", args),
  search: (query, limit) => invoke<Message[]>("search_messages", { query, limit }),
});

// ProviderServiceLive
export const ProviderServiceLive = Layer.effect(
  ProviderService,
  Effect.gen(function* () {
    // Helper to get all providers
    const getProviders = Effect.tryPromise({
      try: () =>
        tauriInvoke<{ providers: Provider[] }>("get_settings").then((s) => s.providers ?? []),
      catch: (e) => TauriError.IPC(String(e)),
    });

    // Helper to get a single provider by id
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

      listByKind: (kind) =>
        Effect.gen(function* () {
          const providers = yield* getProviders;
          if (kind === "llm") {
            return providers.filter((p) => p.enabled && p.llm);
          } else {
            return providers.filter((p) => p.enabled && p.billing);
          }
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
          const { models_endpoint } = provider.llm;

          if (!models_endpoint) {
            return yield* Effect.fail(TauriError.IPC(`No models_endpoint for provider: ${id}`));
          }

          // Fetch API key from Tauri store via IPC
          const apiKey = yield* Effect.tryPromise({
            try: () =>
              tauriInvoke<string | null>("get_llm_key", { providerId: id }).then((k) => k ?? ""),
            catch: (e) => TauriError.IPC(String(e)),
          });

          const response = yield* Effect.tryPromise({
            try: async () => {
              const res = await fetch(models_endpoint, {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
              });
              if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${await res.text()}`);
              }
              return res.json() as Promise<{
                data: Array<{ id: string; name: string; context_window?: number }>;
              }>;
            },
            catch: (e) => TauriError.IPC(`fetchModels failed: ${String(e)}`),
          });

          return response.data.map((m) => ({
            id: m.id,
            label: m.name,
            context_window: m.context_window,
            deprecated: false,
            thinking: false,
          }));
        }),
    };
  }),
);

// BillingServiceLive
export const BillingServiceLive = Layer.effect(
  BillingService,
  Effect.gen(function* () {
    // Helper to get billing providers with BillingError type
    const getBillingProviders = (): Effect.Effect<Provider[], BillingError> =>
      Effect.gen(function* () {
        const settings = yield* Effect.tryPromise({
          try: () => tauriInvoke<{ providers: Provider[] }>("get_settings"),
          catch: (e) => TauriError.IPC(String(e)),
        });
        return (settings.providers ?? []).filter((p) => p.enabled && p.billing);
      }).pipe(
        Effect.mapError((e) => {
          const err = e as TauriError;
          return {
            kind: "Network" as const,
            message: err.message,
          } satisfies BillingError;
        }),
      );

    return {
      list: () => getBillingProviders(),

      fetchSnapshot: (providerId, args) =>
        Effect.gen(function* () {
          // Get provider billing config
          const providers = yield* getBillingProviders();
          const provider = providers.find((p) => p.id === providerId);

          if (!provider || !provider.billing) {
            return yield* Effect.fail({
              kind: "NotFound" as const,
              message: `Billing provider not found: ${providerId}`,
            } satisfies BillingError);
          }

          // TypeScript needs this assignment to properly narrow the type
          const billingConfig = provider.billing;

          // Call Rust adapter via IPC
          let snapshot: Snapshot;
          try {
            snapshot = yield* Effect.tryPromise({
              try: () =>
                tauriInvoke<Snapshot>("fetch_billing_snapshot", {
                  provider_id: providerId,
                  billing_kind: billingConfig.kind,
                  force_refresh: args?.force_refresh ?? false,
                }),
              catch: (e) => {
                const msg = String(e);
                if (msg.includes("401") || msg.includes("unauthorized")) {
                  throw { kind: "Unauthorized" as const, message: msg } satisfies BillingError;
                }
                if (msg.includes("network") || msg.includes("fetch")) {
                  throw { kind: "Network" as const, message: msg } satisfies BillingError;
                }
                throw { kind: "Unknown" as const, message: msg } satisfies BillingError;
              },
            });
          } catch (e) {
            return yield* Effect.fail(e as BillingError);
          }

          return snapshot;
        }),
    };
  }),
);

/** @deprecated V1 stub — use BillingServiceLive */
export const BillingServiceV1Live = Layer.succeed(BillingServiceV1, {
  listProviders: () => Effect.fail({ kind: "NotFound", message: "stub" } as AppError),
  getSnapshot: () => Effect.fail({ kind: "NotFound", message: "stub" } as AppError),
  hasKey: () => Effect.fail({ kind: "NotFound", message: "stub" } as AppError),
  setKey: () => Effect.fail({ kind: "NotFound", message: "stub" } as AppError),
});

export const SettingsServiceLive = Layer.succeed(SettingsService, {
  getSettings: () => invoke<Settings>("get_settings"),
  updateSettings: (patch) => invoke<Settings>("update_settings", { newSettings: patch }),
  clearAllHistory: () => invoke<void>("clear_all_history"),
  getActiveLlmProvider: () =>
    Effect.gen(function* () {
      const settings = yield* invoke<Settings>("get_settings");
      const id = settings.default_llm_provider_id;
      if (!id) return yield* Effect.succeed(null);
      return yield* Effect.succeed(
        settings.llm_providers.find((p) => p.id === id && p.enabled) ?? null,
      );
    }),
});

// 暴露 impl object — 给 chat runtime 等需要显式 Effect.provideService 的地方用
// (Layer.succeed 在 type narrowing 上不可靠,runtime 时 Context 也可能找不到)。
export const SettingsServiceImpl = {
  getSettings: () => invoke<Settings>("get_settings"),
  updateSettings: (patch: unknown) => invoke<Settings>("update_settings", { newSettings: patch }),
  clearAllHistory: () => invoke<void>("clear_all_history"),
  getActiveLlmProvider: () =>
    Effect.gen(function* () {
      const settings = yield* invoke<Settings>("get_settings");
      const id = settings.default_llm_provider_id;
      if (!id) return yield* Effect.succeed(null);
      return yield* Effect.succeed(
        settings.llm_providers.find((p) => p.id === id && p.enabled) ?? null,
      );
    }),
} as const;

// WorkspaceServiceLive
export const WorkspaceServiceLive = Layer.effect(
  WorkspaceService,
  Effect.gen(function* () {
    const settingsSvc = yield* SettingsService;

    return {
      list: () =>
        Effect.gen(function* () {
          const settings = yield* settingsSvc.getSettings();
          return settings.workspaces ?? [];
        }),

      add: (workspace) =>
        Effect.gen(function* () {
          const settings = yield* settingsSvc.getSettings();
          const workspaces = [...(settings.workspaces ?? []), workspace];
          yield* settingsSvc.updateSettings({ workspaces });
        }),

      update: (id, patch) =>
        Effect.gen(function* () {
          const settings = yield* settingsSvc.getSettings();
          const workspaces = (settings.workspaces ?? []).map((ws) =>
            ws.id === id ? { ...ws, ...patch } : ws,
          );
          yield* settingsSvc.updateSettings({ workspaces });
        }),

      remove: (id) =>
        Effect.gen(function* () {
          const settings = yield* settingsSvc.getSettings();
          const workspaces = (settings.workspaces ?? []).filter((ws) => ws.id !== id);
          yield* settingsSvc.updateSettings({ workspaces });
        }),
    };
  }),
);

// FileServiceLive — thin IPC wrappers, no Effect.gen needed since no deps.
// Use Layer.succeed (Effect v3 API) with the static service value; Layer.fromEffect
// was removed in v3 (renamed to Layer.effect, which takes an Effect<Service, E, R>).
export const FileServiceLive = Layer.succeed(FileService, {
  readFile: (workspaceId: string, path: string) =>
    invoke<string>("read_file", { workspace_id: workspaceId, path }),

  writeFile: (workspaceId: string, path: string, content: string) =>
    invoke<void>("write_file", { workspace_id: workspaceId, path, content }),

  editFile: (
    workspaceId: string,
    path: string,
    oldText: string,
    newText: string,
    replaceAll: boolean,
  ) =>
    invoke<void>("edit_file", {
      workspace_id: workspaceId,
      path,
      old_text: oldText,
      new_text: newText,
      replace_all: replaceAll,
    }),

  searchFiles: (workspaceId: string, glob: string, contentPattern: string | null) =>
    invoke<FileMatch[]>("search_files", {
      workspace_id: workspaceId,
      glob,
      content_pattern: contentPattern,
    }),

  deleteFile: (workspaceId: string, path: string) =>
    invoke<void>("delete_file", { workspace_id: workspaceId, path }),
});

// ─── 桥接函数（基于 Promise，用于 Solid UI） ──────────────────────────

export async function getSettingsBridge(): Promise<Settings> {
  const program = Effect.gen(function* () {
    const svc = yield* SettingsService;
    return yield* svc.getSettings();
  }).pipe(Effect.provide(SettingsServiceLive));
  return Effect.runPromise(program);
}

export async function updateSettingsBridge(patch: Partial<Settings>): Promise<Settings> {
  const program = Effect.gen(function* () {
    const svc = yield* SettingsService;
    return yield* svc.updateSettings(patch);
  }).pipe(Effect.provide(SettingsServiceLive));
  return Effect.runPromise(program);
}

export async function clearAllHistoryBridge(): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* SettingsService;
    yield* svc.clearAllHistory();
  }).pipe(Effect.provide(SettingsServiceLive));
  await Effect.runPromise(program);
}

// ─── Workspace Bridge Functions ────────────────────────────────
// 注意:WorkspaceServiceLive 内部依赖 SettingsService(workspace 存于 settings store),
// Effect.runPromise 要求 R=never,所以必须把 SettingsServiceLive 一并串到 provide 链里。
// 否则运行时报 "Service not found: SettingsService"。

export async function getWorkspacesBridge(): Promise<Workspace[]> {
  const program = Effect.gen(function* () {
    const svc = yield* WorkspaceService;
    return yield* svc.list();
  }).pipe(Effect.provide(WorkspaceServiceLive.pipe(Layer.provide(SettingsServiceLive))));
  return Effect.runPromise(program);
}

export async function addWorkspaceBridge(workspace: Workspace): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* WorkspaceService;
    yield* svc.add(workspace);
  }).pipe(Effect.provide(WorkspaceServiceLive.pipe(Layer.provide(SettingsServiceLive))));
  await Effect.runPromise(program);
}

export async function updateWorkspaceBridge(id: string, patch: Partial<Workspace>): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* WorkspaceService;
    yield* svc.update(id, patch);
  }).pipe(Effect.provide(WorkspaceServiceLive.pipe(Layer.provide(SettingsServiceLive))));
  await Effect.runPromise(program);
}

export async function removeWorkspaceBridge(id: string): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* WorkspaceService;
    yield* svc.remove(id);
  }).pipe(Effect.provide(WorkspaceServiceLive.pipe(Layer.provide(SettingsServiceLive))));
  await Effect.runPromise(program);
}
