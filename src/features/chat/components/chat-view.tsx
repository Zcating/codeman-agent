//! ChatView — 消息列表 + 输入框 + store 订阅 (V2 ADR-0019)。
//!
//! V2 后不再 import messages.store / agent.store,全部走 chat.store
//! 的 store / sendMessage / cancel。running 派生自 byId[activeId].streamingMessageId。

import { createSignal, createEffect, createMemo, For, Show, onMount } from "solid-js";
import { Effect } from "effect";
import { X, Send } from "lucide-solid";
import { MessageBubble } from "./message-bubble";
import { ThinkingPanel } from "./thinking-panel";
import { store, sendMessage, cancel } from "../stores/chat.store";
import type { ProviderConfig } from "../lib/runtime";
import { Button } from "../../../shared/components/ui/button";
import { Textarea } from "../../../shared/components/ui/textarea";
import { startThemeSync } from "../../../shared/stores/theme";
import { appStore } from "../../../shared/stores/app.store";
import { settingsSaver } from "../../settings/lib/settings-saver";
import { buildEnabledProviders } from "../lib/build-enabled-providers";
import { CodemanGroupSelect } from "../../../shared/components/ui/codeman-group-select";

function ProviderSelect() {
  const enabledProviders = createMemo(() =>
    buildEnabledProviders(appStore.state.value.providers ?? [])
  );

  // Convert enabled providers to CodemanGroupSelect groups format
  const groups = createMemo(() =>
    enabledProviders().map((p) => ({
      label: p.label,
      options: p.models.map((m) => ({ label: m.label, value: m.id })),
    }))
  );

  // Current selected provider's default model id
  const currentModelId = (): string | null => {
    const providerId = appStore.state.value.defaultLlmProviderId;
    const provider = enabledProviders().find((p) => p.id === providerId);
    if (!provider) {
      return enabledProviders()[0]?.models[0]?.id ?? null;
    }
    return provider.models[0]?.id ?? null;
  };

  const handleChange = (modelId: string) => {
    if (!modelId) {
      return;
    }
    // Find provider that contains this model and update default_llm_provider_id
    const provider = enabledProviders().find((p) =>
      p.models.some((m) => m.id === modelId)
    );
    if (provider) {
      appStore.set({ defaultLlmProviderId: provider.id });
      settingsSaver.scheduleSave();
    }
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
      <CodemanGroupSelect
        groups={groups()}
        value={currentModelId()}
        onChange={handleChange}
        placeholder="选择模型"
        disabled={false}
        aria-label="选择 LLM provider"
        data-testid="provider-select"
      />
    </Show>
  );
}

