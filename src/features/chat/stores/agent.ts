//! Chat Agent 桥接层 (ADR-0016 D4 + D5 + D6).
//!
//! 把 `AgentRuntime` 的 service 操作包成 chat 域 store method,
//! 组件层不再 import `AgentRuntime` / `RuntimeLayer`,只 import `chatAgentStore`。
//!
//! D6: 沿用 `AgentRuntime.run` 已有的 Stream 形态 (`Stream<RuntimeEvent, AppError, ...>`),
//! store 层只 wrap 一次 + bake `RuntimeLayer` 提供。组件用 `Stream.runForEach` 接 event handler。

import { Effect, Stream } from "effect";
import type { AppError, Conversation, Message } from "../../../shared/lib/types";
import { AgentRuntime, RuntimeLayer, type RuntimeEvent } from "../lib/runtime";

/**
 * V1.8+ ADR-0016 D6: 启动 agent run，返回 RuntimeEvent 流。
 * 组件: `Stream.runForEach(chatAgentStore.startRun(conv, msg), (event) => Effect.gen(...))`
 */
function startRunEffect(
  conversation: Conversation,
  userMessage: Message,
): Stream.Stream<RuntimeEvent, AppError> {
  return Stream.unwrap(
    Effect.gen(function* () {
      const runtime = yield* AgentRuntime;
      return runtime.run(conversation, userMessage);
    }).pipe(Effect.provide(RuntimeLayer)),
  ) as Stream.Stream<RuntimeEvent, AppError>;
}

/** V1.8+ ADR-0016 D4 + D5: cancel 按 convId 路由。 */
const cancelEffect = (conversationId: string): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    const runtime = yield* AgentRuntime;
    yield* runtime.cancel(conversationId);
  }).pipe(Effect.provide(RuntimeLayer)) as Effect.Effect<void, never>;

/** V1.8+ ADR-0016 D4 + D5: 从 per-conv Agent Map 移除。 */
const destroyEffect = (conversationId: string): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    const runtime = yield* AgentRuntime;
    yield* runtime.destroy(conversationId);
  }).pipe(Effect.provide(RuntimeLayer)) as Effect.Effect<void, never>;

export const chatAgentStore = {
  /**
   * D6: 启动 run，返回 RuntimeEvent 流。组件用 `Stream.runForEach` 接 event handler。
   */
  startRun(
    conversation: Conversation,
    userMessage: Message,
  ): Stream.Stream<RuntimeEvent, AppError> {
    return startRunEffect(conversation, userMessage);
  },

  /** D4 + D5: cancel 按 convId 路由。不存在的 convId 静默 no-op。 */
  cancel(conversationId: string): Effect.Effect<void, never> {
    return cancelEffect(conversationId);
  },

  /** D4 + D5: 从 per-conv Agent Map 移除。archive/delete conversation 前调用。 */
  destroy(conversationId: string): Effect.Effect<void, never> {
    return destroyEffect(conversationId);
  },
};
