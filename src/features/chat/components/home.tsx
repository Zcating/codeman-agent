//! HomeAgentForm — Home 页：无 active conv 时渲染的居中表单 (V2.1 ADR-0022 + V2.1 polish ADR-0023)。
//!
//! CodemanSidebar 由 routes/index.tsx 单独渲染，不在本组件内部。
//!
//! 布局 (D6-H4):
//! - 顶部标题 + 子标题
//! - Textarea (top, full width) — 新布局
//! - row: workspace picker (200px) + LLM picker (200px), gap-2, left-aligned
//! - Send button row: flex justify-end
//!
//! 状态机：
//! - 0 workspaces → input disabled + "Add workspace" CTA
//! - 1 workspace  → auto-select, input enabled immediately
//! - 2+ workspaces → no pre-select, input disabled until user picks

import { createMemo, createSignal, Show, type JSX } from "solid-js";
import { FolderPlus, Send } from "lucide-solid";
import { Effect, Exit } from "effect";
import { useNavigate } from "@tanstack/solid-router";
import { appStore } from "../../../shared/stores/app.store";
import { Button } from "../../../shared/components/ui/button";
import { CodemanSelect } from "../../../shared/components/ui/codeman-select";
import { CodemanGroupSelect } from "../../../shared/components/ui/codeman-group-select";
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

// ─── LlmPicker (D6-H5) ─────────────────────────────────────────────────────────

function LlmPicker(): JSX.Element {
  const groups = createMemo(() =>
    buildEnabledProviders(appStore.state.value.providers ?? []).map((p) => ({
      label: p.label,
      options: p.models.map((m) => ({ label: m.label, value: m.id })),
    }))
  );

  const currentModelId = (): string | null => {
    const providerId = appStore.state.value.default_llm_provider_id;
    const enabled = buildEnabledProviders(appStore.state.value.providers ?? []);
    const provider = enabled.find((p) => p.id === providerId);
    if (!provider) return enabled[0]?.models[0]?.id ?? null;
    return provider.models[0]?.id ?? null;
  };

  const handleChange = (modelId: string) => {
    if (!modelId) return;
    const provider = buildEnabledProviders(appStore.state.value.providers ?? []).find((p) =>
      p.models.some((m) => m.id === modelId),
    );
    if (provider) {
      appStore.set({ default_llm_provider_id: provider.id });
      settingsSaver.scheduleSave();
    }
  };

  return (
    <Show
      when={groups().length > 0}
      fallback={<span class="text-xs text-muted-foreground">无 provider</span>}
    >
      <div class="w-[200px]">
        <CodemanGroupSelect
          groups={groups()}
          value={currentModelId()}
          onChange={handleChange}
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
      rootPath: w.root_path,
    }));
  });

  const selectedWorkspaceId = (): string | null => selectedWorkspaceId$();

  const wsCount = createMemo(() => workspaces().length);

  const isInputDisabled = createMemo(() => {
    if (wsCount() === 0) return true;
    if (selectedWorkspaceId() === null) return true;
    return false;
  });

  const [input, setInput] = createSignal("");
  let textareaRef: HTMLTextAreaElement | undefined;
  const navigate = useNavigate();

  const handleSend = async (e: Event) => {
    e.preventDefault();
    const text = input().trim();
    const wsId = selectedWorkspaceId();
    if (!text || !wsId) return;

    // Build ProviderConfig from appStore
    const providerId = appStore.state.value.default_llm_provider_id;
    const providerConfig = appStore.state.value.providers?.find((p) => p.id === providerId);
    const provider: ProviderConfig = {
      apiKey: providerConfig?.api_key ?? null,
      baseUrl: providerConfig?.llm?.base_url ?? "",
      defaultModel: providerConfig?.llm?.default_model ?? "auto",
      systemPrompt: appStore.state.value.system_prompt?.default ?? "",
      tools: [],
    };

    // Step 1: Create conversation
    const exit = await Effect.runPromiseExit(
      createConversation(wsId, text.slice(0, 30)),
    );
    if (Exit.isFailure(exit)) return;
    const convId = exit.value;

    // Step 2: Clear input + navigate to the new conversation route
    setInput("");
    navigate({ to: "/conversation/$convId", params: { convId } });

    // Step 3: Start streaming (fire-and-forget)
    Effect.runPromiseExit(sendMessage(convId, text, provider));
  };

  return (
    <div class="flex h-full flex-col items-center justify-center px-6 py-12 overflow-y-auto">
      <div class="w-full max-w-2xl space-y-6">
        <div class="text-center space-y-2">
          <h1 class="text-3xl font-semibold tracking-tight">codeman-agent</h1>
          <p class="text-sm text-muted-foreground">选个 workspace,开始新对话</p>
        </div>

        {/* Form — always rendered (D6-H4: textarea top, pickers row, send row) */}
        <form onSubmit={handleSend} class="space-y-2">
          {/* Textarea — top, full width (D6-H4) */}
          <label for="codex-input" class="sr-only">
            发条消息
          </label>
          <textarea
            ref={textareaRef}
            id="codex-input"
            data-testid="codex-input"
            rows={3}
            value={input()}
            onInput={(e) => setInput(e.currentTarget.value)}
            disabled={isInputDisabled()}
            placeholder={
              wsCount() === 0
                ? "Add a workspace to start"
                : selectedWorkspaceId() === null
                  ? "Select a workspace above"
                  : "发条消息…"
            }
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
          />

          {/* Row: workspace picker + LLM picker (D6-H4) */}
          <div class="flex items-center gap-2">
            {/* Workspace picker area — CTA or picker */}
            <Show
              when={wsCount() > 0}
              fallback={
                <div class="w-[200px]">
                  <div class="flex h-10 items-center justify-center rounded-md border border-dashed border-input bg-background px-3 py-2 text-sm text-muted-foreground">
                    <FolderPlus class="h-4 w-4 mr-2" aria-hidden="true" />
                    No workspaces
                  </div>
                </div>
              }
            >
              <div class="w-[200px]">
                <CodemanSelect
                  options={workspaces().map((w) => ({ label: w.label, value: w.id }))}
                  value={selectedWorkspaceId()}
                  onChange={(id) => {
                    setSelectedWorkspaceId(id);
                  }}
                  placeholder="Select a workspace…"
                  disabled={false}
                  data-testid="workspace-select"
                >
                  {/* Action slot: "+ Add new workspace" button (D6-H1) */}
                  <hr role="separator" />
                  <button
                    type="button"
                    data-testid="workspace-select-add-btn"
                    class="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={async () => {
                      const exit = await Effect.runPromiseExit(addWorkspace());
                      if (exit._tag === "Failure") return;
                      textareaRef?.focus();
                    }}
                  >
                    + Add new workspace…
                  </button>
                </CodemanSelect>
              </div>
            </Show>

            {/* LLM picker (D6-H5) */}
            <LlmPicker />
          </div>

          {/* Send button row: right-aligned (D6-H4) */}
          <div class="flex justify-end">
            <Button
              type="submit"
              disabled={isInputDisabled() || input().trim().length === 0}
              aria-label="发送消息"
              data-testid="codex-send"
            >
              <Send class="h-4 w-4 mr-2" aria-hidden="true" />
              发送
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
