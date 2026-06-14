//! Effect → Solid bridge for conversations.
//!
//! Effect dependencies (consumed via layers, NEVER re-exported):
//! - ConversationService (Effect.Context.Tag from src/shared/lib/tauri.ts)
//!
//! UI surface (consumed by Solid components):
//! - conversations: Accessor<Conversation[]> — current list
//! - activeId: Accessor<string | null> — selected conversation id
//! - createConversation(): Promise<void>
//! - selectConversation(id: string): void
//! - archiveConversation(id: string): Promise<void>
//! - deleteConversation(id: string): Promise<void>

import { createSignal, type Accessor } from "solid-js";
import { Effect, Exit } from "effect";
import { ConversationService, ConversationServiceLive } from "../../../shared/lib/tauri";
import type { Conversation } from "../../../shared/types";

// The runtime layer for the ConversationService. In a fuller implementation,
// this would be composed with other service layers in an app-level layer.
const ConversationLayer = ConversationServiceLive;

// Signals hold plain data, never Effect instances.
const [conversations, setConversations] = createSignal<Conversation[]>([]);
const [activeId, setActiveId] = createSignal<string | null>(null);

/** Initial load: fetch all (non-archived) conversations from the service. */
export async function loadConversations(includeArchived = false): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* ConversationService;
    return yield* svc.list(includeArchived);
  }).pipe(Effect.provide(ConversationLayer));

  const result = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(result)) {
    setConversations(result.value);
  }
}

/** UI-facing accessor. */
export const conversations$: Accessor<Conversation[]> = conversations;

/** UI-facing accessor for the active conversation id. */
export const activeId$: Accessor<string | null> = activeId;

/** Create a new conversation, refresh list on success. */
export async function createConversation(title: string, systemPrompt?: string): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* ConversationService;
    return yield* svc.create(title, systemPrompt);
  }).pipe(Effect.provide(ConversationLayer));

  const result = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(result)) {
    setActiveId(result.value.id);
    await loadConversations();
  }
}

/** Select a conversation (UI-only; no IPC). */
export function selectConversation(id: string): void {
  setActiveId(id);
}

/** Archive (soft-delete) a conversation. */
export async function archiveConversation(id: string): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* ConversationService;
    yield* svc.archive(id);
  }).pipe(Effect.provide(ConversationLayer));

  const result = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(result)) {
    if (activeId() === id) setActiveId(null);
    await loadConversations();
  }
}

/** Hard-delete a conversation. */
export async function deleteConversation(id: string): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* ConversationService;
    yield* svc.delete(id);
  }).pipe(Effect.provide(ConversationLayer));

  const result = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(result)) {
    if (activeId() === id) setActiveId(null);
    await loadConversations();
  }
}
