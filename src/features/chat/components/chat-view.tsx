//! ChatView — 消息列表 + 输入框 + store 订阅 (V2.5, ADR-0029)。
//!
//! V2.5 (ADR-0029): 从 `createSignal` + 原生 `<form onSubmit>` 切换到 `@tanstack/solid-form`
//! 的 `createForm` + 2 个 `form.Field`（`draft` / `modelId`）。running 状态由 `isRunning()`
//! 派生；form-level `disabled` 在 streaming 时切，Cancel 按钮渲染为 form 外部 sibling。
//!
//! V2 ADR-0019: 不再 import messages.store / agent.store, 全部走 chat.store。
//! V2.5 (ADR-0029 D5): 移除 inline `role="alert" data-testid="chat-error-banner"` banner，
//! runtime 错误改走 `codemanToast.error(formatAppError(...))`。

import { createEffect, createMemo, For, Show, onMount, type JSX } from "solid-js";
import { Effect, Exit } from "effect";
import { X, Send } from "lucide-solid";
import { createForm } from "@tanstack/solid-form";
import { MessageBubble } from "./message-bubble";
import { store, sendMessage, cancel } from "../stores/chat.store";
import type { ProviderConfig } from "../lib/runtime";
import { Button } from "../../../shared/components/ui/button";
import { CodemanTextarea } from "../../../shared/components/internal/codeman-textarea";
import { CodemanGroupSelect } from "../../../shared/components/internal/codeman-group-select";
import { codemanToast } from "../../../shared/components/internal/codeman-toast";
import { startThemeSync } from "../../../shared/stores/theme";
import { appStore } from "../../../shared/stores/app.store";
import { formatAppError } from "../../../shared/lib/format-app-error";
import { effectSchema, firstErrorMessage } from "../../../shared/lib/effect-schema-adapter";
import { settingsSaver } from "../../settings/lib/settings-saver";
import { buildEnabledProviders } from "../lib/build-enabled-providers";
import {
  handleArrowUpField,
  handleArrowDownField,
  recordInputEntry,
} from "../stores/input-history.store";
import {
  DraftFieldSchema,
  ModelIdFieldSchema,
  ChatViewFormSchema,
  type ChatViewFormValue,
} from "../lib/schemas";

// ─── ProviderSelect (model picker bound to form.Field "modelId") ─────────────

function ProviderSelect(props: {
  value: string;
  onChange: (modelId: string) => void;
}): JSX.Element {
  const enabledProviders = createMemo(() =>
    buildEnabledProviders(appStore.state.value.providers ?? [])
  );

  const groups = createMemo(() =>
    enabledProviders().map((p) => ({
      label: p.label,
      options: p.models.map((m) => ({ label: m.label, value: m.id })),
    }))
  );

  const handleChange = (modelId: string) => {
    if (!modelId) return;
    props.onChange(modelId);
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
        value={props.value}
        onChange={handleChange}
        placeholder="选择模型"
        disabled={false}
        aria-label="选择 LLM provider"
        data-testid="provider-select"
      />
    </Show>
  );
}

// ─── ChatView ─────────────────────────────────────────────────────────────────

