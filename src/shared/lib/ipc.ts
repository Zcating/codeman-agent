//! V3 IPC layer — Electron preload's `window.codeman` is the IPC source.
//!
//! Per V3 consensus 1.3 (shim approach): this file is the canonical IPC.
//! `tauri.ts` is a 3-line re-export shim so existing 50+ imports of
//! `@/shared/lib/tauri` keep working without churn.
//!
//! T5 changes from tauri.ts:
//! - `invoke<T>()` no longer calls `@tauri-apps/api/core` `invoke`
//! - It dispatches to `window.codeman.<method>` (set by electron/preload)
//! - On test/jsdom, vitest's mock at `src/__mocks__/@tauri-apps/api/core.ts`
//!   populates `window.codeman` with vi.fn()s; the dispatch routes to those.

import { Effect, Stream, Context, Layer } from "effect";
import { logger } from "./logger";
import { Unknown, type AppError } from "./errors";
import { decodeAppError } from "./decode-app-error";
import type {
  Conversation,
  Message,
  Settings,
  LLMProvider,
  Provider,
  ModelMeta,
  FileMatch,
} from "./types";

/** Tauri-Electron IPC error - distinct from AppError for service-specific error handling */
export interface TauriError {
  readonly kind: "IPC";
  readonly message: string;
}

export const TauriError = {
  IPC: (message: string): TauriError => ({ kind: "IPC" as const, message }),
};

/** Shape of preload-exposed API (mirrors electron/preload/index.ts) */
export interface CodemanApi {
  getSettings: () => Promise<unknown>;
  updateSettings: (newSettings: unknown) => Promise<unknown>;
  clearAllHistory: () => Promise<unknown>;
  listConversations: (includeArchived: boolean) => Promise<unknown>;
  getConversation: (id: string) => Promise<unknown>;
  createConversation: (args: unknown) => Promise<unknown>;
  archiveConversation: (id: string) => Promise<unknown>;
  deleteConversation: (id: string) => Promise<unknown>;
  listMessages: (conversationId: string) => Promise<unknown>;
  appendMessage: (args: unknown) => Promise<unknown>;
  searchMessages: (query: string, limit: number) => Promise<unknown>;
  listWorkspaces: () => Promise<unknown>;
  addWorkspace: (label: string, rootPath: string) => Promise<unknown>;
  renameWorkspace: (id: string, label: string) => Promise<unknown>;
  deleteWorkspace: (id: string) => Promise<unknown>;
  pickWorkspacePath: () => Promise<unknown>;
  /**
   * V3+ ADR-0023 D8-W: 删除 provider（注意：当前 Electron 后端未实现，
   * ProviderService.delete 仍会触发 IPC 失败 — 由 mapError 转 AppError）。
   * 留此声明是为 renderer/preload 类型一致，避免 dispatchInvoke 命中 default 抛 Unknown。
   */
  deleteProvider: (id: string) => Promise<unknown>;
  readFile: (workspaceId: string, path: string) => Promise<unknown>;
  writeFile: (workspaceId: string, path: string, content: string) => Promise<unknown>;
  editFile: (
    workspaceId: string,
    path: string,
    oldText: string,
    newText: string,
    replaceAll: boolean,
  ) => Promise<unknown>;
  searchFiles: (
    workspaceId: string,
    glob: string,
    contentPattern: string | null,
  ) => Promise<unknown>;
  deleteFile: (workspaceId: string, path: string) => Promise<unknown>;
  notify: (title: string, body: string) => Promise<unknown>;
  openExternal: (url: string) => Promise<unknown>;
  setLoginItem: (enabled: boolean) => Promise<unknown>;
  getLogPath: () => Promise<unknown>;
  onStreamChunk: (handler: (evt: unknown) => void) => () => void;
}

declare global {
  // eslint-disable-next-line no-var
  var codeman: CodemanApi | undefined;
}

function api(): CodemanApi {
  if (typeof window === "undefined" || !window.codeman) {
    throw new Error(
      "[ipc.ts] window.codeman not available — preload not loaded?",
    );
  }
  return window.codeman;
}

/**
 * Dispatch IPC command to the appropriate window.codeman method.
 * Mirrors the channel name → method mapping in electron/main/ipc.ts.
 */
