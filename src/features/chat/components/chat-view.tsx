//! ChatView — 消息列表 + 输入框 + stream 订阅。
//!
//! 代理 UI 的核心组件。订阅 chatAgentStore.startRun() 拿到的 Stream<RuntimeEvent>
//! 并将 RuntimeEvents 转换为 UI 更新。
//! Polish F2/F4/F6/F8: 中文 placeholder + 思考 loading + 5 原子 (Button / Textarea) + aria-label。
//! V1.6+ ADR-0014 + V1.8+ ADR-0016 D4+D5+D6: 不再 import AgentRuntime / RuntimeLayer / SettingsServiceLive;
//! 全部走 chatAgentStore 提供的 startRun (Stream) / cancel (Effect) / destroy (Effect)。

// V1.6+ ADR-0014 + feature/chat-streams 合并:加 Duration 用于打字机式
// 微任务 yield (Effect.sleep(Duration.zero))。移除 onCleanup — V1.5 的
// AbortController 在 V1.6+ 已废,取消走 chatAgentStore.cancel (内部走 AgentRuntime.cancel)。
import { createSignal, createEffect, For, Show, onMount } from "solid-js";
import { Duration, Effect, Exit, Stream } from "effect";
import { Send, X } from "lucide-solid";
import { MessageBubble } from "./message-bubble";
import {
  messages$,
  loadMessages,
  appendUserMessage,
  appendAssistantMessageDelta,
  finalizeAssistantMessage,
  persistAssistantMessage,
  appendToolCall,
  finalizeToolResult,
  clearMessages,
  appendStreamingAssistantMessage,
} from "../stores/messages.store";
import { activeId$, conversations$ } from "../stores/conversations.store";
import { chatAgentStore } from "../stores/agent.store";
import type { RuntimeEvent } from "../lib/runtime";
import { SettingsServiceLive } from "../../../shared/lib/tauri";
import { Button } from "../../../shared/components/ui/button";
import { Textarea } from "../../../shared/components/ui/textarea";
import { startThemeSync } from "../../../shared/stores/theme";
import { appStore } from "../../../shared/stores/app.store";
import { settingsSaver } from "../../settings/lib/settings-saver";
import { logger } from "../../../shared/lib/logger";
import type { Provider } from "../../../shared/lib/types";

/**
 * V1.x chat 输入框下方的 provider 选择器。
 *
 * 数据源:appStore.state.value.providers[] (V1.5 unified schema, ADR-0012 + ADR-0015)。
 * 列出所有 enabled 且有 llm 配置的 provider。
 * 选中后写 appStore.state.value.default_llm_provider_id (全局生效 —
 * 影响 runtime 后续 run() 选取的 active provider;
 * 不影响 in-flight conversation 的 per-conv Agent 实例锁定, 那是 ADR-0014 行为)。
 * debounced 500ms auto-flush 走 settingsSaver.scheduleSave(), 跟 settings 域同模式。
 *
 * 空状态:无 enabled provider 时显示提示并跳到 settings。
 */
function ProviderSelect() {
  const enabledProviders = (): Provider[] =>
    (appStore.state.value.providers ?? []).filter((p) => p.enabled && p.llm);
  const currentId = (): string => {
    const id = appStore.state.value.default_llm_provider_id;
    if (id && enabledProviders().some((p) => p.id === id)) {
      return id;
    }
    return enabledProviders()[0]?.id ?? "";
  };
  const handleChange = (e: Event & { currentTarget: HTMLSelectElement }) => {
    const next = e.currentTarget.value;
    if (!next) {
      return;
    }
    appStore.set({ default_llm_provider_id: next });
    settingsSaver.scheduleSave();
  };
  return (
    <Show
      when={enabledProviders().length > 0}
      fallback={
        <a
          href="/settings"
          class="text-xs text-muted-foreground hover:text-foreground"
          aria-label="无 provider, 请到 settings 配置"
        >
          无 provider — 前往 settings
        </a>
      }
    >
      <select
        id="provider-select"
        class="h-9 max-w-[14rem] truncate rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        value={currentId()}
        onChange={handleChange}
        aria-label="选择 LLM provider"
        data-testid="provider-select"
      >
        <For each={enabledProviders()}>{(p) => <option value={p.id}>{p.label}</option>}</For>
      </select>
    </Show>
  );
}

