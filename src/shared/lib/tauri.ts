//! Effect-TS IPC 层 — 所有命令都经过这里。
//! Services 是 Effect.Context.Tag 类；UI 从
//! `src/agent/store/*.ts`（桥接层）导入，**永不**直接从这里导入。
//!
//! Effect 签名：
//!   invoke<T>(name, args): Effect<T, AppError>
//!   ConversationService.list(includeArchived): Effect<Conversation[], AppError>
//!   MessageService.list(conversationId): Effect<Message[], AppError>
//!   (BillingService + SettingsService 暂存根 — Task 21)

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
} from "../types";

/** 包装在 Effect 中的原始 Tauri invoke。 */
export const invoke = <T>(
  name: string,
  args?: Record<string, unknown>,
): Effect.Effect<T, AppError> =>
  Effect.tryPromise({
    try: () => tauriInvoke<T>(name, args),
    catch: (e) => ({ kind: "Unknown" as const, message: String(e) }),
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
      conversation_id: string;
      role: string;
      content: string;
      tool_calls?: string;
      tool_results?: string;
      model?: string;
      input_tokens?: number;
      output_tokens?: number;
    }) => Effect.Effect<Message, AppError>;
    readonly search: (query: string, limit: number) => Effect.Effect<Message[], AppError>;
  }
>() {}

export class BillingService extends Context.Tag("BillingService")<
  BillingService,
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

// ─── Live layers（暂存根：每个服务方法以 NotFound 失败） ─
// 由 Tasks 14 (Conversation/Message) 和 21 (Settings) 填充。
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
export const BillingServiceLive = Layer.succeed(BillingService, {
  listProviders: () => Effect.fail({ kind: "NotFound", message: "stub" } as AppError),
  getSnapshot: () => Effect.fail({ kind: "NotFound", message: "stub" } as AppError),
  hasKey: () => Effect.fail({ kind: "NotFound", message: "stub" } as AppError),
  setKey: () => Effect.fail({ kind: "NotFound", message: "stub" } as AppError),
});
export const SettingsServiceLive = Layer.succeed(SettingsService, {
  getSettings: () => invoke<Settings>("get_settings"),
  updateSettings: (patch) => invoke<Settings>("update_settings", { new_settings: patch }),
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
