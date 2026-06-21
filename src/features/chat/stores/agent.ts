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
import type { AppError, Conversation, Message } from "../../../shared/lib/types";
import {
  AgentRuntime,
  RuntimeDeps,
  AgentRuntimeLive,
  RuntimeError,
  type RuntimeEvent,
} from "../lib/runtime";

/** Compose a layer that provides AgentRuntime + all runtime deps in one go. */
const fullLayer = Layer.mergeAll(Layer.provide(AgentRuntimeLive, RuntimeDeps), RuntimeDeps);

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
): Stream.Stream<RuntimeEvent, AppError> {
  const program = Effect.gen(function* () {
    const runtime = yield* AgentRuntime;
    // ADR-0017 D4: runtime.run() 内部已 R = never,不再需要 Stream.provideLayer
    // —— 那是为了消除 type-lie (declared R = SettingsService | MessageService
    // 但实际 R = never) 的临时性 workaround。现在 declared R 也是 never,Stream
    // 本来就不需要 service。
    return runtime.run(conversation, userMessage);
  }).pipe(Effect.provide(fullLayer));
  return Effect.runSync(
    program as Effect.Effect<
      Stream.Stream<RuntimeEvent, AppError | RuntimeError, never>,
      never,
      never
    >,
  ) as Stream.Stream<RuntimeEvent, AppError>;
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
  ): Stream.Stream<RuntimeEvent, AppError> {
    return startRunEffect(conversation, userMessage);
  },
  cancel(conversationId: string): Effect.Effect<void, never> {
    return cancelEffect(conversationId);
  },
  destroy(conversationId: string): Effect.Effect<void, never> {
    return destroyEffect(conversationId);
  },
};
