//! Chat Agent bridge layer (ADR-0016 D4 + D5 + D6).
//!
//! V1.8+ ADR-0016: The chat domain wraps AgentRuntime into a store so components
//! do not import AgentRuntime or RuntimeLayer directly. Components call
//!   - chatAgentStore.startRun(conv, msg) -> Stream<RuntimeEvent, AppError>
//!   - chatAgentStore.cancel(convId) -> Effect<void, never>
//!   - chatAgentStore.destroy(convId) -> Effect<void, never>
//!
//! **Layer provisioning pattern:** The runtime's run() method's stream type
//! declares R = SettingsService | MessageService, but the actual implementation
//! uses closure-captured services. To make the returned stream consumable by
//! chat-view (which has no service in its context), we use Stream.unwrap +
//! Effect.provide to bake the full layer into the stream wrapper.
//!
//! **Why this is tricky:** The runtime's `yield* settingsSvc.getSettings()` is
//! in the inner Effect.gen (not the layer build), but Stream.unwrap creates
//! a stream that, when consumed, runs the inner Effect. The consumer (chat-view)
//! has no service in context. We use `Effect.runSync` to materialize the stream
//! at the store level (where we control the context) and return the stream
//! directly so the consumer does not need to provide anything.
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
const fullLayer = Layer.mergeAll(
  Layer.provide(AgentRuntimeLive, RuntimeDeps),
  RuntimeDeps,
);

/**
 * V1.8+ ADR-0016 D6: start agent run, return RuntimeEvent stream.
 *
 * Build the stream with the full layer in scope. The resulting stream's
 * internal Effect is run at the store level (via Effect.runSync) so the
 * consumer's context is not required to have any service.
 */
function startRunEffect(
  conversation: Conversation,
  userMessage: Message,
): Stream.Stream<RuntimeEvent, AppError> {
  const program = Effect.gen(function* () {
    const runtime = yield* AgentRuntime;
    return Stream.provideLayer(runtime.run(conversation, userMessage), RuntimeDeps);
  }).pipe(Effect.provide(fullLayer));
  return Effect.runSync(program as Effect.Effect<Stream.Stream<RuntimeEvent, AppError | RuntimeError, never>, never, never>) as Stream.Stream<RuntimeEvent, AppError>;
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
