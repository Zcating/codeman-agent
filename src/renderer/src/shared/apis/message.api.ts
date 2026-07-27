// MessageService - rendered MessageService Tag + Live Layer for message domain IPC.
import { Effect, Context, Layer } from "effect";
import type { Message } from "../lib/types";
import type { AppError } from "@codeman-frontend/shared/lib/errors";
import { invoke } from "./invoke.api";

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

export const MessageServiceLive = Layer.succeed(MessageService, {
  list: (conversationId) => invoke<Message[]>("listMessages", { conversationId }),
  append: (args) => invoke<Message>("appendMessage", args),
  search: (query, limit) => invoke<Message[]>("searchMessages", { query, limit }),
});
