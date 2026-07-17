//! HomeAgentForm — Home 页：无 active conv 时渲染的居中表单 (V2.5, ADR-0029)。
//!
//! V2.5 (ADR-0029): 从 `createSignal` + 原生 `<form onSubmit>` 切换到 `@tanstack/solid-form` 的
//! `createForm` + 3 个 `form.Field`（`draft` / `modelId` / `workspaceId`）。typing 期间不写
//! appStore / chatStore；提交时 form-level validator + onSubmit handler 走 3 步流程。
//!
//! Layout (D6-H4, 保持):
//! - 顶部标题 + 子标题
//! - Textarea (top, full width)
//! - row: workspace picker (200px) + LLM picker (200px)
//! - Send button row: flex justify-end
//!
//! 状态机（保持）：
//! - 0 workspaces → input disabled + "Add workspace" CTA
//! - 1 workspace  → auto-select, input enabled
//! - 2+ workspaces → 无预选, input disabled until user picks

import { createMemo, Show, type JSX } from "solid-js";
import { Send } from "lucide-solid";
import { Effect, Exit } from "effect";
import { useNavigate } from "@tanstack/solid-router";
import { createForm } from "@tanstack/solid-form";
import { appStore } from "../../../shared/stores/app.store";
import { formatAppError } from "../../../shared/lib/format-app-error";
import { effectSchema, firstErrorMessage } from "../../../shared/lib/effect-schema-adapter";
import { Button } from "../../../shared/components/ui/button";
import { CodemanSelect } from "../../../shared/components/internal/codeman-select";
import { CodemanGroupSelect } from "../../../shared/components/internal/codeman-group-select";
import { CodemanTextarea } from "../../../shared/components/internal/codeman-textarea";
import { codemanToast } from "../../../shared/components/internal/codeman-toast";
import {
  workspaces$,
  selectedWorkspaceId$,
  setSelectedWorkspaceId,
  addWorkspace,
  createConversation,
  sendMessage,
} from "../stores/chat.store";
import type { ProviderConfig } from "../lib/runtime";
import { buildEnabledProviders } from "../lib/build-enabled-providers";
import { settingsSaver } from "../../settings/lib/settings-saver";
import {
  handleArrowUpField,
  handleArrowDownField,
  recordInputEntry,
} from "../stores/input-history.store";
import {
  DraftFieldSchema,
  ModelIdFieldSchema,
  WorkspaceIdFieldSchema,
  HomeFormSchema,
  type HomeFormValue,
} from "../lib/schemas";

// ─── LlmPicker (D6-H5) ─────────────────────────────────────────────────────────

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

// ─── HomeAgentForm ──────────────────────────────────────────────────────────────

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

  // ─── Form ──────────────────────────────────────────────────────────────────
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

      // Build ProviderConfig from appStore (always read at submit-time, per ADR-0019 D2)
      const providerId = appStore.state.value.defaultLlmProviderId;
      const providerConfig = appStore.state.value.providers?.find((p) => p.id === providerId);
      const provider: ProviderConfig = {
        apiKey: providerConfig?.apiKey,
        baseUrl: providerConfig?.llm?.baseUrl ?? "",
        defaultModel: providerConfig?.llm?.defaultModel ?? "auto",
        systemPrompt: appStore.state.value.systemPrompt?.default ?? "",
        tools: [],
      };

      // Step 1: Create conversation
      const exit = await Effect.runPromiseExit(
        createConversation(wsId, text.slice(0, 30)),
      );
      if (Exit.isFailure(exit)) {
        // Silent-drop bug fix (ADR-0029 D5): surface failure via toast
        codemanToast.error(formatAppError(exit.cause));
        return;
      }
      const convId = exit.value;

      // Step 2: Clear draft + record history entry + navigate
      form.reset({ draft: "", modelId: value.modelId, workspaceId: value.workspaceId });
      recordInputEntry(text);
      navigate({ to: "/conversation/$convId", params: { convId } });

      // Step 3: Start streaming (fire-and-forget)
      void Effect.runPromiseExit(sendMessage(convId, text, provider));
    },
  }));

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const isInputDisabled = createMemo(() => {
    if (wsCount() === 0) return true;
    // form.values.workspaceId is "" until user picks (sentinel); gate input + form-level validator handles submit.
    if (form.state.values.workspaceId === "") return true;
    return false;
  });

  const placeholder = createMemo(() => {
    if (wsCount() === 0) return "Add a workspace to start";
    if (form.state.values.workspaceId === "") return "Select a workspace above";
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
          {/* draft field (textarea) */}
          <form.Field
            name="draft"
            validators={{ onBlur: effectSchema(DraftFieldSchema) }}
          >
            {(field) => (
              <>
                <label for="codex-input" class="sr-only">
                  发条消息
                </label>
                <CodemanTextarea
                  id="codex-input"
                  data-testid="codex-input"
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
                  disabled={isInputDisabled() || form.state.isSubmitting}
                  placeholder={placeholder()}
                  error={
                    field().state.meta.isTouched
                      ? firstErrorMessage(field().state.meta.errors)
                      : undefined
                  }
                />
              </>
            )}
          </form.Field>

          {/* row: workspace picker + LLM picker */}
          <div class="flex items-center gap-2">
            {/* workspace picker — bound to form.Field "workspaceId" */}
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
                      // Keep chatStore.selectedWorkspaceId$ in sync (sidebar / future reads)
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
                        if (!ws) return; // picker cancelled
                        // Form field picks up the new workspace
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

            {/* LLM picker — bound to form.Field "modelId" + appStore sync */}
            <form.Field
              name="modelId"
              validators={{ onBlur: effectSchema(ModelIdFieldSchema) }}
            >
              {(field) => (
                <LlmPicker
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
          </div>

          {/* Send button — disabled when form not submittable */}
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

// ─── Helpers (module-level) ────────────────────────────────────────────────────

/** Default model id for the form. Falls back to first enabled provider's first model. */
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