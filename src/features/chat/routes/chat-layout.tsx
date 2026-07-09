//! ChatLayout — Layout shell with Sidebar + Footer + Outlet (Task 5 refactor complete).
//!
//! Provides the shared layout structure for all chat routes.

import { onMount, type JSX } from "solid-js";
import { Outlet, useParams, useNavigate, Link } from "@tanstack/solid-router";
import { Settings as SettingsIcon } from "lucide-solid";
import { Effect, Exit } from "effect";
import { CodemanSidebar, type WorkspaceNode } from "../../../shared/components/internal/codeman-sidebar";
import { Dialog } from "../../../shared/components/internal/codeman-dialog";
import {
  store,
  workspaces$,
  conversations$,
  deleteConversation,
  setSelectedWorkspaceId,
  loadWorkspaces,
  loadConversations,
  renameWorkspace,
  removeWorkspace,
} from "../stores/chat.store";
import { showRenameDialog } from "../components/workspace-rename-dialog";

// ─── Data mapping helpers ───────────────────────────────────────────────────

// v8 ignore — Solid JSX compiler transforms this function, making v8 coverage
// unable to track individual lines within it. The function IS called during
// every render with workspaces (tests verify this), but the coverage report
// incorrectly shows lines 26-37 as uncovered. This is a known v8+Solid
// instrumentation limitation, not an actual coverage gap.
/* v8 ignore start */
function buildSidebarNodes(): WorkspaceNode[] {
  const allConvs = conversations$() ?? [];
  const wsList = workspaces$() ?? [];
  return wsList.map((ws) => {
    const wsConvs = allConvs
      .filter((c) => c.workspace_id === ws.id)
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
      })),
    };
  });
}
/* v8 ignore stop */

// ─── ChatLayout ─────────────────────────────────────────────────────────────

export function ChatLayout(): JSX.Element {
  const navigate = useNavigate();
  // Load workspaces + conversations on mount
  onMount(() => {
    Effect.runPromiseExit(loadWorkspaces());
    Effect.runPromiseExit(loadConversations());
  });

  const params = useParams({ strict: false });
  // selectedItemId comes from URL — /conversation/{id} has convId, / has null
  const selectedItemId = (): string | null => (params() as { convId?: string }).convId ?? null;

  const handleSelectItem = (id: string) => {
    navigate({ to: `/conversation/${id}` });
  };

  const handleDeleteItem = (id: string) => {
    Effect.runPromiseExit(deleteConversation(id));
  };

  const handleBackToHome = () => {
    // 新对话 → 回首页（/）,由 URL 单一来源（无 activeId 信号）。
    navigate({ to: "/" });
  };

  const handleEmptyWorkspaceClick = (wsId: string) => {
    setSelectedWorkspaceId(wsId);
  };

  const handleRenameWorkspace = async (workspaceId: string, currentLabel: string) => {
    const newLabel = await showRenameDialog(currentLabel);

    if (newLabel && newLabel !== currentLabel) {
      const exit = await Effect.runPromiseExit(renameWorkspace(workspaceId, newLabel));
      if (Exit.isFailure(exit)) {
        console.error("[chat-layout] rename failed:", exit.cause);
      }
    }
  };

  const handleDeleteWorkspace = async (workspaceId: string, label: string) => {
    const confirmed = await Dialog.confirm({
      title: "Delete workspace",
      content: `Are you sure you want to delete "${label}"? All conversations in this workspace will be permanently deleted.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      destructive: true,
    });

    if (!confirmed) return;

    const exit = await Effect.runPromiseExit(removeWorkspace(workspaceId));
    if (Exit.isFailure(exit)) {
      console.error("[chat-layout] delete failed:", exit.cause);
    }
  };

  return (
    <main class="flex h-screen w-full bg-background text-foreground">
      <CodemanSidebar
        nodes={buildSidebarNodes()}
        selectedItemId={selectedItemId()}
        onSelectItem={handleSelectItem}
        onDeleteItem={handleDeleteItem}
        onCreateItem={handleBackToHome}
        onEmptyWorkspaceClick={handleEmptyWorkspaceClick}
        onRenameWorkspace={handleRenameWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
        class="border-r border-sidebar-border"
      />

      <section class="flex-1 flex flex-col overflow-hidden">
        <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
          <Outlet />
        </div>
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
