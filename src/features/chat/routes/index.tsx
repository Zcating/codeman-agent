//! / — Chat 布局状态机 (V2.1 ADR-0022)。
//!
//! 状态机：
//! - activeId === null → HomeAgentForm (右侧居中)
//! - activeId !== null → ChatView (满屏 + 返回按钮)
//!
//! AgentSidebar 始终显示（workspaces 存在时），负责 workspace 选择和会话列表。

import { Show, type JSX } from "solid-js";
import { ArrowLeft, Settings as SettingsIcon } from "lucide-solid";
import { Link } from "@tanstack/solid-router";
import { ChatView } from "../components/chat-view";
import { HomeAgentForm } from "../components/home";
import { AgentSidebar, type AgentSidebarWorkspace, type AgentSidebarItem } from "../../../shared/components/internal/agent-sidebar";
import {
  store,
  activeId$,
  conversations$,
  selectConversation,
  deleteConversation,
  clearActiveConversation,
} from "../stores/conversations.store";
import { appStore } from "../../../shared/stores/app.store";

// ─── Data mapping helpers ───────────────────────────────────────────────────

function workspacesFromApp(): AgentSidebarWorkspace[] {
  const list = appStore.state.value.workspaces ?? [];
  return list
    .filter((w) => w.enabled)
    .map((w) => ({
      id: w.id,
      label: w.label,
      rootPath: w.root_path,
    }));
}

function itemsFromConversations(): AgentSidebarItem[] {
  const selectedWsId = appStore.selectedWorkspaceId();
  if (!selectedWsId) return [];
  return conversations$()
    .filter((c) => c.workspace_id === selectedWsId)
    .map((c) => ({
      id: c.id,
      label: c.title,
      subLabel: new Date(c.updated_at * 1000).toLocaleDateString("zh-CN"),
      isStreaming: store.byId[c.id]?.streamingMessageId != null,
      isDisabled: c.workspace_id === "",
      disabledReason: c.workspace_id === "" ? "Needs workspace" : undefined,
    }));
}

// ─── ChatLayout ─────────────────────────────────────────────────────────────

export function ChatLayout(): JSX.Element {
  const workspaces = (): AgentSidebarWorkspace[] => workspacesFromApp();
  const items = (): AgentSidebarItem[] => itemsFromConversations();
  const selectedWorkspaceId = (): string | null => appStore.selectedWorkspaceId();
  const selectedItemId = (): string | null => activeId$();

  const handleSelectWorkspace = (id: string) => {
    appStore.setLastUsedWorkspaceId(id);
  };

  const handleSelectItem = (id: string) => selectConversation(id);

  const handleDeleteItem = (id: string) => deleteConversation(id);

  const handleBackToHome = () => clearActiveConversation();

  return (
    <main class="flex h-screen w-full bg-background text-foreground">
      {/* AgentSidebar — visible when workspaces exist or we're on home */}
      <Show when={workspaces().length > 0 || activeId$() !== null}>
        <AgentSidebar
          workspaces={workspaces()}
          selectedWorkspaceId={selectedWorkspaceId()}
          onSelectWorkspace={handleSelectWorkspace}
          items={items()}
          selectedItemId={selectedItemId()}
          onSelectItem={handleSelectItem}
          onDeleteItem={handleDeleteItem}
          onCreateItem={handleBackToHome}
          onAddWorkspace={() => {
            window.location.href = "/settings";
          }}
        />
      </Show>

      <section class="flex-1 flex flex-col overflow-hidden">
        {/* Back button — shown when viewing a conversation */}
        <Show when={activeId$() !== null}>
          <button
            type="button"
            onClick={handleBackToHome}
            class="flex items-center gap-1 px-4 py-2 text-sm text-muted-foreground hover:text-foreground border-b border-border transition-colors"
            aria-label="返回首页"
            data-testid="back-to-home"
          >
            <ArrowLeft class="h-4 w-4" aria-hidden="true" />
            返回首页
          </button>
        </Show>

        {/* Main content area — state machine */}
        <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
          <Show when={activeId$() !== null} fallback={<HomeAgentForm />}>
            <ChatView />
          </Show>
        </div>

        {/* Footer */}
        <footer class="flex items-center justify-between px-4 py-2 border-t border-border bg-card text-xs text-muted-foreground">
          <span>codeman-agent</span>
          <Link
            to="/settings"
            activeProps={{ class: "text-primary font-medium" }}
            inactiveProps={{
              class:
                "hover:text-foreground transition-colors flex items-center gap-1 px-2 py-1 -mx-2 -my-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            }}
          >
            <SettingsIcon class="h-3.5 w-3.5" aria-hidden="true" />
            <span>设置</span>
          </Link>
        </footer>
      </section>
    </main>
  );
}
