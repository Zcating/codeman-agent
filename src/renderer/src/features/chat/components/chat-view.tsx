import { createEffect, createMemo, createSignal, For, Show, type JSX } from "solid-js";
import { Square, Send } from "lucide-solid";
import { createForm } from "@tanstack/solid-form";
import { MessageBubble } from "@codeman-frontend/features/chat/components/message-bubble";
import { store, sendMessage, cancel, setConvModel } from "@codeman-frontend/features/chat/stores/chat.store";
import { doCompact, type DoCompactDeps } from "@codeman-frontend/features/chat/lib/compaction";
import { ParallelPanel } from "@codeman-frontend/features/chat/components/parallel-panel";
import { delegateStreamsStore } from "@codeman-frontend/features/chat/stores/delegate-streams.store";
import {
  ContextRing,
  computeUsedTokensEst,
} from "@codeman-frontend/features/chat/components/context-ring";
import { Button } from "@codeman-frontend/shared/components/ui/button";
import { ScrollArea } from "@codeman-frontend/shared/components/ui/scrollarea";
import { ComboTextarea } from "@codeman-frontend/features/chat/components/combo-textarea";
import { CodemanGroupSelect } from "@codeman-frontend/shared/components/internal/codeman-group-select";
import { codemanToast } from "@codeman-frontend/shared/components/internal/codeman-toast";
import { appStore } from "@codeman-frontend/shared/stores/app.store";
import { formatAppError } from "@codeman-frontend/shared/lib/format-app-error";
import { firstErrorMessage } from "@codeman-frontend/shared/lib/effect-schema-adapter";
import {
  handleArrowUpField,
  handleArrowDownField,
  recordInputEntry,
} from "@codeman-frontend/features/chat/stores/input-history.store";
import { skillsManifests$ } from "@codeman-frontend/features/skills/stores/skills.store";
import type { SkillManifest } from "@codeman-frontend/shared/lib/types";
import type { ThinkingLevel } from "@codeman-frontend/shared/lib/sub-agent-schema";