async function dispatchInvoke<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const a = api();
  const arg = (k: string) => args?.[k];
  switch (name) {
    case "get_settings":
      return (await a.getSettings()) as T;
    case "update_settings":
      return (await a.updateSettings(arg("newSettings") ?? arg("new_settings"))) as T;
    case "clear_all_history":
      return (await a.clearAllHistory()) as T;
    case "list_conversations":
      return (await a.listConversations(!!arg("includeArchived"))) as T;
    case "get_conversation":
      return (await a.getConversation(arg("id") as string)) as T;
    case "create_conversation":
      return (await a.createConversation(args)) as T;
    case "archive_conversation":
      return (await a.archiveConversation(arg("id") as string)) as T;
    case "delete_conversation":
      return (await a.deleteConversation(arg("id") as string)) as T;
    case "list_messages":
      return (await a.listMessages(arg("conversationId") as string)) as T;
    case "append_message":
      return (await a.appendMessage(args)) as T;
    case "search_messages":
      return (await a.searchMessages(arg("query") as string, arg("limit") as number)) as T;
    case "list_workspaces":
      return (await a.listWorkspaces()) as T;
    case "add_workspace":
      return (await a.addWorkspace(arg("label") as string, arg("root_path") as string)) as T;
    case "rename_workspace":
      return (await a.renameWorkspace(arg("id") as string, arg("label") as string)) as T;
    case "delete_workspace":
      return (await a.deleteWorkspace(arg("id") as string)) as T;
    case "pick_workspace_path":
      return (await a.pickWorkspacePath()) as T;
    case "delete_provider":
      return (await a.deleteProvider(arg("id") as string)) as T;
    case "read_file":
      return (await a.readFile(arg("workspaceId") as string, arg("path") as string)) as T;
    case "write_file":
      return (await a.writeFile(arg("workspaceId") as string, arg("path") as string, arg("content") as string)) as T;
    case "edit_file":
      return (await a.editFile(
        arg("workspaceId") as string,
        arg("path") as string,
        arg("oldText") as string,
        arg("newText") as string,
        !!arg("replaceAll"),
      )) as T;
    case "search_files":
      return (await a.searchFiles(
        arg("workspaceId") as string,
        arg("glob") as string,
        (arg("contentPattern") as string | null) ?? null,
      )) as T;
    case "delete_file":
      return (await a.deleteFile(arg("workspaceId") as string, arg("path") as string)) as T;
    default:
      throw new Unknown({ message: `Unknown IPC: ${name}` });
  }
}

/**
 * Wrap an IPC command in an Effect that maps errors to AppError.
 * Preserves upstream AppError shape (when the error has a `kind` field,
 * e.g. SandboxViolation / NotFound from main process), otherwise logs and
 * falls back to Unknown. Sandbox errors are NOT logged as noise — UI
 * (tool_call_card) renders their detail.
 */
export const invoke = <T>(
  name: string,
  args?: Record<string, unknown>,
): Effect.Effect<T, AppError> =>
  Effect.tryPromise({
    try: () => dispatchInvoke<T>(name, args),
    catch: (e) => {
      // AppError from main process is encoded as JSON in Error.message
      // (electron/main/ipc.ts sandboxHandler wraps AppError plain objects).
      // However, Electron's ipcMain.handle re-wraps the Error, so the renderer
      // sees: `Error: Error invoking remote method 'X': Error: {"kind":"...","message":"..."}`.
      // We need to extract the JSON from the doubly-wrapped message.
      if (e instanceof Error) {
        const msg = e.message;
        // Look for the last `{...}` in the message chain (the inner JSON payload).
        const braceStart = msg.lastIndexOf("{");
        if (braceStart !== -1) {
          try {
            const candidate = msg.slice(braceStart);
            const parsed = JSON.parse(candidate) as Record<string, unknown>;
            if (parsed && typeof parsed === "object" && "kind" in parsed) {
              return decodeAppError(parsed);
            }
          } catch { /* not our JSON — fall through */ }
        }
        // Also try parsing the whole message as JSON (pre-wrap case).
        try {
          const parsed = JSON.parse(msg) as Record<string, unknown>;
          if (parsed && typeof parsed === "object" && "kind" in parsed) {
            return decodeAppError(parsed);
          }
        } catch { /* nope */ }
      }
      if (e && typeof e === "object" && ("kind" in e || "_tag" in e)) {
        return decodeAppError(e);
      }
      logger.error("IPC 调用失败", name, e);
      return new Unknown({ message: String(e) });
    },
  });

/**
 * Stream consumer — wraps window.codeman.onStreamChunk in an Effect Stream.
 * Used by chat store to subscribe to pi-mono agent events from main process.
 * Per V3 consensus 1.1: main process owns the pi-mono subscription; this
 * Stream just adapts the preload callback API to Effect's Stream type.
 */
