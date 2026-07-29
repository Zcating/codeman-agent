//! ChatView — 消息列表 + 输入框 + store 订阅 (V2.5, ADR-0029)。
//!
//! V2.5 (ADR-0029): 从 `createSignal` + 原生 `<form onSubmit>` 切换到 `@tanstack/solid-form`
//! 的 `createForm` + 2 个 `form.Field`（`draft` / `modelId`）。running 状态由 `isRunning()`
//! 派生；form-level `disabled` 在 streaming 时切，Cancel 按钮渲染为 form 外部 sibling。
//!
//! V2 ADR-0019: 不再 import messages.store / agent.store, 全部走 chat.store。
//! V2.5 (ADR-0029 D5): 移除 inline `role="alert" data-testid="chat-error-banner"` banner，
//! runtime 错误改走 `codemanToast.error(formatAppError(...))`。
//!
//! V2.6 (2026-07-26, 决议自 `/prototype/context-ring` 路线 C): 发送按钮**左侧**新增
//! `ContextRing` 圆形上下文进度条 + 双行 label（百分比 + 已用/总额 tokens）。
//! 实现已拆到 `./context-ring.tsx`;本文件只持有 ringInfo memo(派生 state)
//! + cluster wrapper。
//!
//! V2.7 (ADR-0037): textarea + slash menu 合并为 `<ComboTextarea>`。移除
//! `useSlashTrigger` + `<SlashMenu>` + `handleSkillSelect` + `enabledSkills`
//! memo(部分保留用于传入 ComboTextarea 的 skills prop)。
//!
//! V2.8 (2026-07-29, 决议自 `/prototype/chat-textarea-fixed` route A): messages wrapper
//! 重新拥有 `overflow-y-auto`(撤销 V2.7.1 "Bug B" 把滚动移到 SidebarInset 的修复)。
//! 用户反馈"下方 textarea 不要连带滚动",需要 form 与 messages 在不同滚动上下文;
//! Variant A(内嵌滚动)以"messages 自己滚,form sibling 占底部"实现,改动最小。
//! 副作用:SidebarInset 仍带 `overflow-y-auto`,但因 ConversationRoute 的内容恰好占满
//! 视口高度,outer 滚动不再触发 — 嵌套滚动仅在 messages 自身高度溢出时激活。