export function ChatView(props: { convId?: string }) {
  const [input, setInput] = createSignal("");
  const convId = (): string | undefined => props.convId;
  let messagesEndRef: HTMLDivElement | undefined;

  onMount(() => {
    startThemeSync();
  });

  // 派生 running 状态(per-conv streaming)
  const isRunning = (): boolean => {
    const id = convId();
    if (!id) {
      return false;
    }
    return (
      store.byId[id]?.streamingMessageId !== null &&
      store.byId[id]?.streamingMessageId !== undefined
    );
  };

  // 当前 conv 的 messages(反应式,只在该 conv 的 messages 路径变化时重算)
  const currentMessages = () => {
    const id = convId();
    if (!id) {
      return [];
    }
    return store.byId[id]?.messages ?? [];
  };

  // Bug B: 当前 conv 的 lastError，没就 null
  const currentLastError = (): string | null => {
    const id = convId();
    if (!id) {
      return null;
    }
    return store.byId[id]?.lastError ?? null;
  };

  // 当前 stub / 最近一条 assistant 的 thinking 信息(用于 ThinkingPanel)。
  // - streaming: 用 streamingMessageId 找到 stub,thinking 是 stub 累积内容
  // - done (streamingMessageId=null): 退回到最后一条 assistant message 的 thinking,
  //   以满足"即便是流结束后,也需要一直显出"
  const stubThinkingInfo = ():
    | { thinking: string; streaming: boolean; messageId: string }
    | null => {
    const id = convId();
    if (!id) {
      return null;
    }
    const cs = store.byId[id];
    if (!cs) {
      return null;
    }
    const streamingId = cs.streamingMessageId;
    if (streamingId) {
      const stub = cs.messages.find((m) => m.id === streamingId);
      if (stub && stub.thinking) {
        return { thinking: stub.thinking, streaming: true, messageId: stub.id };
      }
    }
    // fallback: scan from end for any assistant message with non-empty thinking
    for (let i = cs.messages.length - 1; i >= 0; i--) {
      const m = cs.messages[i]!;
      if (m.role === "assistant" && m.thinking) {
        return { thinking: m.thinking, streaming: false, messageId: m.id };
      }
    }
    return null;
  };

  // 自动滚动到底部
  createEffect(() => {
    // currentMessages(); 
    if (!messagesEndRef) {
      return;
    }
    queueMicrotask(() => messagesEndRef.scrollIntoView({ behavior: "smooth" }));
  });

  const handleCancel = () => {
    const id = convId();
    if (!id) {
      return;
    }
    cancel(id);
  };

  const handleSend = async () => {
    const text = input().trim();
    const id = convId();
    if (!text || !id || isRunning()) {
      return;
    }
    setInput("");

    const providerId = appStore.state.value.defaultLlmProviderId;
    const providerConfig = appStore.state.value.providers?.find((p) => p.id === providerId);
    const provider: ProviderConfig = {
      apiKey: providerConfig?.apiKey ?? null,
      baseUrl: providerConfig?.llm?.baseUrl ?? "",
      defaultModel: providerConfig?.llm?.defaultModel ?? "auto",
      systemPrompt: appStore.state.value.systemPrompt?.default ?? "",
      tools: [],
    };

    await Effect.runPromiseExit(sendMessage(id, text, provider));
  };

  return (
    <>
      <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        <Show when={currentLastError()}>
          <div
            role="alert"
            aria-label="运行时错误"
            data-testid="chat-error-banner"
            class="p-3 rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-200 text-sm flex items-start gap-2"
          >
            <X class="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <div class="flex-1 min-w-0">
              <div class="font-medium mb-1">运行时错误</div>
              <div class="wrap-break-word">{currentLastError()}</div>
            </div>
          </div>
        </Show>
        <For each={currentMessages()}>{(m) => <MessageBubble message={m} />}</For>
        <Show
          when={
            isRunning() &&
            currentMessages().length > 0 &&
            currentMessages()[currentMessages().length - 1]?.content === ""
          }
        >
          <div
            class="max-w-prose pl-3 border-l-2 border-primary bg-card text-muted-foreground italic flex items-center gap-2"
            role="status"
            aria-live="polite"
            data-testid="thinking-indicator"
          >
            <span class="text-primary font-medium" aria-hidden="true">●●●</span>
            <span>正在思考…</span>
          </div>
        </Show>
        {/* ThinkingPanel — 专用块,展示 stub / 最近一条 assistant 的累积 thinking。
            即使 stream 已 done 也持续显示(streaming=false 时折叠默认收起),用户可手动展开。 */}
        <Show when={stubThinkingInfo()}>
          {(info) => (
            <ThinkingPanel
              thinking={info().thinking}
              streaming={info().streaming}
              messageId={info().messageId}
            />
          )}
        </Show>
        <div ref={messagesEndRef} />
      </div>
      <form
        class="flex flex-col gap-2 p-3 border-t border-border bg-card"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
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
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="发条消息…"
          disabled={isRunning()}
        />
        <div class="flex items-center gap-2">
          <label for="provider-select" class="text-xs text-muted-foreground whitespace-nowrap">
            Provider
          </label>
          <ProviderSelect />
          <div class="flex-1" />
          <Show
            when={!isRunning()}
            fallback={
              <Button
                type="button"
                variant="destructive"
                onClick={handleCancel}
                aria-label="取消运行"
              >
                取消
                <X class="h-4 w-4" />
              </Button>
            }
          >
            <Button
              type="submit"
              onClick={(e) => {
                e.preventDefault();
                void handleSend();
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
