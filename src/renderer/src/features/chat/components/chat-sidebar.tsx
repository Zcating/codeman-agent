//! ChatSidebar — chat-domain wrapper for the universal CodemanSidebar.
//!
//! Per ADR-0030 D7: chat feature owns workspace/conversation data mapping
//! + chat-domain actions (delete, rename, new conv, settings link). The
//! universal CodemanSidebar stays generic — chat-specific features
//! (ConvDeleteAction / hover rename+delete / NewChatButton) are rendered as
//! `renderItem` / slots.
//!
//! Data flow:
//! - Reads `workspaces$()` + `conversations$()` from chat.store (Solid Accessors)
//! - Builds `SidebarGroupOption[]` tree (one project group with workspaces as items,
//!   conversations as subItems)
//! - Wires all chat-domain handlers (select / delete / rename / new conv / empty ws)
//! - Passes URL-derived `selectedConvId` as `currentValue` for active highlight
//!
//! Layout: ChatSidebar wraps CodemanSidebar which owns the two-column
//! (sidebar + main) shell. Children slot is `<Outlet />` from TanStack Router.

import { createSignal, type JSX } from "solid-js";
import { Pencil, Trash2 } from "lucide-solid";
import { Outlet, useLocation, useNavigate, useParams, Link } from "@tanstack/solid-router";
import { Settings as SettingsIcon } from "lucide-solid";
import {
  CodemanSidebar,
  type SidebarGroupOption,
  type SidebarOption,
  type SidebarSubOption,
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
import { NewChatButton } from "./new-chat-button";

// ─── ChatSidebar ───────────────────────────────────────────────────────────

export function ChatSidebar(): JSX.Element {
  const navigate = useNavigate();
  // Capture the current pathname so the settings "Back" button can return
  // to the page the user was on before entering settings (not to a
  // settings subpage like /settings/llm or /settings/app).
  const location = useLocation();

  // URL-derived active conv id (per chat AGENTS.md: URL is single source of truth)
  const params = useParams({ strict: false });
  const selectedConvId = (): string | null =>
    (params() as { convId?: string }).convId ?? null;

  const wsList = (): Workspace[] => workspaces$() ?? [];

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
    if (!newLabel || newLabel === currentLabel) {return;}
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
    if (!confirmed) {return;}

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

  const options = (): SidebarGroupOption[] => {
    if (wsList().length === 0) {return [];}

    return [
      {
        label: "项目",
        value: "workspace",
        defaultExpanded: true,
        children: wsList().map((ws): SidebarOption => ({
          label: ws.label,
          value: ws.id,
          subItems: conversations$()
            ?.filter((c) => c.workspaceId === ws.id)
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((c): SidebarSubOption => ({
              label: c.title,
              value: c.id,
            })),
        })),
      },
    ];
  };

  const renderItem = (item: SidebarOption): JSX.Element => {
    const [hovering, setHovering] = createSignal(false);
    const convId = item.value ?? item.label;
    const isStreaming = (): boolean =>
      store.byId[convId]?.streamingMessageId != null;
    return (
      <span
        class="flex w-full items-center justify-between gap-2 min-w-0"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <ConvDeleteAction
          convId={convId}
          label={item.label}
          isStreaming={isStreaming()}
          onDelete={handleConvDelete}
        />
        <span
          class="pointer-events-auto flex items-center gap-1 transition-opacity"
          classList={{ "opacity-0": !hovering(), "opacity-100": hovering() }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            class="flex h-5 w-5 items-center justify-center rounded-md hover:bg-accent outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(e) => {
              e.stopPropagation();
              void handleRenameWorkspace(item.value, item.label);
            }}
            aria-label={`Rename ${item.label}`}
          >
            <Pencil class="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="flex h-5 w-5 items-center justify-center rounded-md hover:bg-accent hover:text-destructive outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(e) => {
              e.stopPropagation();
              void handleDeleteWorkspace(item.value, item.label);
            }}
            aria-label={`Delete ${item.label}`}
          >
            <Trash2 class="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      </span>
    );
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <CodemanSidebar
      options={options()}
      renderItem={renderItem}
      currentValue={selectedConvId() ?? undefined}
      onItemSelect={handleSelectConv}
      onSubItemSelect={handleSelectConv}
      onEmptyGroupClick={handleEmptyWorkspaceClick}
      header={
        <NewChatButton onClick={handleNewConversation} />
      }
      footer={
        <Link
          to="/settings"
          state={{ from: location().pathname }}
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
