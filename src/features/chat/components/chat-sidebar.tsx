//! ChatSidebar — chat-domain wrapper for the universal CodemanSidebar.
//!
//! Per ADR-0030 D7: chat feature owns workspace/conversation data mapping
//! + chat-domain actions (delete, rename, new conv, settings link). The
//! universal CodemanSidebar stays generic — chat-specific features
//! (ConvDeleteAction / WorkspaceActions / NewChatButton) are rendered as
//! `renderItem` / `renderGroupHeader` / slots.
//!
//! Data flow:
//! - Reads `workspaces$()` + `conversations$()` from chat.store (Solid Accessors)
//! - Builds `SidebarOption[]` tree (workspaces as groups, conversations as leaves)
//! - Wires all chat-domain handlers (select / delete / rename / new conv / empty ws)
//! - Passes URL-derived `selectedConvId` as `currentValue` for active highlight
//!
//! Layout: ChatSidebar wraps CodemanSidebar which owns the two-column
//! (sidebar + main) shell. Children slot is `<Outlet />` from TanStack Router.

import type { JSX } from "solid-js";
import { Outlet, useNavigate, useParams, Link } from "@tanstack/solid-router";
import { Settings as SettingsIcon } from "lucide-solid";
import {
  CodemanSidebar,
  type SidebarItemConfig,
  type SidebarOption,
} from "../../../shared/components/internal/codeman-sidebar";
import { Dialog } from "../../../shared/components/internal/codeman-dialog";
import { logger } from "../../../shared/lib/logger";
import type { Workspace } from "../../../shared/lib/types";
import {
  store,
  workspaces$,
  conversations$,
  setSelectedWorkspaceId,
} from "../stores/chat.store";
import { chatSidebarActions } from "../lib/chat-sidebar-actions";
import { showRenameDialog } from "./workspace-rename-dialog";
import { ConvDeleteAction } from "./conv-delete-action";
import { WorkspaceActions } from "./workspace-actions";
import { NewChatButton } from "./new-chat-button";

// ─── ChatSidebar ───────────────────────────────────────────────────────────

export function ChatSidebar(): JSX.Element {
  const navigate = useNavigate();

  // URL-derived active conv id (per chat AGENTS.md: URL is single source of truth)
  const params = useParams({ strict: false });
  const selectedConvId = (): string | null =>
    (params() as { convId?: string }).convId ?? null;

  const wsList = (): Workspace[] => workspaces$() ?? [];
  const convList = (): { id: string; title: string; workspaceId: string; updatedAt: number }[] =>
    conversations$() ?? [];
  const firstWsId = (): string | undefined => wsList()[0]?.id;

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleSelectConv = (id: string): void => {
    navigate({ to: `/conversation/${id}` });
  };

  const handleEmptyWorkspaceClick = (wsId: string): void => {
    setSelectedWorkspaceId(wsId);
  };

  const handleNewConversation = (): void => {
    navigate({ to: "/" });
  };

  const handleConvDelete = (convId: string): void => {
    void chatSidebarActions.deleteConversation(convId);
  };

  const handleRenameWorkspace = async (
    workspaceId: string,
    currentLabel: string,
  ): Promise<void> => {
    const newLabel = await showRenameDialog(currentLabel);
    if (!newLabel || newLabel === currentLabel) return;
    const ok = await chatSidebarActions.renameWorkspace(
      workspaceId,
      newLabel,
    );
    if (!ok) {
      logger.error("[chat-sidebar] rename failed for", workspaceId);
    }
  };

  const handleDeleteWorkspace = async (
    workspaceId: string,
    label: string,
  ): Promise<void> => {
    const confirmed = await Dialog.confirm({
      title: "Delete workspace",
      content: `Are you sure you want to delete "${label}"? All conversations in this workspace will be permanently deleted.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      destructive: true,
    });
    if (!confirmed) return;

    const ok = await chatSidebarActions.removeWorkspace(workspaceId);
    if (!ok) {
      logger.error("[chat-sidebar] delete failed for", workspaceId);
      return;
    }
    // If the current URL's conv belongs to the deleted workspace, navigate home.
    const currentConvId = selectedConvId();
    if (
      currentConvId &&
      store.byId[currentConvId]?.workspaceId === workspaceId
    ) {
      navigate({ to: "/" });
    }
  };

  // ─── Sidebar tree builders ───────────────────────────────────────────────

  const options = (): SidebarOption[] =>
    wsList().map((ws) => {
      const wsConvs = convList()
        .filter((c) => c.workspaceId === ws.id)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(
          (c): SidebarItemConfig => ({
            label: c.title,
            value: c.id,
          }),
        );
      return {
        label: ws.label,
        value: ws.id,
        defaultExpanded: ws.id === firstWsId(),
        children: wsConvs,
      };
    });

  const renderLeaf = (item: SidebarItemConfig): JSX.Element => {
    const convId = item.value ?? item.label;
    const isStreaming = (): boolean =>
      store.byId[convId]?.streamingMessageId != null;
    return (
      <ConvDeleteAction
        convId={convId}
        label={item.label}
        isStreaming={isStreaming()}
        onDelete={handleConvDelete}
      />
    );
  };

  const renderGroupHeader = (group: SidebarOption): JSX.Element => (
    <WorkspaceActions
      wsId={group.value ?? group.label}
      label={group.label}
      onRename={(id, label) => {
        void handleRenameWorkspace(id, label);
      }}
      onDelete={(id, label) => {
        void handleDeleteWorkspace(id, label);
      }}
    />
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <CodemanSidebar
      options={options()}
      renderItem={renderLeaf}
      renderGroupHeader={renderGroupHeader}
      currentValue={selectedConvId() ?? undefined}
      onItemSelect={handleSelectConv}
      onEmptyGroupClick={handleEmptyWorkspaceClick}
      sidebarHeader={
        <NewChatButton onClick={handleNewConversation} />
      }
      sidebarFooter={
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
      }
      emptyMessage="No workspaces"
      class="border-r border-sidebar-border"
    >
      <Outlet />
    </CodemanSidebar>
  );
}
