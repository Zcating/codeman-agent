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

import { createSignal, Show, type JSX } from "solid-js";
import { Pencil, Trash2 } from "lucide-solid";
import { Outlet, useLocation, useNavigate, useParams, Link } from "@tanstack/solid-router";
import { Settings as SettingsIcon } from "lucide-solid";
import {
  CodemanSidebar,
  type SidebarGroupOption,
  type SidebarOption,
  type SidebarSubOption,
} from "../../../shared/components/internal/codeman-sidebar";
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

  // ─── Inline-confirm state for workspace delete ───────────────────────────
  //
  // Per user requirement (2026-07-25): clicking delete on a workspace row
  // must NOT open a modal — instead, the row swaps its hover-revealed
  // rename+delete buttons for an inline 删除 / 取消 overlay at the original
  // row position. Only one row can be in this state at a time; clicking
  // delete on another row implicitly cancels the previous one (the value
  // simply changes to the new workspace id).
  const [confirmingWorkspaceId, setConfirmingWorkspaceId] = createSignal<
    string | null
  >(null);

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

  const handleDeleteWorkspace = (workspaceId: string): void => {
    // Enter inline-confirm state — the row's hover-buttons swap to a
    // 删除 / 取消 overlay at the original row position (per user request:
    // no modal popup). The actual deletion only happens after the user
    // confirms via `handleConfirmDeleteWorkspace`.
    setConfirmingWorkspaceId(workspaceId);
  };

  const handleConfirmDeleteWorkspace = async (
    workspaceId: string,
  ): Promise<void> => {
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
        children: wsList().map((ws): SidebarOption => ({
          label: ws.label,
          value: ws.id,
          // Per-workspace Accordion (sidebar-reshim Q28 reversal): default-expanded
          // so all workspaces' conv lists are visible at first render (matches
          // the previous per-group expanded-by-default behavior). Users can
          // collapse individual workspaces by clicking them.
          defaultExpanded: true,
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
    const isConfirming = (): boolean =>
      confirmingWorkspaceId() === item.value;
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
        <Show
          when={isConfirming()}
          fallback={
            <span
              class="pointer-events-auto flex items-center gap-1 transition-opacity"
              classList={{
                "opacity-0": !hovering(),
                "opacity-100": hovering(),
              }}
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
                  handleDeleteWorkspace(item.value);
                }}
                aria-label={`Delete ${item.label}`}
              >
                <Trash2 class="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          }
        >
          <span
            data-state="confirming"
            class="pointer-events-auto flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              class="h-7 px-2 text-xs bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmingWorkspaceId(null);
                void handleConfirmDeleteWorkspace(item.value);
              }}
              aria-label="确认删除"
            >
              删除
            </button>
            <button
              type="button"
              class="h-7 px-2 text-xs rounded-md border border-input text-foreground hover:bg-accent"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmingWorkspaceId(null);
              }}
              aria-label="取消删除"
            >
              取消
            </button>
          </span>
        </Show>
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
