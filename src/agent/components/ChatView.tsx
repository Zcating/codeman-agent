//! ChatView — message list + input + stream subscription.
//!
//! The centerpiece of the agent UI. Subscribes to AgentRuntime.run()
//! and translates RuntimeEvents into bridge calls.

import { createSignal, createEffect, For, Show, onCleanup } from "solid-js";
import { MessageBubble } from "./MessageBubble";
import { Sidebar } from "./Sidebar";
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
import { runAgent } from "../store/runtime";

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
      await runAgent(conversation, userMsg, {
        onToken: (content) => {
          let msgId = streamingMessageId();
          if (!msgId) {
            msgId = crypto.randomUUID();
            appendStreamingAssistantMessage(msgId, convId);
            setStreamingMessageId(msgId);
          }
          appendAssistantMessageDelta(msgId, content);
        },
        onToolCall: (toolCall) => {
          const msgId = streamingMessageId();
          if (msgId) appendToolCall(msgId, toolCall);
        },
        onToolResult: (toolCallId, result, error) => {
          const msgId = streamingMessageId();
          if (msgId) finalizeToolResult(msgId, toolCallId, result, error);
        },
        onDone: (message) => {
          finalizeAssistantMessage(message);
          setStreamingMessageId(null);
        },
        onError: (err) => {
          console.error("[ChatView] agent error:", err);
        },
      });
    } catch (e) {
      console.error("[ChatView] run error:", e);
    } finally {
      setRunning(false);
      setStreamingMessageId(null);
    }
  };

  return (
    <main class="chat-view">
      <Sidebar />
      <section class="chat-view__main">
        <div class="chat-view__messages">
          <For each={messages$()}>
            {(m) => <MessageBubble message={m} />}
          </For>
          <div ref={messagesEndRef} />
        </div>
        <form
          class="chat-view__input"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            rows={3}
            value={input()}
            onInput={(e) => setInput(e.currentTarget.value)}
            placeholder="Type a message…"
            disabled={running()}
          />
          <Show
            when={!running()}
            fallback={
              <button type="button" onClick={cancel}>
                Cancel
              </button>
            }
          >
            <button type="submit" disabled={!input().trim()}>
              Send
            </button>
          </Show>
        </form>
      </section>
      <style>{`
        .chat-view {
          display: flex;
          height: 100vh;
          background: #0f0f23;
          font-family: "Courier New", Courier, monospace;
          color: #e0e0e0;
        }
        .chat-view__main {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .chat-view__messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .chat-view__messages::-webkit-scrollbar {
          width: 6px;
        }
        .chat-view__messages::-webkit-scrollbar-track {
          background: #0f0f23;
        }
        .chat-view__messages::-webkit-scrollbar-thumb {
          background: #16213e;
          border-radius: 2px;
        }
        .chat-view__input {
          display: flex;
          gap: 8px;
          padding: 12px 16px;
          border-top: 2px solid #16213e;
          background: #1a1a2e;
        }
        .chat-view__input textarea {
          flex: 1;
          padding: 8px 12px;
          background: #0f0f23;
          border: 2px solid #16213e;
          border-radius: 2px;
          color: #e0e0e0;
          font-family: inherit;
          font-size: 13px;
          resize: none;
          outline: none;
        }
        .chat-view__input textarea:focus {
          border-color: #4a4ae0;
        }
        .chat-view__input textarea::placeholder {
          color: #666;
        }
        .chat-view__input textarea:disabled {
          opacity: 0.6;
        }
        .chat-view__input button {
          padding: 8px 20px;
          background: #4a4ae0;
          border: 2px solid #6a6af0;
          border-radius: 2px;
          color: #fff;
          font-family: inherit;
          font-size: 13px;
          cursor: pointer;
          transition: background 0.1s;
        }
        .chat-view__input button:hover:not(:disabled) {
          background: #6a6af0;
        }
        .chat-view__input button:active:not(:disabled) {
          background: #3a3ad0;
        }
        .chat-view__input button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </main>
  );
}