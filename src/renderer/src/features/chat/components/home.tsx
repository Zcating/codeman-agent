
import { createMemo, createEffect, Show, type JSX } from "solid-js";
import { Send } from "lucide-solid";
import { Effect, Exit } from "effect";
import { useNavigate } from "@tanstack/solid-router";
import { createForm } from "@tanstack/solid-form";
import { appStore } from "@codeman-frontend/shared/stores/app.store";
import { formatAppError } from "@codeman-frontend/shared/lib/format-app-error";
import { effectSchema, firstErrorMessage } from "@codeman-frontend/shared/lib/effect-schema-adapter";
import { Button } from "@codeman-frontend/shared/components/ui/button";
import { CodemanSelect } from "@codeman-frontend/shared/components/internal/codeman-select";
import { CodemanGroupSelect } from "@codeman-frontend/shared/components/internal/codeman-group-select";
import { ComboTextarea } from "@codeman-frontend/features/chat/components/combo-textarea";
import { codemanToast } from "@codeman-frontend/shared/components/internal/codeman-toast";
import {
  workspaces$,
  selectedWorkspaceId$,
  setSelectedWorkspaceId,
  addWorkspace,
  createConversation,
  sendMessage,
} from "@codeman-frontend/features/chat/stores/chat.store";
import type { ProviderConfig } from "@codeman-frontend/features/chat/lib/runtime";
import { buildEnabledProviders } from "@codeman-frontend/features/chat/lib/build-enabled-providers";
import { settingsSaver } from "@codeman-frontend/features/settings/lib/settings-saver";
import {
  handleArrowUpField,
  handleArrowDownField,
  recordInputEntry,
} from "@codeman-frontend/features/chat/stores/input-history.store";
import {
  ModelIdFieldSchema,
  WorkspaceIdFieldSchema,
  HomeFormSchema,
  type HomeFormValue,
} from "@codeman-frontend/features/chat/lib/schemas";
import { skillsManifests$ } from "@codeman-frontend/plugins/skills/stores/skills.store";
import type { SkillManifest } from "@codeman-frontend/shared/lib/types";

function LlmPicker(props: {
  value: string;
  onChange: (modelId: string) => void;
}): JSX.Element {
  const groups = createMemo(() =>
    buildEnabledProviders(appStore.state.value.providers ?? []).map((p) => ({
      label: p.label,
      options: p.models.map((m) => ({ label: m.label, value: m.id })),
    }))
  );

  return (
    <Show
      when={groups().length > 0}
      fallback={<span class="text-xs text-muted-foreground">无 provider</span>}
    >
      <div class="w-[200px]">
        <CodemanGroupSelect
          groups={groups()}
          value={props.value}
          onChange={props.onChange}
          placeholder="选择模型"
          disabled={false}
          aria-label="选择 LLM provider"
          data-testid="llm-picker"
        />
      </div>
    </Show>
  );
}


interface HomeWorkspaceItem {
  id: string;
  label: string;
  rootPath: string;
}

