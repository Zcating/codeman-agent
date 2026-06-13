//! Effect → Solid bridge for messages (with stream integration point).
//!
//! Effect dependencies (consumed via layers, NEVER re-exported):
//! - MessageService (Effect.Context.Tag from src/lib/tauri.ts)
//!
//! UI surface (consumed by Solid components):
//! - messages$: Accessor<Message[]>
//! - loadMessages(conversationId: string): Promise<void>
//! - appendUserMessage(content: string, conversationId: string): Promise<void>
//! - appendAssistantMessageDelta(messageId: string, chunk: string): void
//! - finalizeAssistantMessage(message: Message): void
//! - appendToolCall(messageId: string, toolCall: ToolCall): void
//! - finalizeToolResult(messageId: string, toolCallId: string, result: unknown, error?: string): void
//! - clearMessages(): void

import { createSignal, type Accessor } from "solid-js";
import { Effect, Exit } from "effect";
import { MessageService, MessageServiceLive } from "../../lib/tauri";
import type { Message, ToolCall, ToolResult } from "../../lib/types";

// The runtime layer for the MessageService.
const MessageLayer = MessageServiceLive;

// Signals hold plain data, never Effect instances.
const [messages, setMessages] = createSignal<Message[]>([]);

/** UI-facing accessor. */
export const messages$: Accessor<Message[]> = messages;

/** Load messages for a conversation (called on conversation change). */
export async function loadMessages(conversationId: string): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* MessageService;
    return yield* svc.list(conversationId);
  }).pipe(Effect.provide(MessageLayer));

  const result = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(result)) {
    setMessages(result.value);
  }
}

/** Append a user message and persist via the service. */
export async function appendUserMessage(
  content: string,
  conversationId: string,
): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* MessageService;
    return yield* svc.append({ conversation_id: conversationId, role: "user", content });
  }).pipe(Effect.provide(MessageLayer));

  const result = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(result)) {
    setMessages([...messages(), result.value]);
  }
}

/** Append a streaming delta to an in-progress assistant message (local-only, no IPC). */
export function appendAssistantMessageDelta(messageId: string, chunk: string): void {
  setMessages(
    messages().map((m) =>
      m.id === messageId ? { ...m, content: m.content + chunk } : m
    )
  );
}

/** Replace an in-progress assistant message with the final persisted one. */
export function finalizeAssistantMessage(message: Message): void {
  setMessages(messages().map((m) => (m.id === message.id ? message : m)));
}

/** Append a tool call to a message (local-only). */
export function appendToolCall(messageId: string, toolCall: ToolCall): void {
  setMessages(
    messages().map((m) => {
      if (m.id !== messageId) return m;
      const existing = m.tool_calls ?? [];
      return { ...m, tool_calls: [...existing, toolCall] };
    })
  );
}

/** Finalize a tool result on a message (local-only). */
export function finalizeToolResult(
  messageId: string,
  toolCallId: string,
  result: unknown,
  error?: string,
): void {
  setMessages(
    messages().map((m) => {
      if (m.id !== messageId) return m;
      const existing = m.tool_results ?? [];
      const entry: ToolResult =
        error !== undefined
          ? { tool_call_id: toolCallId, result, error }
          : { tool_call_id: toolCallId, result, error: null };
      return { ...m, tool_results: [...existing, entry] };
    })
  );
}

/** Reset messages (e.g., on conversation switch before load completes). */
export function clearMessages(): void {
  setMessages([]);
}

// Insert a streaming assistant message stub (local-only, no IPC).
export function appendStreamingAssistantMessage(
  messageId: string,
  conversationId: string,
): void {
  const stub: Message = {
    id: messageId,
    conversation_id: conversationId,
    role: "assistant",
    content: "",
    tool_calls: null,
    tool_results: null,
    model: null,
    input_tokens: null,
    output_tokens: null,
    created_at: Date.now(),
  };
  setMessages([...messages(), stub]);
}