export function ChatView() {
  const [input, setInput] = createSignal("");
  const [running, setRunning] = createSignal(false);
  const [streamingMessageId, setStreamingMessageId] = createSignal<string | null>(null);
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

  /**
   * 取消当前 active conversation 的流。
   *
   * V1.5 实现:`abortController?.abort()` + `setRunning(false)`。
   * BUG:AbortController 从未传给 pi-mono 的 fetch,实际什么都不发生,stream 继续跑,
   * done 事件照常落库。"Cancel"按钮只是把 running 改 false,骗用户说"已取消"。
   *
   * V1.6+ per ADR-0014 D6:走 AgentRuntime.cancel(activeId) 真正 abort pi-mono fetch;
   * in-flight partial 保留在 Agent state,不落库。
   *
   * V1.8+ ADR-0016 D4 + D5: 走 chatAgentStore.cancel (内部包 AgentRuntime.cancel + bake RuntimeLayer)。
   * 这里额外显式 setRunning(false) 作为 safety net:UI 立刻可交互,后续 send() 不会被 running 守卫挡。
   */
  const cancel = async () => {
    const convId = activeId$();
    if (!convId) {
      return;
    }
    setRunning(false);
    setStreamingMessageId(null);
    await Effect.runPromiseExit(chatAgentStore.cancel(convId));
  };

  const send = async () => {
    const text = input().trim();
    const convId = activeId$();
    if (!text || !convId || running()) {
      return;
    }
    setInput("");
    setRunning(true);
    // V1.6+ per ADR-0014 D5:每 conv 至多 1 active 流,这里假定 send 入口已用
    // activeId$ + running 串行化。

    await appendUserMessage(text, convId);

    const conversation = conversations$().find((c) => c.id === convId);
    if (!conversation) {
      setRunning(false);
      return;
    }
    const userMsg = messages$()[messages$().length - 1];
    if (!userMsg) {
      logger.error(
        "[ChatView] 运行错误:userMsg 是 undefined — appendUserMessage 可能没成功,convId=",
        convId,
        "messagesLen=",
        messages$().length,
      );
      setRunning(false);
      return;
    }

    // V1.8+ ADR-0016 D4 + D6: startRun 走 chatAgentStore (Stream<RuntimeEvent>)。
    // 组件用 Stream.runForEach 接 event handler;不再 import AgentRuntime / RuntimeLayer / SettingsServiceLive。
    const handleEvent = (event: RuntimeEvent) =>
      Effect.gen(function* () {
        switch (event.type) {
          case "token": {
            let msgId = streamingMessageId();
            if (!msgId) {
              msgId = crypto.randomUUID();
              appendStreamingAssistantMessage(msgId, convId);
              setStreamingMessageId(msgId);
            }
            appendAssistantMessageDelta(msgId, event.content);
            break;
          }
          case "tool_call": {
            const msgId = streamingMessageId();
            if (msgId) {
              appendToolCall(msgId, event.toolCall);
            }
            break;
          }
          case "tool_result": {
            const msgId = streamingMessageId();
            if (msgId) {
              finalizeToolResult(msgId, event.toolCallId, event.result, event.error);
            }
            break;
          }
          case "done": {
            const stubId = streamingMessageId();
            if (stubId) {
              finalizeAssistantMessage({ ...event.message, id: stubId });
            } else {
              finalizeAssistantMessage(event.message);
            }
            void persistAssistantMessage(event.message);
            setStreamingMessageId(null);
            break;
          }
          case "error": {
            logger.error("[ChatView] 代理错误:", event.error);
            break;
          }
        }
        yield* Effect.sleep(Duration.zero);
        return undefined;
      });

    const exit = await Effect.runPromiseExit(
      Stream.runForEach(chatAgentStore.startRun(conversation, userMsg), handleEvent).pipe(
        Effect.provide(SettingsServiceLive),
      ),
    );
    if (Exit.isFailure(exit)) {
      logger.error("[ChatView] 运行错误:", String(exit.cause));
    }
    setRunning(false);
    setStreamingMessageId(null);
  };

  return (
    <>
      <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        <For each={messages$()}>{(m) => <MessageBubble message={m} />}</For>
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
        class="flex flex-col gap-2 p-3 border-t border-border bg-card"
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
          class="w-full"
          rows={3}
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          placeholder="发条消息…"
          disabled={running()}
        />
        <div class="flex items-center gap-2">
          <label for="provider-select" class="text-xs text-muted-foreground whitespace-nowrap">
            Provider
          </label>
          <ProviderSelect />
          <div class="flex-1" />
          <Show
            when={!running()}
            fallback={
              <Button type="button" variant="destructive" onClick={cancel} aria-label="取消运行">
                取消
                <X class="h-4 w-4" />
              </Button>
            }
          >
            <Button
              type="submit"
              onClick={(e) => {
                e.preventDefault();
                void send();
              }}
              disabled={!input().trim()}
              aria-label="发送消息"
            >
              发送
              <Send class="h-4 w-4" />
            </Button>
          </Show>
        </div>
      </form>
    </>
  );
}
