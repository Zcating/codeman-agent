//! ChatView — 消息列表 + 输入框 + store 订阅 (V2 ADR-0019)。
//!
//! V2 后不再 import messages.store / agent.store,全部走 chat.store
//! 的 store / sendMessage / cancel。running 派生自 byId[activeId].streamingMessageId。

import { createSignal, createEffect, createMemo, For, Show, onMount } from "solid-js";
import { X, Send } from "lucide-solid";
import { MessageBubble } from "./message-bubble";
import { store, activeId$, sendMessage, cancel } from "../stores/chat.store";
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
    const providerId = appStore.state.value.default_llm_provider_id;
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
      appStore.set({ default_llm_provider_id: provider.id });
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

export function ChatView() {
  const [input, setInput] = createSignal("");
  const [convId, setConvId] = createSignal<string | null>(null);
  let messagesEndRef: HTMLDivElement | undefined;

  onMount(() => {
    startThemeSync();
  });

  // 跟踪 active conv id (从 activeId$ signal)
  createEffect(() => {
    setConvId(activeId$());
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

  // 自动滚动到底部
  createEffect(() => {
    currentMessages();
    if (messagesEndRef) {
      queueMicrotask(() => messagesEndRef!.scrollIntoView({ behavior: "smooth" }));
    }
  });

  const handleCancel = async () => {
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

    const providerId = appStore.state.value.default_llm_provider_id;
    const providerConfig = appStore.state.value.providers?.find((p) => p.id === providerId);
    const provider: ProviderConfig = {
      apiKey: providerConfig?.api_key ?? null,
      baseUrl: providerConfig?.llm?.base_url ?? "",
      defaultModel: providerConfig?.llm?.default_model ?? "auto",
      systemPrompt: appStore.state.value.system_prompt?.default ?? "",
      tools: [],
    };

    await sendMessage(id, text, provider);
  };

  return (
    <>
      <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
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
