//! ChatView — 消息列表 + 输入框 + stream 订阅。
//!
//! 代理 UI 的核心组件。订阅 AgentRuntime.run()
//! 并将 RuntimeEvents 转换为 UI 更新。

import { createSignal, createEffect, For, Show, onCleanup, onMount } from "solid-js";
import { Effect, Exit, Layer, Stream } from "effect";
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
import { AgentRuntime, AgentRuntimeLive, type RuntimeError } from "../lib/runtime";
import {
  SettingsService,
  SettingsServiceImpl,
  BillingService,
  BillingServiceImpl,
} from "../../../shared/lib/tauri";
import { LLMProviderServiceLive } from "../../settings/lib/llm-providers";
import type { AppError } from "../../../shared/lib/types";
import { startThemeSync } from "../../../shared/stores/theme";

export function ChatView() {
  const [input, setInput] = createSignal("");
  const [running, setRunning] = createSignal(false);
  const [streamingMessageId, setStreamingMessageId] = createSignal<string | null>(null);
  let abortController: AbortController | null = null;
  let messagesEndRef: HTMLDivElement | undefined;

  // 启动 theme store 的 5s 轮询 — 把 Settings.theme 桥接到 <html class="dark">。
  // 没这个调用,theme store 是死代码,用户改了 Settings.theme 后 html class 不切。
  onMount(() => {
    startThemeSync();
  });

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
    if (!userMsg) {
      console.error("[ChatView] 运行错误：userMsg 是 undefined — appendUserMessage 可能没成功,convId=", convId, "messagesLen=", messages$().length);
      setRunning(false);
      return;
    }

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
      }).pipe(
        // LLMProviderServiceLive 内部 yield* SettingsService,AgentRuntimeLive 内部
        // yield* SettingsService + LLMProviderService。Layer.mergeAll 不保证 build
        // 顺序,可能导致 "Service not found"。Layer.provide 显式 feed SettingsService
        // 给 LLMProviderServiceLive,再 feed SettingsService + LLMProviderService
        // 给 AgentRuntimeLive,最后 merge BillingService。
        Effect.provide(
          Layer.merge(
            Layer.provide(
              AgentRuntimeLive,
              Layer.merge(
                Layer.succeed(SettingsService, SettingsServiceImpl),
                Layer.provide(LLMProviderServiceLive, Layer.succeed(SettingsService, SettingsServiceImpl)),
              ),
            ),
            Layer.succeed(BillingService, BillingServiceImpl),
          ),
        ),
      ) as Effect.Effect<void, AppError | RuntimeError, never>;

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
      <div class="flex-1 overflow-y-auto p-4 space-y-3">
        <For each={messages$()}>{(m) => <MessageBubble message={m} />}</For>
        <div ref={messagesEndRef} />
      </div>
      <form
        class="flex gap-2 p-3 border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          class="flex-1 p-2 border border-zinc-300 dark:border-zinc-600 rounded-md bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 placeholder:text-zinc-400 resize-none outline-none disabled:opacity-60"
          rows={3}
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          placeholder="Type a message…"
          disabled={running()}
        />
        <Show
          when={!running()}
          fallback={
            <button
              type="button"
              onClick={cancel}
              class="px-4 py-2 rounded-md font-medium bg-red-500 hover:bg-red-600 active:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
              <X class="h-4 w-4 ml-1" />
            </button>
          }
        >
          <button
            type="submit"
            // 直接 onClick 也调 send — 双重保险。Form onSubmit 在某些 webview
            // (WebView2) + Solid 组合下不可靠(诊断验证 submit event 派发了
            // 但 Solid onSubmit listener 没反应)。加 onClick 让 button click
            // 链独立工作,跟 form submit 解耦。
            onClick={(e) => {
              e.preventDefault();
              void send();
            }}
            disabled={!input().trim()}
            class="px-4 py-2 rounded-md font-medium bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
            <Send class="h-4 w-4 ml-1" />
          </button>
        </Show>
      </form>
    </>
  );
}
