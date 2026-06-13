//! Effect → Solid bridge for agent runtime.
//!
//! UI components call these plain async functions instead of importing
//! 'effect' directly. The bridge handles all Effect plumbing internally.
//!
//! Effect dependencies (consumed via layers, NEVER re-exported):
//! - AgentRuntime + AgentRuntimeLive (from src/agent/runtime)
//! - LLMProviderService + LLMProviderServiceLive (from src/agent/settings/llm_providers)
//! - SettingsService + SettingsServiceLive (from src/lib/tauri)

import { Effect, Exit, Stream } from "effect";
import { AgentRuntime, RuntimeLayer } from "../runtime";
import type { Conversation, Message, ToolCall } from "../../lib/types";

// ─── Types ───────────────────────────────────────────────────────────

export type AgentCallbacks = {
  onToken: (content: string) => void;
  onToolCall: (toolCall: ToolCall) => void;
  onToolResult: (id: string, result: unknown, error?: string) => void;
  onDone: (msg: Message) => void;
  onError: (err: { message: string }) => void;
};

// ─── Agent runtime bridge ───────────────────────────────────────────

/** Run the agent on a conversation + user message. Streams events via callbacks. */
export async function runAgent(
  conversation: Conversation,
  userMessage: Message,
  callbacks: AgentCallbacks,
): Promise<void> {
  const program = Effect.gen(function* () {
    const runtime = yield* AgentRuntime;
    yield* Stream.runForEach(runtime.run(conversation, userMessage), (evt) => {
      switch (evt.type) {
        case "token":        callbacks.onToken(evt.content); break;
        case "tool_call":     callbacks.onToolCall(evt.toolCall); break;
        case "tool_result":   callbacks.onToolResult(evt.toolCallId, evt.result, evt.error); break;
        case "done":          callbacks.onDone(evt.message); break;
        case "error":         callbacks.onError(evt.error); break;
      }
      return Effect.succeed(undefined);
    });
  }).pipe(Effect.provide(RuntimeLayer));

  const result = await Effect.runPromiseExit(program);
  if (!Exit.isSuccess(result)) {
    callbacks.onError({ message: String(result.cause) });
  }
}

/** Cancel the current run (best-effort). */
export async function cancelAgent(): Promise<void> {
  const program = Effect.gen(function* () {
    const runtime = yield* AgentRuntime;
    yield* runtime.cancel();
  }).pipe(Effect.provide(RuntimeLayer));
  await Effect.runPromise(program);
}
