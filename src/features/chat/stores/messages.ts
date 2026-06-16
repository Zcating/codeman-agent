//! Effect → Solid 消息桥接层（带 stream 集成点）。
//!
//! 桥接函数返回 Promise，绝不是 Effect，因此 Solid 组件
//! 依据 AGENTS.md 保持无 Effect。
//
//! UI surface (consumed by Solid components):
//! - messages$: Accessor<Message[]>
//! - loadMessages(conversationId: string): Promise<void>
//! - appendUserMessage(content: string, conversationId: string): Promise<void>
//! - appendAssistantMessageDelta(messageId: string, chunk: string): void
//! - finalizeAssistantMessage(message: Message): void
//! - appendToolCall(messageId: string, toolCall: ToolCall): void
//! - finalizeToolResult(messageId: string, toolCallId: string, result: unknown, error?: string): void
//! - clearMessages(): void
//! - runConversationStream(conversation, userMessage, callbacks): Promise<void>

import { createSignal, type Accessor } from "solid-js";
import { Effect, Exit, Stream } from "effect";
import { MessageService, MessageServiceLive, SettingsServiceLive } from "../../../shared/lib/tauri";
import { AgentRuntime, RuntimeLayer, type RuntimeEvent } from "../lib/runtime";
import type { Message, ToolCall, ToolResult, Conversation } from "../../../shared/lib/types";

// MessageService 的 runtime layer。
const MessageLayer = MessageServiceLive;

// Signals 持有纯数据，绝不是 Effect 实例。
const [messages, setMessages] = createSignal<Message[]>([]);

/** UI 暴露的访问器。 */
export const messages$: Accessor<Message[]> = messages;

/** 为会话加载消息（在会话变更时调用）。 */
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

/** 追加用户消息并通过服务持久化。 */
export async function appendUserMessage(content: string, conversationId: string): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* MessageService;
    return yield* svc.append({ conversation_id: conversationId, role: "user", content });
  }).pipe(Effect.provide(MessageLayer));

  const result = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(result)) {
    setMessages([...messages(), result.value]);
  }
}

/** 追加流式增量到进行中的 assistant 消息（仅本地，无 IPC）。 */
export function appendAssistantMessageDelta(messageId: string, chunk: string): void {
  setMessages(
    messages().map((m) => (m.id === messageId ? { ...m, content: m.content + chunk } : m)),
  );
}

/** 用最终持久化的消息替换进行中的 assistant 消息。 */
export function finalizeAssistantMessage(message: Message): void {
  setMessages(messages().map((m) => (m.id === message.id ? message : m)));
}

/** 追加工具调用到消息（仅本地）。 */
export function appendToolCall(messageId: string, toolCall: ToolCall): void {
  setMessages(
    messages().map((m) => {
      if (m.id !== messageId) return m;
      const existing = m.tool_calls ?? [];
      return { ...m, tool_calls: [...existing, toolCall] };
    }),
  );
}

/** 完成消息上的工具结果（仅本地）。 */
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
    }),
  );
}

/** 重置消息（例如：在会话切换时 load 完成前）。 */
export function clearMessages(): void {
  setMessages([]);
}

// 插入流式 assistant 消息存根（仅本地，无 IPC）。
export function appendStreamingAssistantMessage(messageId: string, conversationId: string): void {
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

export type StreamCallbacks = {
  onToken: (content: string) => void;
  onToolCall: (toolCall: ToolCall) => void;
  onToolResult: (toolCallId: string, result: unknown, error?: string) => void;
  onDone: (message: Message) => void;
  onError: (error: { message: string }) => void;
};

export async function runConversationStream(
  conversation: Conversation,
  userMessage: Message,
  callbacks: StreamCallbacks,
): Promise<void> {
  const processEvent = (evt: RuntimeEvent) =>
    Effect.promise(async () => {
      switch (evt.type) {
        case "token":
          callbacks.onToken(evt.content);
          break;
        case "tool_call":
          callbacks.onToolCall(evt.toolCall);
          break;
        case "tool_result":
          callbacks.onToolResult(evt.toolCallId, evt.result, evt.error);
          break;
        case "done":
          callbacks.onDone(evt.message);
          break;
        case "error":
          callbacks.onError(evt.error);
          break;
      }
    });

  const program = Effect.gen(function* () {
    const runtime = yield* AgentRuntime;
    yield* Stream.runForEach(runtime.run(conversation, userMessage), processEvent);
  }).pipe(Effect.provide(RuntimeLayer), Effect.provide(SettingsServiceLive));

  await Effect.runPromise(program);
}