function ProviderSelect(props: {
  value: string;
  onChange: (modelId: string) => void;
}): JSX.Element {
  const enabledProviders = createMemo(() =>
    (appStore.state.value.providers ?? [])
  );

  const groups = createMemo(() =>
    enabledProviders().map((p) => ({
      label: p.label,
      options: (p.llm?.models ?? []).map((m) => ({ label: m.label, value: m.id })),
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

  const [thinkingLevel, setThinkingLevel] = createSignal<ThinkingLevel>("medium");

  const [compacting, setCompacting] = createSignal(false);

  createEffect(() => {
    setThinkingLevel("medium");
  });

  const showThinkingSelector = createMemo(() => {
    const providers = appStore.state.value.providers ?? [];
    const pid = appStore.state.value.defaultLlmProviderId;
    const provider = providers.find((p) => p.id === pid);
    const model = provider?.llm?.models?.find((m) => m.id === provider?.llm?.defaultModel);
    return model?.thinking === true;
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

  const ringInfo = createMemo(() => {
    const providers = appStore.state.value.providers ?? [];
    const pid = appStore.state.value.defaultLlmProviderId;
    const provider = providers.find((p) => p.id === pid);
    const model = provider?.llm?.models.find(
      (m) => m.id === provider?.llm?.defaultModel,
    );
    const total = (model && provider)
      ? (model.contextWindow ?? provider.llm.contextWindow ?? 200000)
      : 0;

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

  const form = createForm(() => ({
    defaultValues: {
      draft: "",
      modelId: initialModelId(),
    },
    onSubmit: async ({ value }) => {
      const text = value.draft.trim();
      const id = convId();
      if (!text || !id || isRunning()) { return; }

      const providerId = appStore.state.value.defaultLlmProviderId;
      const providerConfig = appStore.state.value.providers?.find((p) => p.id === providerId);
      const modelId = value.modelId || (providerConfig?.llm?.defaultModel ?? "auto");

      form.reset({ draft: "", modelId: value.modelId });
      recordInputEntry(text);

      try {
        await sendMessage(id, text, providerId ?? "", modelId, thinkingLevel());
      } catch (err) {
        codemanToast.error(formatAppError(err));
      }
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
    if (compacting() || isRunning()) { return; }
    const cs = store.byId[id];
    if (!cs) { return; }
    const settings = appStore.state.value;
    const providerId = settings.defaultLlmProviderId;
    const providerConfig = (settings.providers ?? []).find((p) => p.id === providerId);
    const model = providerConfig?.llm?.defaultModel ?? "auto";
    const contextWindow = providerConfig?.llm?.contextWindow ?? 128000;
    const messages = cs.messages;
    const budget = contextWindow - 16384;

    const compactDeps: DoCompactDeps = {
      callSummarize: async (_prompt: string) => {
        codemanToast.error("手动压缩暂未实现");
        return { ok: false, reason: "not_implemented" };
      },
      writeSuccessPair: async () => {},
    };

    setCompacting(true);
    void doCompact(
      id,
      {
        conversationId: id,
        model,
        messages,
        budget,
        tailTurns: settings.compaction?.tailTurns ?? 10,
        previousSummary: null,
        auto: false,
        contextWindow,
        reserveTokens: 16384,
      },
      compactDeps,
    ).then((result) => {
      if ("reason" in result) {
        codemanToast.error(`压缩失败: ${result.reason}`);
      }
    }).finally(() => {
      setCompacting(false);
    });
  };

  const enabledSkills = createMemo((): readonly SkillManifest[] => {
    const all = skillsManifests$();
    const enabledNames = new Set(appStore.state.value.enabledSkills ?? []);
    return all.filter((s) => enabledNames.has(s.name));
  });

  // All parallel panel entries (from sub-agent stream store) — rendered below message list
  const allParallelPanelEntries = createMemo(() =>
    Object.values(delegateStreamsStore.state.byToolCall),
  );

  return (
    <>
      <ScrollArea class="flex-1 min-h-0" data-scroll-region="true">
        <div class="p-4 space-y-3">
          <For each={currentMessages()}>
            {(message) => <MessageBubble message={message} />}
          </For>
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <ParallelPanel entries={allParallelPanelEntries()} />

      <div class="px-3 pb-3 pt-1">
        <form
          class="flex flex-col rounded-2xl border border-border bg-card shadow-md"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <div class="px-3 pt-3">
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
          </div>

          <div class="flex items-center gap-2 px-3 pb-2.5 pt-1">
            <label for="provider-select" class="text-xs text-muted-foreground whitespace-nowrap">
              Provider
            </label>
            <form.Field
              name="modelId"
            >
              {(field) => (
                <ProviderSelect
                  value={field().state.value}
                  onChange={(modelId) => {
                    field().handleChange(modelId);
                    const providers = appStore.state.value.providers ?? [];
                    const provider = providers.find((p) =>
                      p.llm?.models?.some((m) => m.id === modelId),
                    );
                    if (provider) {
                      const id = convId();
                      if (id) { setConvModel(id, provider.id, modelId); }
                    }
                  }}
                />
              )}
            </form.Field>

            <Show when={showThinkingSelector()}>
              <label for="thinking-level-selector" class="text-xs text-muted-foreground whitespace-nowrap">
                Thinking
              </label>
              <select
                id="thinking-level-selector"
                data-testid="thinking-level-selector"
                value={thinkingLevel()}
                onChange={(e) => setThinkingLevel(e.currentTarget.value as ThinkingLevel)}
                class="text-xs rounded border border-border bg-card px-1 py-0.5"
              >
                {(["off", "minimal", "low", "medium", "high", "xhigh"] as const).map((level) => (
                  <option value={level}>{level}</option>
                ))}
              </select>
            </Show>

            <div class="flex-1" />

            <div
              class="flex items-center gap-4"
              data-testid="ring-send-cluster"
            >
              <ContextRing
                percentage={ringInfo().percentage}
                usedTokens={ringInfo().used}
                totalTokens={ringInfo().total}
                compacting={compacting()}
                onCompact={handleCompactNow}
              />

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
      </div>
    </>
  );
}


function initialModelId(): string {
  const providers = appStore.state.value.providers ?? [];
  const providerId = appStore.state.value.defaultLlmProviderId;
  const provider = providers.find((p) => p.id === providerId) ?? providers[0];
  if (!provider) { return ""; }
  const raw = providers.find((p) => p.id === provider.id);
  const defaultModel = raw?.llm?.defaultModel;
  if (defaultModel && provider.llm?.models?.some((m) => m.id === defaultModel)) {
    return defaultModel;
  }
  return provider.llm?.models?.[0]?.id ?? "";
}