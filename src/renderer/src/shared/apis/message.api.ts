
import { Effect, Context, Layer } from "effect";
import type { Message } from "../lib/types";
import type { AppError } from "@codeman-frontend/shared/lib/errors";
import { invoke } from "./invoke.api";

export class MessageApi extends Context.Tag("MessageApi")<
  MessageApi,
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

export const MessageApiLive = Layer.succeed(MessageApi, {
  list: (conversationId) => invoke<Message[]>("listMessages", { conversationId }),
  append: (args) => invoke<Message>("appendMessage", args),
  search: (query, limit) => invoke<Message[]>("searchMessages", { query, limit }),
});