import { createEffect, createMemo, For, Show, onMount, type JSX } from "solid-js";
import { Effect, Exit } from "effect";
import { X, Send } from "lucide-solid";
import { createForm } from "@tanstack/solid-form";
import { MessageBubble } from "@codeman-frontend/features/chat/components/message-bubble";
import { store, sendMessage, cancel } from "@codeman-frontend/features/chat/stores/chat.store";
import {
  ContextRing,
  computeUsedTokensEst,
} from "@codeman-frontend/features/chat/components/context-ring";
import type { ProviderConfig } from "@codeman-frontend/features/chat/lib/runtime";
import { Button } from "@codeman-frontend/shared/components/ui/button";
import { ComboTextarea } from "@codeman-frontend/features/chat/components/combo-textarea";
import { CodemanGroupSelect } from "@codeman-frontend/shared/components/internal/codeman-group-select";
import { codemanToast } from "@codeman-frontend/shared/components/internal/codeman-toast";
import { startThemeSync } from "@codeman-frontend/shared/stores/theme";
import { appStore } from "@codeman-frontend/shared/stores/app.store";
import { formatAppError } from "@codeman-frontend/shared/lib/format-app-error";
import { effectSchema, firstErrorMessage } from "@codeman-frontend/shared/lib/effect-schema-adapter";
import { settingsSaver } from "@codeman-frontend/features/settings/lib/settings-saver";
import { buildEnabledProviders } from "@codeman-frontend/features/chat/lib/build-enabled-providers";
import { lookupContextWindow } from "@codeman-frontend/features/chat/lib/context-window-fallback";
import {
  handleArrowUpField,
  handleArrowDownField,
  recordInputEntry,
} from "@codeman-frontend/features/chat/stores/input-history.store";
import {
  ModelIdFieldSchema,
  ChatViewFormSchema,
  type ChatViewFormValue,
} from "@codeman-frontend/features/chat/lib/schemas";
// ADR-0037: ComboTextarea 替代 useSlashTrigger + SlashMenu
import { skillsManifests$ } from "@codeman-frontend/plugins/skills/stores/skills.store";
import type { SkillManifest } from "@codeman-frontend/shared/lib/types";

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
    if (!modelId) { return; }
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
    if (!id) { return false; }
    return (
      store.byId[id]?.streamingMessageId !== null &&
      store.byId[id]?.streamingMessageId !== undefined
    );
  };

  const currentMessages = () => {
    const id = convId();
    if (!id) { return []; }
    return store.byId[id]?.messages ?? [];
  };

  // ─── ContextRing 派生 state (V2.6) ────────────────────────────────
  //   读取当前 provider/model + 当前 conv messages 算 context window 使用率。
  //   `total` 来自 ModelMeta.contextWindow;`used` 优先用最新一条 assistant
  //   msg 的 `inputTokens` (LLM 真实回报),退路走粗估(字符 /4)。
  const ringInfo = createMemo(() => {
    const providers = appStore.state.value.providers ?? [];
    const pid = appStore.state.value.defaultLlmProviderId;
    const provider = providers.find((p) => p.id === pid);
    // 双可选链:settings 数据漂移(老 provider 没 llm / llm 没 models)时不要 throw,
    // 让 total 走 0 分支,环仍渲染 0% · 0 / 0 tokens 给用户可观察信号。
    const model = provider?.llm?.models.find(
      (m) => m.id === provider?.llm?.defaultModel,
    );
    const total = (model && provider) ? lookupContextWindow(model, provider) : 0;

    const msgs = currentMessages();
    let used = 0;
    if (total > 0 && msgs.length > 0) {
      // 1. 优先用最新 assistant message 的 inputTokens (API 真实值)
      const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
      if (lastAssistant && lastAssistant.inputTokens != null) {
        used = lastAssistant.inputTokens;
      } else {
        // 2. Fallback:用 system prompt + 所有消息内容长度粗估
        const systemPrompt = appStore.state.value.systemPrompt?.default ?? "";
        used = computeUsedTokensEst(msgs) + Math.ceil(systemPrompt.length / 4);
      }
    }

    const percentage = total > 0 ? Math.min(100, (used / total) * 100) : 0;
    return { percentage, used, total };
  });

  // Auto-scroll to bottom on messages change.
  // 首次进入对话(mount 后第一次 effect 执行)用 instant 直接定位,后续消息追加
  // 用 smooth 让用户感知到新内容到达。
  let hasScrolledInitially = false;
  createEffect(() => {
    currentMessages();
    if (!messagesEndRef) { return; }
    const behavior = hasScrolledInitially ? "smooth" : "instant";
    queueMicrotask(() => messagesEndRef.scrollIntoView({ behavior }));
    hasScrolledInitially = true;
  });

  // Runtime error → toast (ADR-0029 D5 — banner removed; toast replaces it)
  // Tracks prev error to avoid duplicate toasts when lastError stays non-null across renders.
  const currentLastError = (): string | null => {
    const id = convId();
    if (!id) { return null; }
    return store.byId[id]?.lastError ?? null;
  };
  createEffect(() => {
    const err = currentLastError();
    if (err) { codemanToast.error(err); }
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
      if (!text || !id || isRunning()) { return; }

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
    if (!id) { return; }
    cancel(id);
  };

  // ─── ADR-0037: skills for ComboTextarea ──────────────────────────────────
  /** Enabled skills = manifests ∩ appStore.enabledSkills */
  const enabledSkills = createMemo((): readonly SkillManifest[] => {
    const all = skillsManifests$();
    const enabledNames = new Set(appStore.state.value.enabledSkills ?? []);
    return all.filter((s) => enabledNames.has(s.name));
  });

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
        {/* draft field (textarea) — submit-only validation (per UX request) */}
        <form.Field name="draft">
          {(field) => (
            <>
              <label for="chat-input" class="sr-only">
                发条消息
              </label>
              <ComboTextarea
                id="chat-input"
                class="w-full"
                rows={3}
                value={field().state.value}
                onChange={(v) => field().handleChange(v)}
                onKeyDown={(e) => {
                  // ComboTextarea handles `/`, Ctrl+/, ArrowUp/Down/Enter/Esc
                  // when menu is open. This handler runs unconditionally for
                  // keys that don't go through the menu:
                  // - Ctrl/Cmd+Enter: submit form
                  // - ArrowUp/Down when menu closed: input history
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    if (e.defaultPrevented) {return;}
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                    return;
                  }
                  if (e.key === "ArrowUp" && !e.defaultPrevented) {
                    if (handleArrowUpField(field)) {
                      e.preventDefault();
                    }
                    return;
                  }
                  if (e.key === "ArrowDown" && !e.defaultPrevented) {
                    if (handleArrowDownField(field)) {
                      e.preventDefault();
                    }
                    return;
                  }
                }}
                placeholder="发条消息…"
                disabled={isRunning() || form.state.isSubmitting}
                skills={enabledSkills()}
                error={
                  // submit-only: 错误只在用户提交后才显示。isTouched 在 blur 后变 true,
                  // 不再用作显示门控(避免 blur 触发校验后立即渲染错误)。
                  // form.state.isSubmitted 在首次 handleSubmit() 后变 true (TanStack Form)。
                  form.state.isSubmitted
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

          {/* Cluster: [ContextRing] <16px gap> [Send button]
              — 几何常量和组件本身都在 `./context-ring.tsx`。
              — ring 数据来自 `ringInfo` memo(下方 ChatView 派生 state)。 */}
          <div
            class="flex items-center gap-4"
            data-testid="ring-send-cluster"
          >
            {/* 始终渲染 ContextRing — 之前用 <Show when={total > 0}> gate 会让
                model lookup 失败 / settings 数据漂移时环消失,违背"左侧常驻"的设计。
                total=0 时环自然显示 "0% · 0 / 0 tokens",作为可观察信号。 */}
            <ContextRing
              percentage={ringInfo().percentage}
              usedTokens={ringInfo().used}
              totalTokens={ringInfo().total}
            />

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
  if (!provider) { return ""; }
  const raw = providers.find((p) => p.id === provider.id);
  const defaultModel = raw?.llm?.defaultModel;
  if (defaultModel && provider.models.some((m) => m.id === defaultModel)) {
    return defaultModel;
  }
  return provider.models[0]?.id ?? "";
}