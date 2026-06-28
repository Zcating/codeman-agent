//! / — Chat 布局状态机 (V2.1 ADR-0022)。
//!
//! 状态机：
//! - activeId === null → HomeAgentForm (右侧居中)
//! - activeId !== null → ChatView (满屏 + 返回按钮)
//!
//! CodemanSidebar 始终显示（workspaces 存在时），负责 workspace 选择和会话列表。

import { Show, type JSX } from "solid-js";
import { ArrowLeft, Settings as SettingsIcon } from "lucide-solid";
import { Link } from "@tanstack/solid-router";
import { ChatView } from "../components/chat-view";
import { HomeAgentForm } from "../components/home";
import { CodemanSidebar, type WorkspaceNode } from "../../../shared/components/internal/codeman-sidebar";
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

function buildSidebarNodes(): WorkspaceNode[] {
  const workspaces = appStore.state.value.workspaces?.filter((w) => w.enabled) ?? [];
  const allConvs = conversations$() ?? [];
  return workspaces.map((ws) => {
    const wsConvs = allConvs
      .filter((c) => c.workspace_id === ws.id) // 自动过滤 workspace_id === ""
      .sort((a, b) => b.updated_at - a.updated_at);
    return {
      kind: "workspace" as const,
      id: ws.id,
      label: ws.label,
      rootPath: ws.root_path,
      children: wsConvs.map((c) => ({
        kind: "conv" as const,
        id: c.id,
        label: c.title,
        subLabel: new Date(c.updated_at * 1000).toLocaleDateString("zh-CN"),
        isStreaming: store.byId[c.id]?.streamingMessageId != null,
        // 不再设 isDisabled/disableReason — V1.x 迁移 conv 不进 sidebar（D7-CS7）
      })),
    };
  });
}

function workspacesExist(): boolean {
  return (appStore.state.value.workspaces?.filter((w) => w.enabled).length ?? 0) > 0;
}

// ─── ChatLayout ─────────────────────────────────────────────────────────────

export function ChatLayout(): JSX.Element {
  const selectedItemId = (): string | null => activeId$();

  const handleSelectItem = (id: string) => selectConversation(id);

  const handleDeleteItem = (id: string) => deleteConversation(id);

  const handleBackToHome = () => clearActiveConversation();

  const handleEmptyWorkspaceClick = (wsId: string) => {
    appStore.setLastUsedWorkspaceId(wsId);
    clearActiveConversation();
  };

  return (
    <main class="flex h-screen w-full bg-background text-foreground">
      {/* CodemanSidebar — visible when workspaces exist or active conv exists */}
      <Show when={workspacesExist() || activeId$() !== null}>
        <CodemanSidebar
          nodes={buildSidebarNodes()}
          selectedItemId={selectedItemId()}
          onSelectItem={handleSelectItem}
          onDeleteItem={handleDeleteItem}
          onCreateItem={handleBackToHome}
          onAddWorkspace={() => {
            window.location.href = "/settings";
          }}
          onEmptyWorkspaceClick={handleEmptyWorkspaceClick}
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
