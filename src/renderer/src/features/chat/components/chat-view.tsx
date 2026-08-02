import { createEffect, createMemo, For, Show, onMount, type JSX } from "solid-js";
import { Effect, Exit } from "effect";
import { Square, Send, Minimize2, Loader2 } from "lucide-solid";
import { createForm } from "@tanstack/solid-form";
import { MessageBubble } from "@codeman-frontend/features/chat/components/message-bubble";
import { CompactionMarker } from "@codeman-frontend/features/chat/components/compaction-marker";
import { store, sendMessage, cancel, compactNow } from "@codeman-frontend/features/chat/stores/chat.store";
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
import { skillsManifests$ } from "@codeman-frontend/plugins/skills/stores/skills.store";
import type { SkillManifest } from "@codeman-frontend/shared/lib/types";


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


export function ChatView(props: { convId?: string }): JSX.Element {
  const convId = (): string | undefined => props.convId;
  let messagesEndRef: HTMLDivElement | undefined;

  onMount(() => {
    startThemeSync();
  });

  const isRunning = (): boolean => {
    const id = convId();
    if (!id) { return false; }
    return store.byId[id]?.isAgentActive === true;
  };

  const currentMessages = () => {
    const id = convId();
    if (!id) { return []; }
    return store.byId[id]?.messages ?? [];
  };

  const compactionEntries = () => {
    const id = convId();
    if (!id) { return []; }
    return store.byId[id]?.compactionEntries ?? [];
  };

  const compactionStatus = () => {
    const id = convId();
    if (!id) { return { _tag: "idle" } as const; }
    return store.byId[id]?.compactionStatus ?? { _tag: "idle" };
  };

  type InterleavedItem =
    | { _tag: "message"; message: (ReturnType<typeof currentMessages>[number]) }
    | { _tag: "compaction"; entry: (ReturnType<typeof compactionEntries>[number]) };

  const interleavedItems = (): InterleavedItem[] => {
    const msgs = currentMessages();
    const entries = compactionEntries();
    const result: InterleavedItem[] = [];
    let msgIdx = 0;
    let entryIdx = 0;

    while (msgIdx < msgs.length || entryIdx < entries.length) {
      const nextMsg = msgs[msgIdx];
      const nextEntry = entries[entryIdx];

      if (!nextMsg) {
        // All messages consumed, append remaining entries
        while (entryIdx < entries.length) {
          result.push({ _tag: "compaction", entry: entries[entryIdx++] });
        }
        break;
      }
      if (!nextEntry) {
        // All entries consumed, append remaining messages
        while (msgIdx < msgs.length) {
          result.push({ _tag: "message", message: msgs[msgIdx++] });
        }
        break;
      }

      if (nextMsg.createdAt <= nextEntry.createdAt) {
        result.push({ _tag: "message", message: nextMsg });
        msgIdx++;
      } else {
        result.push({ _tag: "compaction", entry: nextEntry });
        entryIdx++;
      }
    }
    return result;
  };

  const ringInfo = createMemo(() => {
    const providers = appStore.state.value.providers ?? [];
    const pid = appStore.state.value.defaultLlmProviderId;
    const provider = providers.find((p) => p.id === pid);
    const model = provider?.llm?.models.find(
      (m) => m.id === provider?.llm?.defaultModel,
    );
    const total = (model && provider) ? lookupContextWindow(model, provider) : 0;

    const msgs = currentMessages();
    let used = 0;
    if (total > 0 && msgs.length > 0) {
      const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
      if (lastAssistant && lastAssistant.inputTokens != null) {
        used = lastAssistant.inputTokens;
      } else {
        const systemPrompt = appStore.state.value.systemPrompt?.default ?? "";
        used = computeUsedTokensEst(msgs) + Math.ceil(systemPrompt.length / 4);
      }
    }

    const percentage = total > 0 ? Math.min(100, (used / total) * 100) : 0;
    return { percentage, used, total };
  });

  let hasScrolledInitially = false;
  createEffect(() => {
    currentMessages();
    if (!messagesEndRef) { return; }
    const behavior = hasScrolledInitially ? "smooth" : "instant";
    queueMicrotask(() => messagesEndRef.scrollIntoView({ behavior }));
    hasScrolledInitially = true;
  });

  const currentLastError = (): string | null => {
    const id = convId();
    if (!id) { return null; }
    return store.byId[id]?.lastError ?? null;
  };
  createEffect(() => {
    const err = currentLastError();
    if (err) { codemanToast.error(err); }
  });

  // Show toast when compaction fails
  createEffect(() => {
    const status = compactionStatus();
    if (status._tag === "failed") {
      codemanToast.error(status.reason);
    }
  });

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

      const providerId = appStore.state.value.defaultLlmProviderId;
      const providerConfig = appStore.state.value.providers?.find((p) => p.id === providerId);
      const provider: ProviderConfig = {
        id: providerConfig?.id ?? "",
        models: providerConfig?.llm?.models ?? [],
        apiKey: providerConfig?.apiKey,
        baseUrl: providerConfig?.llm?.baseUrl ?? "",
        defaultModel: providerConfig?.llm?.defaultModel ?? "auto",
        systemPrompt: appStore.state.value.systemPrompt?.default ?? "",
        tools: [],
      };

      form.reset({ draft: "", modelId: value.modelId });
      recordInputEntry(text);

      void Effect.runPromiseExit(sendMessage(id, text, provider)).then((exit) => {
        if (Exit.isFailure(exit)) {
          codemanToast.error(formatAppError(exit.cause));
        }
      });
    },
  }));

  const handleCancel = () => {
    const id = convId();
    if (!id) { return; }
    cancel(id);
  };

  const handleCompactNow = () => {
    const id = convId();
    if (!id) { return; }
    void Effect.runPromiseExit(compactNow(id)).then((exit) => {
      if (Exit.isFailure(exit)) {
        codemanToast.error(String(exit.cause));
      }
    });
  };

  const enabledSkills = createMemo((): readonly SkillManifest[] => {
    const all = skillsManifests$();
    const enabledNames = new Set(appStore.state.value.enabledSkills ?? []);
    return all.filter((s) => enabledNames.has(s.name));
  });

  return (
    <>
      <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        <For each={interleavedItems()}>
          {(item) =>
            item._tag === "message"
              ? <MessageBubble message={item.message} />
              : <CompactionMarker entry={item.entry} />}
        </For>
        <div ref={messagesEndRef} />
      </div>

      <form
        class="flex flex-col gap-2 p-3 border-t border-border bg-card"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        {}
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
                  form.state.isSubmitted
                    ? firstErrorMessage(field().state.meta.errors)
                    : undefined
                }
              />
            </>
          )}
        </form.Field>

        {}
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

          {}
          <div
            class="flex items-center gap-4"
            data-testid="ring-send-cluster"
          >
            {}
            <ContextRing
              percentage={ringInfo().percentage}
              usedTokens={ringInfo().used}
              totalTokens={ringInfo().total}
            />

            {}
            <Show
              when={compactionStatus()._tag !== "compacting"}
              fallback={
                <Button
                  type="button"
                  variant="secondary"
                  disabled
                  aria-label="压缩中"
                  data-testid="compaction-spinner"
                >
                  <Loader2 class="h-4 w-4 animate-spin" />
                </Button>
              }
            >
              <Button
                type="button"
                variant="secondary"
                onClick={handleCompactNow}
                aria-label="立即压缩上下文"
                data-testid="compact-now-button"
              >
                立即压缩
                <Minimize2 class="h-4 w-4" />
              </Button>
            </Show>

            {}
            <form.Subscribe
              selector={(state) => ({
                canSubmit: state.canSubmit,
                isSubmitting: state.isSubmitting,
              })}
            >
              {(sub) => (
                <Show
                  when={isRunning()}
                  fallback={
                    <Button
                      type="submit"
                      disabled={!sub().canSubmit || isRunning()}
                      aria-label="发送消息"
                    >
                      {sub().isSubmitting ? "提交中…" : "发送"}
                      <Send class="h-4 w-4" />
                    </Button>
                  }
                >
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleCancel}
                    aria-label="停止运行"
                  >
                    停止
                    <Square class="h-4 w-4" />
                  </Button>
                </Show>
              )}
            </form.Subscribe>
          </div>
        </div>
      </form>
    </>
  );
}


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