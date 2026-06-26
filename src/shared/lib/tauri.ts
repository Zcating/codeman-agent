//! Effect-TS IPC 层 — 所有命令都经过这里。
//! Services 是 Effect.Context.Tag 类；UI 从
//! `src/agent/store/*.ts`（桥接层）导入，**永不**直接从这里导入。
//!
//! Effect 签名：
//!   invoke<T>(name, args): Effect<T, AppError>
//!   ConversationService.list(includeArchived): Effect<Conversation[], AppError>
//!   MessageService.list(conversationId): Effect<Message[], AppError>
//!   ProviderService.list(): Effect<Provider[], TauriError>

import { Effect, Context, Layer } from "effect";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { logger } from "./logger";
import type {
  AppError,
  Conversation,
  Message,
  Settings,
  LLMProvider,
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
        // AppError 形状的 rejection 是预期行为(后端 sandbox violation / NotFound 等),
        // 不再 console.error 噪音 — UI 层 tool_call_card 会自己渲染 detail。
        if (e && typeof e === "object" && "kind" in e) {
          return e as AppError;
        }
        logger.error("IPC 调用失败", name, e);
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
    readonly get: (id: string) => Effect.Effect<Provider, TauriError>;
    readonly getModels: (id: string) => Effect.Effect<ModelMeta[], TauriError>;
    readonly fetchModels: (id: string) => Effect.Effect<ModelMeta[], TauriError>;
    /** 删除 provider (V1.8+ ADR-0016 D4) — 占位 IPC, 实际删除走 client state mutation */
    readonly delete: (id: string) => Effect.Effect<void, TauriError>;
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
    /** 弹出 OS folder picker (V1.8+ ADR-0016 D4) — 返回选中路径或 null */
    readonly pickPath: () => Effect.Effect<string | null, AppError>;
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

          // API key is now part of Provider (ADR-0015)
          const apiKey = provider.api_key;

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

      // V1.8+ ADR-0016 D4: delete provider — 占位 IPC, 实际删除走 client state mutation
      // (provider-card.tsx 不再直接 invoke, 改走 appStore.deleteProvider)。
      delete: (id) =>
        Effect.tryPromise({
          try: () => tauriInvoke<void>("delete_provider", { id }).catch(() => undefined),
          catch: (e) => TauriError.IPC(`delete_provider failed: ${String(e)}`),
        }),
    };
  }),
);

export const SettingsServiceLive = Layer.succeed(SettingsService, {
  getSettings: () => invoke<Settings>("get_settings"),
  updateSettings: (patch) => invoke<Settings>("update_settings", { newSettings: patch }),
  clearAllHistory: () => invoke<void>("clear_all_history"),
  getActiveLlmProvider: () =>
    Effect.gen(function* () {
      const settings = yield* invoke<Settings>("get_settings");
      const id = settings.default_llm_provider_id;
      if (!id) {
        return yield* Effect.succeed(null);
      }
      return yield* Effect.succeed(
        // V1.5+ (ADR-0012): 读 settings.providers[] (V1.5 unified schema)。
        // 返回 V1 LLMProvider 形状给 chat runtime 消费:把 llm.* 字段拼到顶层。
        // 实际 api_key 走 v15Provider.api_key (ADR-0015),不在 V1 形状上,见 runtime.ts。
        (() => {
          const p = (settings.providers ?? []).find((p) => p.id === id && p.enabled);
          if (!p || !p.llm) {
            return null;
          }
          const v1: LLMProvider = {
            id: p.id,
            label: p.label,
            enabled: p.enabled,
            default_model: p.llm.default_model,
            base_url: p.llm.base_url,
            api_type: p.llm.api_type,
            api_key_ref: "",
          };
          return v1;
        })(),
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
      if (!id) {
        return yield* Effect.succeed(null);
      }
      return yield* Effect.succeed(
        // V1.5+ (ADR-0012): 读 settings.providers[] (V1.5 unified schema)。
        // 返回 V1 LLMProvider 形状给 chat runtime 消费:把 llm.* 字段拼到顶层。
        // 实际 api_key 走 v15Provider.api_key (ADR-0015),不在 V1 形状上,见 runtime.ts。
        (() => {
          const p = (settings.providers ?? []).find((p) => p.id === id && p.enabled);
          if (!p || !p.llm) {
            return null;
          }
          const v1: LLMProvider = {
            id: p.id,
            label: p.label,
            enabled: p.enabled,
            default_model: p.llm.default_model,
            base_url: p.llm.base_url,
            api_type: p.llm.api_type,
            api_key_ref: "",
          };
          return v1;
        })(),
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

      // V1.8+ ADR-0016 D4: pick workspace path — 弹 OS folder picker
      pickPath: () => invoke<string | null>("pick_workspace_path"),
    };
  }),
);

// FileServiceLive — thin IPC wrappers, no Effect.gen needed since no deps.
// Use Layer.succeed (Effect v3 API) with the static service value; Layer.fromEffect
// was removed in v3 (renamed to Layer.effect, which takes an Effect<Service, E, R>).
export const FileServiceLive = Layer.succeed(FileService, {
  readFile: (workspaceId: string, path: string) =>
    invoke<string>("read_file", { workspaceId, path }),

  writeFile: (workspaceId: string, path: string, content: string) =>
    invoke<void>("write_file", { workspaceId, path, content }),

  editFile: (
    workspaceId: string,
    path: string,
    oldText: string,
    newText: string,
    replaceAll: boolean,
  ) =>
    invoke<void>("edit_file", {
      workspaceId,
      path,
      oldText,
      newText,
      replaceAll,
    }),

  searchFiles: (workspaceId: string, glob: string, contentPattern: string | null) =>
    invoke<FileMatch[]>("search_files", {
      workspaceId,
      glob,
      contentPattern,
    }),

  deleteFile: (workspaceId: string, path: string) =>
    invoke<void>("delete_file", { workspaceId, path }),
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
