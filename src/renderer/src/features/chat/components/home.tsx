
import { createMemo, createEffect, Show, type JSX } from "solid-js";
import { Send } from "lucide-solid";
import { useNavigate } from "@tanstack/solid-router";
import { createForm } from "@tanstack/solid-form";
import { appStore } from "@codeman-frontend/shared/stores/app.store";
import { formatAppError } from "@codeman-frontend/shared/lib/format-app-error";
import { firstErrorMessage } from "@codeman-frontend/shared/lib/effect-schema-adapter";
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
  selectHomeModel,
  homeSelectedProviderId$,
  homeSelectedModelId$,
} from "@codeman-frontend/features/chat/stores/chat.store";
import {
  handleArrowUpField,
  handleArrowDownField,
  recordInputEntry,
} from "@codeman-frontend/features/chat/stores/input-history.store";
import { skillsManifests$ } from "@codeman-frontend/features/skills/stores/skills.store";
import type { SkillManifest } from "@codeman-frontend/shared/lib/types";

function LlmPicker(props: {
  value: string;
  onChange: (modelId: string) => void;
}): JSX.Element {
  const groups = createMemo(() =>
    (appStore.state.value.providers ?? []).map((p) => ({
      label: p.label,
      options: (p.llm?.models ?? []).map((m) => ({ label: m.label, value: m.id })),
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

const toHomeWorkspaceItem = (w: unknown): HomeWorkspaceItem => {
  const obj = w as { id: string; label: string; rootPath: string };
  return { id: obj.id, label: obj.label, rootPath: obj.rootPath };
};

export function HomeAgentForm(): JSX.Element {
  const workspaces = createMemo((): HomeWorkspaceItem[] => {
    const list = workspaces$() ?? [];
    return list.map(toHomeWorkspaceItem);
  });

  const wsCount = createMemo(() => workspaces().length);
  const initialWorkspaceId = (): string => selectedWorkspaceId$() ?? "";

  const navigate = useNavigate();


  const form = createForm(() => ({
    defaultValues: {
      draft: "",
      modelId: initialModelId(),
      workspaceId: initialWorkspaceId(),
    },
    onSubmit: async ({ value }) => {
      const text = value.draft.trim();
      const wsId = value.workspaceId;

      const providerId = homeSelectedProviderId$() ?? appStore.state.value.defaultLlmProviderId;
      const providerConfig = appStore.state.value.providers?.find((p) => p.id === providerId);
      const modelId = homeSelectedModelId$() ?? providerConfig?.llm?.defaultModel ?? "auto";

      let convId: string;
      try {
        convId = await createConversation(wsId, text.slice(0, 30));
      } catch (err) {
        codemanToast.error(formatAppError(err));
        return;
      }

      form.reset({ draft: "", modelId: value.modelId, workspaceId: value.workspaceId });
      recordInputEntry(text);
      navigate({ to: "/conversation/$convId", params: { convId } });

      try {
        await sendMessage(convId, text, providerId ?? "", modelId);
      } catch (err) {
        codemanToast.error(formatAppError(err));
      }
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
    <div class="flex h-full flex-col items-center justify-center px-6 py-12">
      <div class="w-full max-w-2xl space-y-6">
        <div class="text-center space-y-2">
          <h1 class="text-3xl font-semibold tracking-tight">codeman-agent</h1>
          <p class="text-sm text-muted-foreground">选个 workspace,开始新对话</p>
        </div>

        <div class="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-md">
          <span class="text-xs font-medium text-muted-foreground whitespace-nowrap">当前工作区</span>
          <form.Field
            name="workspaceId"
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
                      let ws: { id: string } | null | unknown;
                      try {
                        ws = await addWorkspace();
                      } catch (err) {
                        codemanToast.error(formatAppError(err));
                        return;
                      }
                      if (!ws) {return;}
                      const wsObj = ws as { id: string };
                      field().handleChange(wsObj.id);
                      setSelectedWorkspaceId(wsObj.id);
                    }}
                  >
                    + Add new workspace…
                  </button>
                </CodemanSelect>
              </div>
            )}
          </form.Field>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          class="flex flex-col rounded-2xl border border-border bg-card shadow-md"
        >
          <div class="px-3 pt-3">
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
          </div>

          <div class="flex items-center gap-2 px-3 pb-2.5 pt-1">
            <form.Field
              name="modelId"
            >
              {(field) => (
                <LlmPicker
                  value={field().state.value}
                  onChange={(modelId) => {
                    field().handleChange(modelId);
                    const providers = appStore.state.value.providers ?? [];
                    const provider = providers.find((p) =>
                      p.llm?.models?.some((m) => m.id === modelId),
                    );
                    if (provider) {
                      selectHomeModel(provider.id, modelId);
                    }
                  }}
                />
              )}
            </form.Field>
            <div class="flex-1" />

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
  const enabled = providers;
  const providerId = appStore.state.value.defaultLlmProviderId;
  const provider = enabled.find((p) => p.id === providerId) ?? enabled[0];
  if (!provider) {return "";}
  const raw = providers.find((p) => p.id === provider.id);
  const defaultModel = raw?.llm?.defaultModel;
  if (defaultModel && provider.llm?.models?.some((m) => m.id === defaultModel)) {
    return defaultModel;
  }
  return provider.llm?.models?.[0]?.id ?? "";
}