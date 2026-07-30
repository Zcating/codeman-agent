import { Effect, Context, Layer } from "effect";
import type { Conversation } from "../lib/types";
import type { AppError } from "@codeman-frontend/shared/lib/errors";
import { invoke } from "./invoke.api";

export class ConversationApi extends Context.Tag("ConversationApi")<
  ConversationApi,
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
    readonly rename: (id: string, title: string) => Effect.Effect<void, AppError>;
  }
>() {}

export const ConversationApiLive = Layer.succeed(ConversationApi, {
  list: (includeArchived) => invoke<Conversation[]>("listConversations", { includeArchived }),
  get: (id) => invoke<Conversation>("getConversation", { id }),
  create: (title, systemPrompt, workspaceId) =>
    invoke<Conversation>("createConversation", { title, systemPrompt, workspaceId }),
  archive: (id) => invoke<void>("archiveConversation", { id }),
  delete: (id) => invoke<void>("deleteConversation", { id }),
  rename: (id, title) => invoke<void>("renameConversation", { id, title }),
});