export function ChatView(props: { convId?: string }): JSX.Element {
  const convId = (): string | undefined => props.convId;
  let messagesEndRef: HTMLDivElement | undefined;

  onMount(() => {
    startThemeSync();
  });

  // ─── Derived state ────────────────────────────────────────────────────────
  const isRunning = (): boolean => {
    const id = convId();
    if (!id) return false;
    return (
      store.byId[id]?.streamingMessageId !== null &&
      store.byId[id]?.streamingMessageId !== undefined
    );
  };

  const currentMessages = () => {
    const id = convId();
    if (!id) return [];
    return store.byId[id]?.messages ?? [];
  };

  // Auto-scroll to bottom on messages change.
  // 首次进入对话(mount 后第一次 effect 执行)用 instant 直接定位,后续消息追加
  // 用 smooth 让用户感知到新内容到达。
  let hasScrolledInitially = false;
  createEffect(() => {
    currentMessages();
    if (!messagesEndRef) return;
    const behavior = hasScrolledInitially ? "smooth" : "instant";
    queueMicrotask(() => messagesEndRef.scrollIntoView({ behavior }));
    hasScrolledInitially = true;
  });

  // Runtime error → toast (ADR-0029 D5 — banner removed; toast replaces it)
  // Tracks prev error to avoid duplicate toasts when lastError stays non-null across renders.
  const currentLastError = (): string | null => {
    const id = convId();
    if (!id) return null;
    return store.byId[id]?.lastError ?? null;
  };
  createEffect(() => {
    const err = currentLastError();
    if (err) codemanToast.error(err);
  });

  // ─── Form ─────────────────────────────────────────────────────────────────
  const form = createForm(() => ({
    defaultValues: {
      draft: "",
      modelId: initialModelId(),
    } satisfies ChatViewFormValue,
    validators: {
      onMount: effectSchema(ChatViewFormSchema),
      onChange: effectSchema(ChatViewFormSchema),
    },
    onSubmit: async ({ value }) => {
      const text = value.draft.trim();
      const id = convId();
      if (!text || !id || isRunning()) return;

      // Build ProviderConfig from appStore (read at submit-time, per ADR-0019 D2)
      const providerId = appStore.state.value.defaultLlmProviderId;
      const providerConfig = appStore.state.value.providers?.find((p) => p.id === providerId);
      const provider: ProviderConfig = {
        apiKey: providerConfig?.apiKey,
        baseUrl: providerConfig?.llm?.baseUrl ?? "",
        defaultModel: providerConfig?.llm?.defaultModel ?? "auto",
        systemPrompt: appStore.state.value.systemPrompt?.default ?? "",
        tools: [],
      };

      // Clear draft + record history entry
      form.reset({ draft: "", modelId: value.modelId });
      recordInputEntry(text);

      // Send (long-running streaming — do not await)
      void Effect.runPromiseExit(sendMessage(id, text, provider)).then((exit) => {
        if (Exit.isFailure(exit)) {
          codemanToast.error(formatAppError(exit.cause));
        }
      });
    },
  }));

  // ─── Cancel handler (form-external sibling) ───────────────────────────────
  const handleCancel = () => {
    const id = convId();
    if (!id) return;
    cancel(id);
  };

  return (
    <>
      <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        <For each={currentMessages()}>{(m) => <MessageBubble message={m} />}</For>
        <div ref={messagesEndRef} />
      </div>

      <form
        class="flex flex-col gap-2 p-3 border-t border-border bg-card"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        {/* draft field (textarea) */}
        <form.Field
          name="draft"
          validators={{ onBlur: effectSchema(DraftFieldSchema) }}
        >
          {(field) => (
            <>
              <label for="chat-input" class="sr-only">
                发条消息
              </label>
              <CodemanTextarea
                id="chat-input"
                class="w-full"
                rows={3}
                value={field().state.value}
                onValueChange={(v) => field().handleChange(v)}
                onBlur={() => field().handleBlur()}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    if (handleArrowUpField(field)) {
                      e.preventDefault();
                    }
                    return;
                  }
                  if (e.key === "ArrowDown") {
                    if (handleArrowDownField(field)) {
                      e.preventDefault();
                    }
                    return;
                  }
                }}
                placeholder="发条消息…"
                disabled={isRunning() || form.state.isSubmitting}
                error={
                  field().state.meta.isTouched
                    ? firstErrorMessage(field().state.meta.errors)
                    : undefined
                }
              />
            </>
          )}
        </form.Field>

        {/* row: provider label + ProviderSelect + (spacer) + Send */}
        <div class="flex items-center gap-2">
          <label for="provider-select" class="text-xs text-muted-foreground whitespace-nowrap">
            Provider
          </label>
          <form.Field
            name="modelId"
            validators={{ onBlur: effectSchema(ModelIdFieldSchema) }}
          >
            {(field) => (
              <ProviderSelect
                value={field().state.value}
                onChange={(modelId) => {
                  field().handleChange(modelId);
                  // Sync to appStore so global default updates (ProviderCard / settings)
                  const providers = appStore.state.value.providers ?? [];
                  const provider = buildEnabledProviders(providers).find((p) =>
                    p.models.some((m) => m.id === modelId),
                  );
                  if (provider) {
                    const updatedProviders = providers.map((p) =>
                      p.id === provider.id
                        ? { ...p, llm: { ...p.llm, defaultModel: modelId } }
                        : p,
                    );
                    appStore.set({
                      providers: updatedProviders,
                      defaultLlmProviderId: provider.id,
                    });
                    settingsSaver.scheduleSave();
                  }
                }}
              />
            )}
          </form.Field>

          <div class="flex-1" />

          {/* Submit button — disabled when form not submittable OR running */}
          <form.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
            })}
          >
            {(sub) => (
              <Button
                type="submit"
                disabled={!sub().canSubmit || isRunning()}
                aria-label="发送消息"
              >
                {sub().isSubmitting ? "提交中…" : "发送"}
                <Send class="h-4 w-4" />
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>

      {/* Cancel button — form-external sibling (per ADR-0029 D6) */}
      <Show when={isRunning()}>
        <div class="flex justify-end p-2 border-t border-border bg-card">
          <Button
            type="button"
            variant="destructive"
            onClick={handleCancel}
            aria-label="取消运行"
          >
            取消
            <X class="h-4 w-4" />
          </Button>
        </div>
      </Show>
    </>
  );
}

// ─── Helpers (module-level) ────────────────────────────────────────────────────

function initialModelId(): string {
  const providers = appStore.state.value.providers ?? [];
  const enabled = buildEnabledProviders(providers);
  const providerId = appStore.state.value.defaultLlmProviderId;
  const provider = enabled.find((p) => p.id === providerId) ?? enabled[0];
  if (!provider) return "";
  const raw = providers.find((p) => p.id === provider.id);
  const defaultModel = raw?.llm?.defaultModel;
  if (defaultModel && provider.models.some((m) => m.id === defaultModel)) {
    return defaultModel;
  }
  return provider.models[0]?.id ?? "";
}