export function HomeAgentForm(): JSX.Element {
  const workspaces = createMemo((): HomeWorkspaceItem[] => {
    const list = workspaces$() ?? [];
    return list.map((w) => ({
      id: w.id,
      label: w.label,
      rootPath: w.rootPath,
    }));
  });

  const wsCount = createMemo(() => workspaces().length);
  const initialWorkspaceId = (): string => selectedWorkspaceId$() ?? "";

  const navigate = useNavigate();


  const form = createForm(() => ({
    defaultValues: {
      draft: "",
      modelId: initialModelId(),
      workspaceId: initialWorkspaceId(),
    } satisfies HomeFormValue,
    validators: {
      onMount: effectSchema(HomeFormSchema),
      onChange: effectSchema(HomeFormSchema),
    },
    onSubmit: async ({ value }) => {
      const text = value.draft.trim();
      const wsId = value.workspaceId;

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

      const exit = await Effect.runPromiseExit(
        createConversation(wsId, text.slice(0, 30)),
      );
      if (Exit.isFailure(exit)) {
        codemanToast.error(formatAppError(exit.cause));
        return;
      }
      const convId = exit.value;

      form.reset({ draft: "", modelId: value.modelId, workspaceId: value.workspaceId });
      recordInputEntry(text);
      navigate({ to: "/conversation/$convId", params: { convId } });

      void Effect.runPromiseExit(sendMessage(convId, text, provider));
    },
  }));

  const enabledSkills = createMemo((): readonly SkillManifest[] => {
    const all = skillsManifests$();
    const enabledNames = new Set(appStore.state.value.enabledSkills ?? []);
    return all.filter((s) => enabledNames.has(s.name));
  });

  createEffect(() => {
    const wsId = selectedWorkspaceId$();
    if (wsId && wsId !== form.state.values.workspaceId) {
      form.setFieldValue("workspaceId", wsId);
    }
  });

  const isInputDisabled = createMemo(() => {
    if (wsCount() === 0) {return true;}
    if (selectedWorkspaceId$() === null) {return true;}
    return false;
  });

  const placeholder = createMemo(() => {
    if (wsCount() === 0) {return "Add a workspace to start";}
    if (form.useSelector((s) => s.values.workspaceId)() === "") {return "Select a workspace above";}
    return "发条消息…";
  });

  return (
    <div class="flex h-full flex-col items-center justify-center px-6 py-12 overflow-y-auto">
      <div class="w-full max-w-2xl space-y-6">
        <div class="text-center space-y-2">
          <h1 class="text-3xl font-semibold tracking-tight">codeman-agent</h1>
          <p class="text-sm text-muted-foreground">选个 workspace,开始新对话</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          class="space-y-2"
        >
          {}
          <form.Field name="draft">
            {(field) => (
              <>
                <label for="codex-input" class="sr-only">
                  发条消息
                </label>
                <ComboTextarea
                  id="codex-input"
                  data-testid="codex-input"
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
                  disabled={isInputDisabled() || form.state.isSubmitting}
                  placeholder={placeholder()}
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
            {}
            <form.Field
              name="workspaceId"
              validators={{ onBlur: effectSchema(WorkspaceIdFieldSchema) }}
            >
              {(field) => (
                <div class="w-[200px]">
                  <CodemanSelect
                    options={workspaces().map((w) => ({ label: w.label, value: w.id }))}
                    value={field().state.value}
                    onChange={(id) => {
                      field().handleChange(id);
                      setSelectedWorkspaceId(id);
                    }}
                    placeholder="Select a workspace…"
                    disabled={false}
                    data-testid="workspace-select"
                  >
                    <button
                      type="button"
                      data-testid="workspace-select-add-btn"
                      class="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={async () => {
                        const exit = await Effect.runPromiseExit(addWorkspace());
                        if (Exit.isFailure(exit)) {
                          codemanToast.error(formatAppError(exit.cause));
                          return;
                        }
                        const ws = exit.value as { id: string } | null;
                        if (!ws) {return;} 
                        field().handleChange(ws.id);
                        setSelectedWorkspaceId(ws.id);
                      }}
                    >
                      + Add new workspace…
                    </button>
                  </CodemanSelect>
                </div>
              )}
            </form.Field>

            {}
            <form.Field
              name="modelId"
              validators={{ onBlur: effectSchema(ModelIdFieldSchema) }}
            >
              {(field) => (
                <LlmPicker
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
          </div>

          {}
          <div class="flex justify-end">
            <form.Subscribe
              selector={(state) => ({
                canSubmit: state.canSubmit,
                isSubmitting: state.isSubmitting,
              })}
            >
              {(sub) => (
                <Button
                  type="submit"
                  disabled={!sub().canSubmit || isInputDisabled()}
                  aria-label="发送消息"
                  data-testid="codex-send"
                >
                  <Send class="h-4 w-4 mr-2" aria-hidden="true" />
                  {sub().isSubmitting ? "提交中…" : "发送"}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </div>
    </div>
  );
}

function initialModelId(): string {
  const providers = appStore.state.value.providers ?? [];
  const enabled = buildEnabledProviders(providers);
  const providerId = appStore.state.value.defaultLlmProviderId;
  const provider = enabled.find((p) => p.id === providerId) ?? enabled[0];
  if (!provider) {return "";}
  const raw = providers.find((p) => p.id === provider.id);
  const defaultModel = raw?.llm?.defaultModel;
  if (defaultModel && provider.models.some((m) => m.id === defaultModel)) {
    return defaultModel;
  }
  return provider.models[0]?.id ?? "";
}