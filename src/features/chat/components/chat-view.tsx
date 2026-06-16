//! ChatView — 消息列表 + 输入框 + stream 订阅。
//!
//! 代理 UI 的核心组件。订阅 AgentRuntime.run()
//! 并将 RuntimeEvents 转换为 UI 更新。
//! Polish F2/F4/F6/F8: 中文 placeholder + 思考 loading + 5 原子 (Button / Textarea) + aria-label。

import { createSignal, createEffect, For, Show, onCleanup } from "solid-js";
import { Effect, Exit, Stream } from "effect";
import { Send, X } from "lucide-solid";
import { MessageBubble } from "./message-bubble";
import {
  messages$,
  loadMessages,
  appendUserMessage,
  appendAssistantMessageDelta,
  finalizeAssistantMessage,
  appendToolCall,
  finalizeToolResult,
  clearMessages,
  appendStreamingAssistantMessage,
} from "../stores/messages";
import { activeId$, conversations$ } from "../stores/conversations";
import { AgentRuntime, RuntimeLayer } from "../lib/runtime";
import { SettingsServiceLive } from "../../../shared/lib/tauri";
import { Button } from "../../../shared/components/ui/button";
import { Textarea } from "../../../shared/components/ui/textarea";

export function ChatView() {
  const [input, setInput] = createSignal("");
  const [running, setRunning] = createSignal(false);
  const [streamingMessageId, setStreamingMessageId] = createSignal<string | null>(null);
  let abortController: AbortController | null = null;
  let messagesEndRef: HTMLDivElement | undefined;

  // 每当活跃会话变更时加载消息。
  createEffect(() => {
    const id = activeId$();
    if (id) {
      void loadMessages(id);
    } else {
      clearMessages();
    }
  });

  // 新消息时自动滚动到底部。
  createEffect(() => {
    messages$(); // depend on signal
    if (messagesEndRef) {
      queueMicrotask(() => messagesEndRef!.scrollIntoView({ behavior: "smooth" }));
    }
  });

  onCleanup(() => {
    abortController?.abort();
  });

  const cancel = async () => {
    abortController?.abort();
    setRunning(false);
  };

  const send = async () => {
    const text = input().trim();
    const convId = activeId$();
    if (!text || !convId || running()) return;
    setInput("");
    setRunning(true);
    abortController = new AbortController();

    await appendUserMessage(text, convId);

    const conversation = conversations$().find((c) => c.id === convId);
    if (!conversation) {
      setRunning(false);
      return;
    }
    const userMsg = messages$()[messages$().length - 1];

    try {
      const program = Effect.gen(function* () {
        const runtime = yield* AgentRuntime;
        yield* Stream.runForEach(runtime.run(conversation, userMsg), (evt) => {
          switch (evt.type) {
            case "token": {
              let msgId = streamingMessageId();
              if (!msgId) {
                msgId = crypto.randomUUID();
                appendStreamingAssistantMessage(msgId, convId);
                setStreamingMessageId(msgId);
              }
              appendAssistantMessageDelta(msgId, evt.content);
              break;
            }
            case "tool_call": {
              const msgId = streamingMessageId();
              if (msgId) appendToolCall(msgId, evt.toolCall);
              break;
            }
            case "tool_result": {
              const msgId = streamingMessageId();
              if (msgId) finalizeToolResult(msgId, evt.toolCallId, evt.result, evt.error);
              break;
            }
            case "done": {
              finalizeAssistantMessage(evt.message);
              setStreamingMessageId(null);
              break;
            }
            case "error": {
              console.error("[ChatView] 代理错误：", evt.error);
              break;
            }
          }
          return Effect.succeed(undefined);
        });
      }).pipe(Effect.provide(RuntimeLayer), Effect.provide(SettingsServiceLive));

      const result = await Effect.runPromiseExit(program);
      if (!Exit.isSuccess(result)) {
        console.error("[ChatView] 运行错误：", String(result.cause));
      }
    } catch (e) {
      console.error("[ChatView] 运行错误：", e);
    } finally {
      setRunning(false);
      setStreamingMessageId(null);
    }
  };

  return (
    <>
      <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        <For each={messages$()}>{(m) => <MessageBubble message={m} />}</For>
        {/* Polish F4: agent 思考 loading,等第一个 token 来之前显示。 */}
        <Show when={running() && streamingMessageId() === null}>
          <div
            class="max-w-prose p-3 rounded-lg leading-relaxed bg-card text-muted-foreground border border-border italic flex items-center gap-2"
            role="status"
            aria-live="polite"
          >
            <span aria-hidden="true">⏳</span>
            <span>正在思考…</span>
          </div>
        </Show>
        <div ref={messagesEndRef} />
      </div>
      <form
        class="flex gap-2 p-3 border-t border-border bg-card"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label for="chat-input" class="sr-only">
          发条消息
        </label>
        <Textarea
          id="chat-input"
          class="flex-1"
          rows={3}
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          placeholder="发条消息…"
          disabled={running()}
        />
        <Show
          when={!running()}
          fallback={
            <Button type="button" variant="destructive" onClick={cancel} aria-label="取消运行">
              取消
              <X class="h-4 w-4" />
            </Button>
          }
        >
          <Button type="submit" disabled={!input().trim()} aria-label="发送消息">
            发送
            <Send class="h-4 w-4" />
          </Button>
        </Show>
      </form>
    </>
  );
}
