//! ChatView — message list + input + stream subscription.
//!
//! The centerpiece of the agent UI. Subscribes to AgentRuntime.run()
//! and translates RuntimeEvents into UI updates.

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
} from "../store/messages";
import { activeId$, conversations$ } from "../store/conversations";
import { AgentRuntime, RuntimeLayer } from "../runtime";

export function ChatView() {
  const [input, setInput] = createSignal("");
  const [running, setRunning] = createSignal(false);
  const [streamingMessageId, setStreamingMessageId] = createSignal<string | null>(null);
  let abortController: AbortController | null = null;
  let messagesEndRef: HTMLDivElement | undefined;

  // Load messages whenever the active conversation changes.
  createEffect(() => {
    const id = activeId$();
    if (id) {
      void loadMessages(id);
    } else {
      clearMessages();
    }
  });

  // Auto-scroll to bottom on new message.
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
              console.error("[ChatView] agent error:", evt.error);
              break;
            }
          }
          return Effect.succeed(undefined);
        });
      }).pipe(Effect.provide(RuntimeLayer));

      const result = await Effect.runPromiseExit(program);
      if (!Exit.isSuccess(result)) {
        console.error("[ChatView] run error:", String(result.cause));
      }
    } catch (e) {
      console.error("[ChatView] run error:", e);
    } finally {
      setRunning(false);
      setStreamingMessageId(null);
    }
  };

  return (
    <>
      <div class="flex-1 overflow-y-auto p-4 space-y-3">
        <For each={messages$()}>
          {(m) => <MessageBubble message={m} />}
        </For>
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
            <button type="button" onClick={cancel} class="px-4 py-2 rounded-md font-medium bg-red-500 hover:bg-red-600 active:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed">
              Cancel<X class="h-4 w-4 ml-1" />
            </button>
          }
        >
          <button type="submit" disabled={!input().trim()} class="px-4 py-2 rounded-md font-medium bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-white disabled:opacity-50 disabled:cursor-not-allowed">
            Send<Send class="h-4 w-4 ml-1" />
          </button>
        </Show>
      </form>
    </>
  );
}
