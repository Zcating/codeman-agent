
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
import { getPluginMetadata } from "@codeman-frontend/plugins";

function renderPluginIcon(pluginId: string, iconName: string): JSX.Element {
  switch (iconName) {
    case "WandSparkles":
      return <WandSparkles class="h-4 w-4" />;
    case "Cable":
      return <Cable class="h-4 w-4" />;
    default:
      throw new Error(`Unknown icon "${iconName}" for plugin "${pluginId}" — expected "WandSparkles" or "Cable"`);
  }
}


export function ChatSidebar(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();

  const params = useParams({ strict: false });
  const selectedConvId = (): string | null =>
    (params() as { convId?: string }).convId ?? null;

  const currentPathname = (): string => location().pathname;

  const wsList = (): Workspace[] => workspaces$() ?? [];


  const handleSelectConv = (id: string): void => {
    const metadata = getPluginMetadata();
    const pluginMeta = metadata.get(id);
    if (pluginMeta) {
      navigate({ to: pluginMeta.route.path });
      return;
    }
    navigate({ to: `/conversation/${id}` });
  };

  const handleEmptyWorkspaceClick = (wsId: string): void => {
    setSelectedWorkspaceId(wsId);
  };

  const handleNewConversation = (): void => {
    navigate({ to: "/" });
  };

  const handleRenameWorkspaceSimple = async (
    workspaceId: string,
    newLabel: string,
  ): Promise<void> => {
    const ok = await chatSidebarActions.renameWorkspace(workspaceId, newLabel);
    if (!ok) {
      logger.error("[chat-sidebar] rename failed for", workspaceId);
    }
  };

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

  const handleConvDelete = async (convId: string): Promise<void> => {
    await chatSidebarActions.deleteConversation(convId);
    const currentConvId = selectedConvId();
    if (currentConvId === convId) {
      navigate({ to: "/" });
    }
  };

  const handleConvRename = async (
    convId: string,
    newTitle: string,
  ): Promise<void> => {
    await chatSidebarActions.renameConversation(convId, newTitle);
  };


  const options = (): CodemanSidebarGroupOption[] => {
    const metadata = getPluginMetadata();
    const pluginChildren = Array.from(metadata.values())
      .filter((plugin) => plugin.sidebar.visible)
      .sort((a, b) => a.sidebar.order - b.sidebar.order)
      .map(
        (plugin): CodemanSidebarMenuOption => ({
          label: plugin.route.label,
          value: plugin.id,
          icon: renderPluginIcon(plugin.id, plugin.sidebar.icon),
          forceSubMenu: true,
        }),
      );

    const pluginGroup: CodemanSidebarGroupOption = {
      label: "插件",
      value: "plugins",
      children: pluginChildren,
    };

    if (wsList().length === 0) {
      return [pluginGroup];
    }

    const projectGroup: CodemanSidebarGroupOption = {
      label: "项目",
      value: "workspace",
      children: wsList().map((ws): CodemanSidebarMenuGroupOption => ({
        label: ws.label,
        value: ws.id,
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


  const isActive = (value: string | undefined): boolean => {
    if (!value) return false;
    const pathname = currentPathname();
    if (pathname.startsWith("/plugins")) {
      return pathname.includes(value);
    }
    return value === selectedConvId();
  };

  return (
    <CodemanSidebar
      options={options()}
      renderMenuGroup={renderMenuGroup}
      renderMenu={renderMenu}
      currentValue={selectedConvId() ?? undefined}
      isActive={isActive}
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
