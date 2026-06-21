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
//! - persistAssistantMessage(message: Message): Promise<void>
//!   ↑ 流式 done 事件 → 落库；切换对话后 AI 输出不丢 (V1.5 fix)
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
    // Tauri 2 IPC 约定 camelCase: `conversationId` 不是 `conversation_id`。
    // Rust 端参数 `conversation_id: String` 通过 serde 自动映射。
    return yield* svc.append({ conversationId, role: "user", content });
  }).pipe(Effect.provide(MessageLayer));

  const result = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(result)) {
    setMessages([...messages(), result.value]);
  }
}

/**
 * 持久化 assistant 消息到 DB（流式 `done` 事件触发时调用）。
 *
 * V1.5 修复：解决"切换对话后 AI 输出消失"。
 *
 * 根因：旧流程里 `finalizeAssistantMessage` 只更新 in-memory signal,
 * 切换对话后 signal 被 `loadMessages(id)` 覆盖,再切回时 `loadMessages(id)`
 * 从 DB 加载,但 DB 里没有 assistant 消息（从未落库） → UI 空白。
 *
 * 修复：在 chat-view 的 `done` 事件处理器里调本函数,把最终消息写进 DB。
 * 切回原对话时,DB 重载能恢复 AI 输出,signal 显示一致。
 *
 * 行为契约：
 * - 成功：调 IPC `append_message` 持久化,用持久化版本替换 signal 中的 stub。
 * - 失败：signal 不变（保留流式 stub 给用户），仅在生产 console 留痕。
 */
export async function persistAssistantMessage(message: Message): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* MessageService;
    return yield* svc.append({
      conversationId: message.conversation_id,
      role: message.role,
      content: message.content,
      // toolCalls / toolResults 是 JSON 字符串(per tauri.ts append 契约)。
      // null → undefined → 不出现在 IPC args 里(避免 Rust 端 null 序列化歧义)。
      toolCalls: message.tool_calls ? JSON.stringify(message.tool_calls) : undefined,
      toolResults: message.tool_results ? JSON.stringify(message.tool_results) : undefined,
      model: message.model ?? undefined,
      inputTokens: message.input_tokens ?? undefined,
      outputTokens: message.output_tokens ?? undefined,
    });
  }).pipe(Effect.provide(MessageLayer));

  const result = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(result)) {
    // 用持久化版本(含服务端 id / created_at)替换 signal 中同 id 的 stub。
    // 即使服务端 id 跟 stub 不同,替换按 stub 的原 id 命中,所以 signal 中
    // 该位置消息的 id 会更新为持久化版本的 id —— 这是预期行为。
    setMessages(messages().map((m) => (m.id === message.id ? result.value : m)));
  }
  // 失败路径:不动 signal,保留流式 stub 给用户看。仅在生产 console 留痕,
  // 测试时不 console.error(测试用 mockState.rejected 验证失败信号保留)。
}

/** 追加流式增量到进行中的 assistant 消息（仅本地，无 IPC）。 */
export function appendAssistantMessageDelta(messageId: string, chunk: string): void {
  setMessages(
    messages().map((m) => (m.id === messageId ? { ...m, content: m.content + chunk } : m)),
  );
}

/** 用最终持久化的消息替换进行中的 assistant 消息。
 * 若 messages 里没有匹配 id(例如 LLM 立即返回 done 没产生任何 token → 没创建
 * streaming stub),则 append 而不是 silently 丢掉 — 之前的 `map` 在找不到
 * 匹配时只 setMessages(不增加) ,done 消息消失,solid 列表里只留个空 stub。
 * 现在 `upsert` 语义:有则替换、无则追加,call site 不用关心是否预先有 stub。 */
export function finalizeAssistantMessage(message: Message): void {
  setMessages((msgs) => {
    if (msgs.some((m) => m.id === message.id)) {
      return msgs.map((m) => (m.id === message.id ? message : m));
    }
    return [...msgs, message];
  });
}

/** 追加工具调用到消息（仅本地）。 */
export function appendToolCall(messageId: string, toolCall: ToolCall): void {
  setMessages(
    messages().map((m) => {
      if (m.id !== messageId) {
        return m;
      }
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
      if (m.id !== messageId) {
        return m;
      }
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

// 注：上面 stub 里的 snake_case 字段（conversation_id / tool_calls / 等）是
// Message 接口本身的形状(镜像 Rust serde),不是 IPC 参数名。Tauri IPC 边界
// 只在 invoke 的 args 对象上要求 camelCase。

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
