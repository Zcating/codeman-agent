//! ChatSidebar — chat-domain wrapper for the universal CodemanSidebar.
//!
//! Per ADR-0030 D7: chat feature owns workspace/conversation data mapping
//! + chat-domain actions (delete, rename, new conv, settings link). The
//! universal CodemanSidebar stays generic — chat-specific features
//! (ConvDeleteAction / hover rename+delete / NewChatButton) are rendered as
//! `renderMenuGroup` / slots.
//!
//! Data flow:
//! - Reads `workspaces$()` + `conversations$()` from chat.store (Solid Accessors)
//! - Builds `CodemanSidebarGroupOption[]` tree (one project group with workspaces as
//!   MenuGroups, conversations as Menus inside each MenuGroup's `children`)
//! - Wires all chat-domain handlers (select / delete / rename / new conv / empty ws)
//! - Passes URL-derived `selectedConvId` as `currentValue` for active highlight
//!
//! Layout: ChatSidebar wraps CodemanSidebar which owns the two-column
//! (sidebar + main) shell. Children slot is `<Outlet />` from TanStack Router.

import { type JSX } from "solid-js";
import { Outlet, useLocation, useNavigate, useParams, Link } from "@tanstack/solid-router";
import { Settings as SettingsIcon, WandSparkles, Cable } from "lucide-solid";
import {
  CodemanSidebar,
  type CodemanSidebarGroupOption,
  type CodemanSidebarMenuGroupOption,
  type CodemanSidebarMenuOption,
} from "@codeman-frontend/shared/components/internal/codeman-sidebar";
import { logger } from "@codeman-frontend/shared/lib/logger";
import type { Workspace } from "@codeman-frontend/shared/lib/types";
import {
  store,
  workspaces$,
  conversations$,
  setSelectedWorkspaceId,
} from "@codeman-frontend/features/chat/stores/chat.store";
import { chatSidebarActions } from "@codeman-frontend/features/chat/lib/chat-sidebar-actions";
import { RowActions } from "@codeman-frontend/features/chat/components/row-actions";
import { NewChatButton } from "@codeman-frontend/features/chat/components/new-chat-button";

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

  // Current pathname for plugin route active detection
  const currentPathname = (): string => location().pathname;

  const wsList = (): Workspace[] => workspaces$() ?? [];

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleSelectConv = (id: string): void => {
    // Handle plugin navigation
    if (id === "skills") {
      navigate({ to: "/plugins/skills" });
      return;
    }
    if (id === "mcp") {
      navigate({ to: "/plugins/mcp" });
      return;
    }
    // Handle conversation navigation
    navigate({ to: `/conversation/${id}` });
  };

  const handleEmptyWorkspaceClick = (wsId: string): void => {
    setSelectedWorkspaceId(wsId);
  };

  const handleNewConversation = (): void => {
    navigate({ to: "/" });
  };

  // Simplified workspace rename — directly calls chatSidebarActions.renameWorkspace
  // (no showRenameDialog modal; inline edit is handled by RowActions)
  const handleRenameWorkspaceSimple = async (
    workspaceId: string,
    newLabel: string,
  ): Promise<void> => {
    const ok = await chatSidebarActions.renameWorkspace(workspaceId, newLabel);
    if (!ok) {
      logger.error("[chat-sidebar] rename failed for", workspaceId);
    }
  };

  // Workspace delete — directly calls chatSidebarActions.removeWorkspace.
  // RowActions manages the inline-confirm UI; this handler performs the
  // deletion and handles navigation side effect (if deleting the workspace
  // that owns the currently-viewed conversation, navigate home).
  const handleDeleteWorkspace = async (workspaceId: string): Promise<void> => {
    const ok = await chatSidebarActions.removeWorkspace(workspaceId);
    if (!ok) {
      logger.error("[chat-sidebar] delete failed for", workspaceId);
      return;
    }
    const currentConvId = selectedConvId();
    if (
      currentConvId &&
      store.byId[currentConvId]?.workspaceId === workspaceId
    ) {
      navigate({ to: "/" });
    }
  };

  // Conversation delete — calls chatSidebarActions.deleteConversation.
  // If deleting the currently-viewed conversation, navigates home to avoid
  // staying on a deleted conv view.
  const handleConvDelete = async (convId: string): Promise<void> => {
    await chatSidebarActions.deleteConversation(convId);
    const currentConvId = selectedConvId();
    if (currentConvId === convId) {
      navigate({ to: "/" });
    }
  };

  // Conversation rename — calls chatSidebarActions.renameConversation.
  // Mirrors handleRenameWorkspaceSimple error-handling pattern.
  const handleConvRename = async (
    convId: string,
    newTitle: string,
  ): Promise<void> => {
    await chatSidebarActions.renameConversation(convId, newTitle);
    // Note: chatSidebarActions.renameConversation swallows errors internally
    // (runEffect pattern). If failure notification is needed in future,
    // mirror the logger.error pattern from handleRenameWorkspaceSimple.
  };

  // ─── Sidebar tree builders ───────────────────────────────────────────────

  const options = (): CodemanSidebarGroupOption[] => {
    // Plugin group is always visible
    const pluginGroup: CodemanSidebarGroupOption = {
      label: "插件",
      value: "plugins",
      children: [
        {
          label: "Skills",
          value: "skills",
          icon: <WandSparkles class="h-4 w-4" />,
          forceSubMenu: true,
        },
        {
          label: "MCP",
          value: "mcp",
          icon: <Cable class="h-4 w-4" />,
          forceSubMenu: true,
        },
      ],
    };

    // Project group only included when there are workspaces
    if (wsList().length === 0) {
      return [pluginGroup];
    }

    const projectGroup: CodemanSidebarGroupOption = {
      label: "项目",
      value: "workspace",
      children: wsList().map((ws): CodemanSidebarMenuGroupOption => ({
        label: ws.label,
        value: ws.id,
        // Per-group Accordion (sidebar-reshim Q28 reversal): default-expanded
        // so all workspaces' conv lists are visible at first render (matches
        // the previous per-group expanded-by-default behavior). Users can
        // collapse individual workspaces by clicking them.
        defaultExpanded: true,
        children: conversations$()
          ?.filter((c) => c.workspaceId === ws.id)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map((c): CodemanSidebarMenuOption => ({
            label: c.title,
            value: c.id,
          })) ?? [],
      })),
    };

    return [pluginGroup, projectGroup];
  };

  const renderMenuGroup = (item: CodemanSidebarMenuGroupOption): JSX.Element => (
    <RowActions
      kind="workspace"
      id={item.value}
      label={item.label}
      onDelete={(id) => { void handleDeleteWorkspace(id); }}
      onRename={(id, newLabel) => { void handleRenameWorkspaceSimple(id, newLabel); }}
    />
  );

  const renderMenu = (menu: CodemanSidebarMenuOption): JSX.Element => (
    <RowActions
      kind="conv"
      id={menu.value}
      label={menu.label}
      isStreaming={store.byId[menu.value]?.streamingMessageId != null}
      onDelete={(id) => { void handleConvDelete(id); }}
      onRename={(id, newTitle) => { void handleConvRename(id, newTitle); }}
    />
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  // Custom active predicate: handles both conversation active state (by convId)
  // and plugin route active state (by pathname match when on /plugins pages)
  const isActive = (value: string | undefined): boolean => {
    if (!value) return false;
    const pathname = currentPathname();
    // Plugin routes: match by pathname when on /plugins pages
    if (pathname.startsWith("/plugins")) {
      return pathname.includes(value);
    }
    // Conversation routes: match by convId
    return value === selectedConvId();
  };

  return (
    <CodemanSidebar
      options={options()}
      renderMenuGroup={renderMenuGroup}
      renderMenu={renderMenu}
      currentValue={selectedConvId() ?? undefined}
      isActive={isActive}
      // onMenuGroupSelect intentionally omitted: per chat AGENTS.md ADR-0023 D7-CS,
      // workspaces are NEVER navigation targets — only convs are. Clicking a
      // workspace label should ONLY toggle its accordion (handled by
      // CodemanSidebar's triggerOnClick), NOT navigate to /conversation/{wsId}
      // (which is a non-existent conv route and was a user-reported page-jump
      // bug 2026-07-25). CodemanSidebar's `props.onMenuGroupSelect?.()` short-circuits
      // to a no-op when undefined, so this is the contract for "pure toggle".
      onMenuSelect={handleSelectConv}
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
