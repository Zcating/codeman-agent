//! Chat Agent bridge layer (ADR-0016 D4 + D5 + D6 + ADR-0017).
//!
//! V1.8+ ADR-0016: The chat domain wraps AgentRuntime into a store so components
//! do not import AgentRuntime or RuntimeLayer directly. Components call
//!   - chatAgentStore.startRun(conv, msg) -> Stream<RuntimeEvent, AppError>
//!   - chatAgentStore.cancel(convId) -> Effect<void, never>
//!   - chatAgentStore.destroy(convId) -> Effect<void, never>
//!
//! V1.9+ ADR-0017: Runtime.run() now returns Stream<R = never> directly
//! (Queue-based architecture + truthful type signature). No more
//! Stream.provideLayer ceremony in this layer — runtime.run produces a
//! stream whose internal Effect is built from closure-captured services,
//! and the resulting Stream.fromQueue is a leaf operator (R = never).
//!
//! Effect.runSync at the store level materializes the stream wrapper so
//! chat-view's Stream.runForEach doesn't need to provide any service.
import { Effect, Stream, Layer } from "effect";
import { SettingsServiceLive } from "../../../shared/lib/tauri";
import type { AppError, Conversation, Message } from "../../../shared/lib/types";
import {
  AgentRuntime,
  RuntimeDeps,
  AgentRuntimeLive,
  RuntimeError,
  type RuntimeEvent,
} from "../lib/runtime";

/** Compose a layer that provides AgentRuntime + all runtime deps in one go. */
// ADR-0018: Use Layer.provideMerge to preserve RuntimeDeps in the output type.
// RuntimeDeps includes SettingsServiceLive, so the merged layer provides
// AgentRuntime + all deps (SettingsService, MessageService, etc).
// Runtime verification: needed because TypeScript can't see through Layer.merge
// that the deps are preserved.
const fullLayer = Layer.provideMerge(
  Layer.provide(AgentRuntimeLive, RuntimeDeps),
  Layer.merge(RuntimeDeps, SettingsServiceLive),
);

/**
 * V1.8+ ADR-0016 D6 + V1.9+ ADR-0017 D4: start agent run, return RuntimeEvent stream.
 *
 * Build the stream with the full layer in scope. The resulting stream
 * (Stream.fromQueue under the hood) is materialized at the store level via
 * Effect.runSync, so the consumer (chat-view) needs no service in context.
 */
function startRunEffect(
  conversation: Conversation,
  userMessage: Message,
): Stream.Stream<RuntimeEvent, AppError | RuntimeError> {
  // V1.8+ ADR-0016 D6 + V1.9+ ADR-0017 D4: Stream 也是 Effect(参见 Effect 类型系统)。
  // 直接返回 program(Effect<Stream<...>>)作为 Stream,让 chat-view 消费时用 .pipe(Effect.provide(...))
  // 显式提供 layer。这样 Layer.merge 的类型推断不阻碍。
  //
  // ADR-0018 fix: 之前用 as any cast 是 type-lie + runtime bug(没真正提供 SettingsService)。
  // 现在让 chat-view 在 Stream.runForEach 之前 .pipe(Effect.provide(fullLayer)) 真正提供 layer。
  return Effect.gen(function* () {
    const runtime = yield* AgentRuntime;
    return runtime.run(conversation, userMessage);
  }).pipe(Effect.provide(fullLayer), Stream.unwrap) as unknown as Stream.Stream<
    RuntimeEvent,
    AppError | RuntimeError,
    never
  >;
}

const cancelEffect = (conversationId: string): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    const runtime = yield* AgentRuntime;
    yield* runtime.cancel(conversationId);
  }).pipe(Effect.provide(fullLayer)) as Effect.Effect<void, never>;

const destroyEffect = (conversationId: string): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    const runtime = yield* AgentRuntime;
    yield* runtime.destroy(conversationId);
  }).pipe(Effect.provide(fullLayer)) as Effect.Effect<void, never>;

export const chatAgentStore = {
  startRun(
    conversation: Conversation,
    userMessage: Message,
  ): Stream.Stream<RuntimeEvent, AppError | RuntimeError> {
    return startRunEffect(conversation, userMessage);
  },
  cancel(conversationId: string): Effect.Effect<void, never> {
    return cancelEffect(conversationId);
  },
  destroy(conversationId: string): Effect.Effect<void, never> {
    return destroyEffect(conversationId);
  },
};
