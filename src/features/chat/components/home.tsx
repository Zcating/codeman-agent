//! HomeAgentForm — Home 页：无 active conv 时渲染的居中表单 (V2.1 ADR-0022 + V2.1 polish ADR-0023)。
//!
/*! CodemanSidebar 由 routes/index.tsx 单独渲染，不在本组件内部。 */
//!
//! 布局：
//! - 顶部标题 + 子标题
//! - Workspace picker (CodemanSelect dropdown, ADR-0023 D4-S)
//! - Textarea + Send button
//!
//! 状态机：
//! - 0 workspaces → input disabled + "Add workspace" CTA
//! - 1 workspace  → auto-select, input enabled immediately
//! - 2+ workspaces → no pre-select, input disabled until user picks

import { createMemo, createSignal, Show, type JSX } from "solid-js";
import { FolderPlus, Send } from "lucide-solid";
import { appStore } from "../../../shared/stores/app.store";
import { Button } from "../../../shared/components/ui/button";
import { CodemanSelect } from "../../../shared/components/ui/codeman-select";
import type { CodemanSidebarWorkspace } from "../../../shared/components/internal/codeman-sidebar";
import {
  createAndSendConversation,
} from "../stores/conversations.store";
import type { ProviderConfig } from "../lib/runtime";



// ─── HomeAgentForm ──────────────────────────────────────────────────────────────

export function HomeAgentForm(): JSX.Element {
  const workspaces = createMemo((): CodemanSidebarWorkspace[] => {
    const list = appStore.state.value.workspaces ?? [];
    return list.filter((w) => w.enabled).map((w) => ({
      id: w.id,
      label: w.label,
      rootPath: w.root_path,
    }));
  });

  const selectedWorkspaceId = (): string | null => appStore.selectedWorkspaceId();

  const [draftWorkspaceId, setDraftWorkspaceId] = createSignal<string | null>(selectedWorkspaceId());

  const wsCount = createMemo(() => workspaces().length);

  const isInputDisabled = createMemo(() => {
    if (wsCount() === 0) return true;
    if (draftWorkspaceId() === null) return true;
    return false;
  });

  const [input, setInput] = createSignal("");

  const handleSend = async (e: Event) => {
    e.preventDefault();
    const text = input().trim();
    const wsId = draftWorkspaceId();
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

    await createAndSendConversation(wsId, text.slice(0, 30), text, provider);
    setInput("");
  };

  return (
    <div class="flex h-full flex-col items-center justify-center px-6 py-12 overflow-y-auto">
      <div class="w-full max-w-2xl space-y-6">
        <div class="text-center space-y-2">
          <h1 class="text-3xl font-semibold tracking-tight">codeman-agent</h1>
          <p class="text-sm text-muted-foreground">选个 workspace,开始新对话</p>
        </div>

        {/* Workspace picker — C10: replace with CodemanSelect */}
        <Show
          when={wsCount() > 0}
          fallback={
            <div class="text-center p-8 border border-dashed border-border rounded-lg space-y-3">
              <FolderPlus class="h-12 w-12 mx-auto text-muted-foreground/50" aria-hidden="true" />
              <p class="text-sm text-muted-foreground">No workspaces configured.</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  window.location.href = "/settings";
                }}
              >
                Add a workspace
              </Button>
            </div>
          }
        >
          <CodemanSelect
            options={workspaces().map((w) => ({ label: w.label, value: w.id }))}
            value={draftWorkspaceId()}
            onChange={(id) => {
              setDraftWorkspaceId(id);
              appStore.setLastUsedWorkspaceId(id);
            }}
            placeholder="Select a workspace…"
            disabled={false}
            data-testid="workspace-select"
          >
            {/* Action slot: "+ Add new workspace" button */}
            <hr role="separator" />
            <button
              type="button"
              data-testid="workspace-select-add-btn"
              class="w-full px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                window.location.href = "/settings";
              }}
            >
              + Add new workspace…
            </button>
          </CodemanSelect>
        </Show>

        {/* Input form */}
        <form onSubmit={handleSend} class="space-y-2">
          <label for="codex-input" class="sr-only">
            发条消息
          </label>
          <textarea
            id="codex-input"
            data-testid="codex-input"
            rows={3}
            value={input()}
            onInput={(e) => setInput(e.currentTarget.value)}
            disabled={isInputDisabled()}
            placeholder={
              wsCount() === 0
                ? "Add a workspace to start"
                : draftWorkspaceId() === null
                  ? "Select a workspace above"
                  : "发条消息…"
            }
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
          />
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
