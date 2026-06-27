//! HomeAgentForm — Home 页：无 active conv 时渲染的居中表单 (V2.1 ADR-0022)。
//!
/*! AgentSidebar 由 routes/index.tsx 单独渲染，不在本组件内部。 */
//!
//! 布局：
//! - 顶部标题 + 子标题
//! - Workspace picker (cards grid)
//! - Textarea + Send button
//!
//! 状态机：
//! - 0 workspaces → input disabled + "Add workspace" CTA
//! - 1 workspace  → auto-select, input enabled immediately
//! - 2+ workspaces → no pre-select, input disabled until user picks card

import { createMemo, createSignal, For, Show, type JSX } from "solid-js";
import { Folder, FolderPlus, Send } from "lucide-solid";
import { appStore } from "../../../shared/stores/app.store";
import { Button } from "../../../shared/components/ui/button";
import type { AgentSidebarWorkspace } from "../../../shared/components/internal/agent-sidebar";
import {
  createAndSendConversation,
} from "../stores/conversations.store";
import type { ProviderConfig } from "../lib/runtime";

interface WorkspaceCardProps {
  id: string;
  label: string;
  rootPath: string;
  selected: boolean;
  onSelect: (id: string) => void;
}

function WorkspaceCard(props: WorkspaceCardProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => props.onSelect(props.id)}
      class={`flex items-start gap-3 p-4 rounded-lg border transition-all text-left w-full ${
        props.selected
          ? "border-primary bg-primary/10 ring-2 ring-primary/30"
          : "border-border hover:border-primary/50 hover:bg-accent"
      }`}
      data-testid={`workspace-card-${props.id}`}
    >
      <Folder class="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
      <div class="flex-1 min-w-0">
        <div class="font-medium truncate">{props.label}</div>
        <div class="text-xs text-muted-foreground truncate font-mono">{props.rootPath}</div>
      </div>
    </button>
  );
}

// ─── HomeAgentForm ──────────────────────────────────────────────────────────────

export function HomeAgentForm(): JSX.Element {
  const workspaces = createMemo((): AgentSidebarWorkspace[] => {
    const list = appStore.state.value.workspaces ?? [];
    return list.filter((w) => w.enabled).map((w) => ({
      id: w.id,
      label: w.label,
      rootPath: w.root_path,
    }));
  });

  const selectedWorkspaceId = (): string | null => appStore.selectedWorkspaceId();

  const [draftWorkspaceId, setDraftWorkspaceId] = createSignal<string | null>(selectedWorkspaceId());

  const handleSelectWorkspace = (id: string) => {
    setDraftWorkspaceId(id);
    appStore.setLastUsedWorkspaceId(id);
  };

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

        {/* Workspace picker */}
        <div>
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
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="workspace-picker">
              <For each={workspaces()}>
                {(ws) => (
                  <WorkspaceCard
                    id={ws.id}
                    label={ws.label}
                    rootPath={ws.rootPath}
                    selected={draftWorkspaceId() === ws.id}
                    onSelect={handleSelectWorkspace}
                  />
                )}
              </For>
            </div>
          </Show>
        </div>

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