export const streamChunks: Stream.Stream<unknown, never, never> = Stream.async<unknown>(
  (emit) => {
    const unsubscribe = api().onStreamChunk((evt) => emit.single(evt));
    return Effect.sync(() => unsubscribe());
  },
);

// ─── Service tags (mirror of tauri.ts so consumers can use either import path) ─

export class ConversationService extends Context.Tag("ConversationService")<
  ConversationService,
  {
    readonly list: (includeArchived: boolean) => Effect.Effect<Conversation[], AppError>;
    readonly get: (id: string) => Effect.Effect<Conversation, AppError>;
    readonly create: (
      title: string,
      systemPrompt: string | null,
      workspaceId: string,
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
      conversationId: string;
      role: string;
      content: string;
      thinking?: string;
      toolCalls?: string;
      toolResults?: string;
      model?: string;
      inputTokens?: number;
      outputTokens?: number;
    }) => Effect.Effect<Message, AppError>;
    readonly search: (query: string, limit: number) => Effect.Effect<Message[], AppError>;
  }
>() {}

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

export class SettingsService extends Context.Tag("SettingsService")<
  SettingsService,
  {
    readonly getSettings: () => Effect.Effect<Settings, AppError>;
    readonly updateSettings: (patch: unknown) => Effect.Effect<Settings, AppError>;
    readonly clearAllHistory: () => Effect.Effect<void, AppError>;
    readonly getActiveLlmProvider: () => Effect.Effect<LLMProvider | null, AppError>;
  }
>() {}

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
    readonly searchFiles: (
      workspaceId: string,
      glob: string,
      contentPattern: string | null,
    ) => Effect.Effect<FileMatch[], AppError>;
    readonly deleteFile: (workspaceId: string, path: string) => Effect.Effect<void, AppError>;
  }
>() {}

// ─── Live layers (use the local invoke) ─────────────────────────

export const ConversationServiceLive = Layer.succeed(ConversationService, {
  list: (includeArchived) => invoke<Conversation[]>("list_conversations", { includeArchived }),
  get: (id) => invoke<Conversation>("get_conversation", { id }),
  create: (title, systemPrompt, workspaceId) =>
    invoke<Conversation>("create_conversation", { title, systemPrompt, workspaceId }),
  archive: (id) => invoke<void>("archive_conversation", { id }),
  delete: (id) => invoke<void>("delete_conversation", { id }),
});

export const MessageServiceLive = Layer.succeed(MessageService, {
  list: (conversationId) => invoke<Message[]>("list_messages", { conversationId }),
  append: (args) => invoke<Message>("append_message", args),
  search: (query, limit) => invoke<Message[]>("search_messages", { query, limit }),
});

// ProviderService uses settings.providers (V1.5 unified schema) — calls
// get_settings via the codeman dispatch.
export const ProviderServiceLive = Layer.effect(
  ProviderService,
  Effect.gen(function* () {
    const getProviders = Effect.tryPromise({
      try: () =>
        dispatchInvoke<{ providers: Provider[] }>("get_settings").then(
          (s) => s.providers ?? [],
        ),
      catch: (e) => TauriError.IPC(String(e)),
    });

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
            return yield* Effect.fail(
              TauriError.IPC(`No models_endpoint for provider: ${id}`),
            );
          }
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

      delete: (id) =>
        Effect.tryPromise({
          try: () =>
            dispatchInvoke<void>("delete_provider", { id }).catch(() => undefined),
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
        (() => {
          const p = (settings.providers ?? []).find(
            (p) => p.id === id && p.enabled,
          );
          if (!p || !p.llm) return null;
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

export const SettingsServiceImpl = {
  getSettings: () => invoke<Settings>("get_settings"),
  updateSettings: (patch: unknown) =>
    invoke<Settings>("update_settings", { newSettings: patch }),
  clearAllHistory: () => invoke<void>("clear_all_history"),
  getActiveLlmProvider: () =>
    Effect.gen(function* () {
      const settings = yield* invoke<Settings>("get_settings");
      const id = settings.default_llm_provider_id;
      if (!id) {
        return yield* Effect.succeed(null);
      }
      return yield* Effect.succeed(
        (() => {
          const p = (settings.providers ?? []).find(
            (p) => p.id === id && p.enabled,
          );
          if (!p || !p.llm) return null;
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

// ─── Bridge functions (Promise-based, for Solid UI) ─────────────

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
