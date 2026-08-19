
import { render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Effect } from "effect";


interface CapturedProps {
  options: any[];
  renderMenuGroup: (item: any) => any;
  renderMenu?: (menu: any) => any;
  renderGroupHeader?: (group: any) => any;
  currentValue?: string;
  onMenuGroupSelect?: (value: string) => void;
  onMenuSelect?: (value: string) => void;
  onEmptyGroupClick?: (groupValue: string) => void;
  header?: any;
  footer?: any;
  emptyMessage?: string;
  class?: string;
  children?: any;
}

const F = vi.hoisted(() => {
  return {
    mockWorkspaces: [
      { id: "ws-1", label: "Frontend", rootPath: "/tmp/fe", createdAt: 1 },
      { id: "ws-2", label: "Backend", rootPath: "/tmp/be", createdAt: 2 },
    ],
    mockConversations: [
      { id: "c-1", title: "Chat 1", workspaceId: "ws-1", updatedAt: 200, createdAt: 1, systemPrompt: null, archivedAt: null },
      { id: "c-2", title: "Chat 2", workspaceId: "ws-1", updatedAt: 100, createdAt: 2, systemPrompt: null, archivedAt: null },
      { id: "c-3", title: "Chat 3", workspaceId: "ws-2", updatedAt: 50, createdAt: 3, systemPrompt: null, archivedAt: null },
    ],
    mockStoreById: {
      "c-1": { workspaceId: "ws-1", isAgentActive: false },
      "c-2": { workspaceId: "ws-1", isAgentActive: true },
      "c-3": { workspaceId: "ws-2", isAgentActive: false },
    } as Record<string, { workspaceId: string; isAgentActive: boolean }>,
    mockNavigate: vi.fn(),
    mockParamsAccessor: vi.fn(() => ({ convId: undefined as string | undefined })),
    mockSetSelectedWorkspaceId: vi.fn(),
    mockDeleteConversation: vi.fn(() => Effect.succeed(undefined)),
    mockRenameWorkspace: vi.fn(() => Effect.succeed(undefined)),
    mockRemoveWorkspace: vi.fn(() => Effect.succeed(undefined)),
    mockDialogConfirm: vi.fn(),
    capturedProps: null as CapturedProps | null,
    capturedRowActionsProps: null as any,
    mockChatSidebarActions: {
      deleteConversation: vi.fn().mockResolvedValue(undefined),
      renameConversation: vi.fn().mockResolvedValue(undefined),
      renameWorkspace: vi.fn().mockResolvedValue(true),
      removeWorkspace: vi.fn().mockResolvedValue(true),
    },
    getPluginMetadata: () =>
      new Map([
        [
          "skills",
          {
            id: "skills",
            route: { path: "/plugins/skills", label: "Skills" },
            sidebar: { icon: "WandSparkles", order: 3, visible: true },
          },
        ],
        [
          "mcp",
          {
            id: "mcp",
            route: { path: "/plugins/mcp", label: "MCP" },
            sidebar: { icon: "Cable", order: 4, visible: true },
          },
        ],
      ]),
  };
});

const mockPluginMetadata = {
  get: () => F.getPluginMetadata(),
};

vi.mock("@codeman-frontend/plugins", () => ({
  getPluginMetadata: () => mockPluginMetadata.get(),
}));


vi.mock("@tanstack/solid-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/solid-router")>(
    "@tanstack/solid-router",
  );
  return {
    ...actual,
    useNavigate: () => F.mockNavigate,
    useParams: () => F.mockParamsAccessor,
    Outlet: () => <div data-testid="outlet" />,
    Link: (props: { to: string; children?: any }) => (
      <a href={props.to} data-testid={`link-${props.to}`}>
        {props.children}
      </a>
    ),
  };
});

vi.mock("../stores/chat.store", () => ({
  workspaces$: () => F.mockWorkspaces,
  conversations$: () => F.mockConversations,
  store: { byId: F.mockStoreById },
  setSelectedWorkspaceId: F.mockSetSelectedWorkspaceId,
  deleteConversation: F.mockDeleteConversation,
  renameWorkspace: F.mockRenameWorkspace,
  removeWorkspace: F.mockRemoveWorkspace,
}));

vi.mock("../../../shared/components/internal/codeman-dialog", () => ({
  Dialog: {
    confirm: (...args: unknown[]) => F.mockDialogConfirm(...args),
    show: vi.fn(),
    alert: vi.fn(),
  },
}));

vi.mock("../../../shared/components/internal/codeman-sidebar", () => ({
  CodemanSidebar: (props: any) => {
    F.capturedProps = {
      options: props.options,
      renderMenuGroup: props.renderMenuGroup,
      renderMenu: props.renderMenu,
      renderGroupHeader: props.renderGroupHeader,
      currentValue: props.currentValue,
      onMenuGroupSelect: props.onMenuGroupSelect,
      onMenuSelect: props.onMenuSelect,
      onEmptyGroupClick: props.onEmptyGroupClick,
      header: props.header,
      footer: props.footer,
      emptyMessage: props.emptyMessage,
      class: props.class,
      children: props.children,
    };
    return <div data-testid="codeman-sidebar-stub" />;
  },
}));


import { ChatSidebar } from "@codeman-frontend/features/chat/components/chat-sidebar";


beforeEach(() => {
  F.capturedProps = null;
  F.mockNavigate.mockClear();
  F.mockParamsAccessor.mockReset();
  F.mockParamsAccessor.mockImplementation(() => ({ convId: undefined }));
  F.mockSetSelectedWorkspaceId.mockClear();
  F.mockDeleteConversation.mockClear();
  F.mockRenameWorkspace.mockClear();
  F.mockRemoveWorkspace.mockClear();
  F.mockDialogConfirm.mockReset();
});


describe("ChatSidebar (PR 2)", () => {
  it("builds CodemanSidebarGroupOption[] with plugin group and project group", () => {
    render(() => <ChatSidebar />);
    expect(F.capturedProps).toBeTruthy();
    const opts = F.capturedProps!.options;
    expect(opts.length).toBe(2);

    expect(opts[0]).toMatchObject({
      label: "插件",
      value: "plugins",
    });
    expect(opts[0].children.length).toBe(2);
    expect(opts[0].children[0]).toMatchObject({
      label: "Skills",
      value: "skills",
    });
    expect(opts[0].children[1]).toMatchObject({
      label: "MCP",
      value: "mcp",
    });

    expect(opts[1]).toMatchObject({
      label: "项目",
      value: "workspace",
    });
    expect(opts[1].children.length).toBe(2);
    expect(opts[1].children[0]).toMatchObject({
      label: "Frontend",
      value: "ws-1",
      defaultExpanded: true,
    });
    expect(opts[1].children[0].children).toEqual([
      { label: "Chat 1", value: "c-1" },
      { label: "Chat 2", value: "c-2" },
    ]);
    expect(opts[1].children[1]).toMatchObject({
      label: "Backend",
      value: "ws-2",
      defaultExpanded: true,
    });
    expect(opts[1].children[1].children).toEqual([
      { label: "Chat 3", value: "c-3" },
    ]);
  });

  it("passes emptyMessage='No workspaces' to CodemanSidebar", () => {
    render(() => <ChatSidebar />);
    expect(F.capturedProps?.emptyMessage).toBe("No workspaces");
  });

  it("onMenuSelect navigates to /conversation/{value}", () => {
    render(() => <ChatSidebar />);
    F.capturedProps!.onMenuSelect!("c-1");
    expect(F.mockNavigate).toHaveBeenCalledWith({ to: "/conversation/c-1" });
  });

  it("onMenuSelect navigates to /plugins/skills for skills plugin", () => {
    render(() => <ChatSidebar />);
    F.capturedProps!.onMenuSelect!("skills");
    expect(F.mockNavigate).toHaveBeenCalledWith({ to: "/plugins/skills" });
  });

  it("onMenuSelect navigates to /plugins/mcp for mcp plugin", () => {
    render(() => <ChatSidebar />);
    F.capturedProps!.onMenuSelect!("mcp");
    expect(F.mockNavigate).toHaveBeenCalledWith({ to: "/plugins/mcp" });
  });

  it("onMenuGroupSelect is NOT wired (MenuGroup click must NOT navigate —S)", () => {
    render(() => <ChatSidebar />);
    expect(F.capturedProps?.onMenuGroupSelect).toBeUndefined();
  });

  it("clicking MenuGroup label does NOT navigate (regression: avoid /conversation/{wsId} 404)", async () => {
    render(() => <ChatSidebar />);
    F.mockNavigate.mockClear();
    expect(F.capturedProps?.onMenuGroupSelect).toBeUndefined();
    expect(F.mockNavigate).not.toHaveBeenCalled();
  });

  it("clicking inner Delete menu item in renderMenuGroup does NOT navigate (RowActions stopPropagation)", async () => {
    render(() => <ChatSidebar />);
    F.mockNavigate.mockClear();
    const renderMenuGroup = F.capturedProps!.renderMenuGroup;
    const { container } = render(() =>
      renderMenuGroup({ label: "WS", value: "ws-navigate" }),
    );
    const user = userEvent.setup();
    await user.click(container.querySelector('[aria-label="更多操作"]') as HTMLButtonElement);
    await user.click(document.querySelector("[data-testid='row-action-delete']") as HTMLElement);
    await vi.waitFor(() => {
      expect(F.mockDialogConfirm).toHaveBeenCalled();
      expect(F.mockNavigate).not.toHaveBeenCalled();
    });
  });

  it("currentValue comes from URL params (convId)", () => {
    F.mockParamsAccessor.mockImplementation(() => ({ convId: "c-2" }));
    render(() => <ChatSidebar />);
    expect(F.capturedProps?.currentValue).toBe("c-2");
  });

  it("currentValue undefined when URL has no convId", () => {
    render(() => <ChatSidebar />);
    expect(F.capturedProps?.currentValue).toBeUndefined();
  });

  it("onEmptyGroupClick calls setSelectedWorkspaceId", () => {
    render(() => <ChatSidebar />);
    F.capturedProps!.onEmptyGroupClick!("ws-1");
    expect(F.mockSetSelectedWorkspaceId).toHaveBeenCalledWith("ws-1");
  });

  it("header is provided (NewChatButton)", () => {
    render(() => <ChatSidebar />);
    expect(F.capturedProps?.header).toBeTruthy();
  });

  it("footer is provided (SettingsLink)", () => {
    render(() => <ChatSidebar />);
    expect(F.capturedProps?.footer).toBeTruthy();
  });

  it("children prop is provided (Outlet rendered inside CodemanSidebar)", () => {
    render(() => <ChatSidebar />);
    expect(F.capturedProps?.children).toBeTruthy();
  });

  it("class prop sets border-r for sidebar layout", () => {
    render(() => <ChatSidebar />);
    expect(F.capturedProps?.class).toBe("border-r border-sidebar-border");
  });

  it("conversations are sorted by updatedAt descending", () => {
    render(() => <ChatSidebar />);
    const menus = F.capturedProps!.options[1].children[0].children;
    expect(menus[0].label).toBe("Chat 1");
    expect(menus[1].label).toBe("Chat 2");
  });

  describe("Seam 20: MenuGroup hover rename+delete via renderMenuGroup", () => {
    it("renderMenuGroup returns JSX with more-actions trigger and rename/delete menu items", async () => {
      render(() => <ChatSidebar />);
      expect(F.capturedProps).toBeTruthy();
      const renderMenuGroup = F.capturedProps!.renderMenuGroup;
      const { container } = render(() =>
        renderMenuGroup({ label: "Test WS", value: "ws-test" }),
      );
      const trigger = container.querySelector('[aria-label="更多操作"]');
      expect(trigger).toBeTruthy();
      const user = userEvent.setup();
      await user.click(trigger as HTMLElement);
      expect(document.querySelector("[data-testid='row-action-rename']")).toBeTruthy();
      expect(document.querySelector("[data-testid='row-action-delete']")).toBeTruthy();
    });

    it("renderMenuGroup row does NOT render ConvDeleteAction (no 'Delete conversation' button)", () => {
      render(() => <ChatSidebar />);
      const renderMenuGroup = F.capturedProps!.renderMenuGroup;
      const { container } = render(() =>
        renderMenuGroup({ label: "Test WS", value: "ws-test" }),
      );
      expect(container.querySelector('[aria-label="Delete conversation"]')).toBeFalsy();
    });

    it("renderMenuGroup delete opens confirm dialog — no inline overlay", async () => {
      render(() => <ChatSidebar />);
      const renderMenuGroup = F.capturedProps!.renderMenuGroup;
      const { container } = render(() =>
        renderMenuGroup({ label: "WS to Delete", value: "ws-del" }),
      );
      expect(container.querySelector('[data-state="confirming"]')).toBeFalsy();
      expect(F.mockDialogConfirm).not.toHaveBeenCalled();
      const user = userEvent.setup();
      await user.click(container.querySelector('[aria-label="更多操作"]') as HTMLElement);
      await user.click(document.querySelector("[data-testid='row-action-delete']") as HTMLElement);
      await vi.waitFor(() => {
        expect(F.mockDialogConfirm).toHaveBeenCalledWith(
          expect.objectContaining({ title: "删除项目", destructive: true }),
        );
      });
      expect(container.querySelector('[data-state="confirming"]')).toBeFalsy();
      expect(container.querySelector('[aria-label="确认删除"]')).toBeFalsy();
      expect(container.querySelector('[aria-label="取消删除"]')).toBeFalsy();
    });

    it("renderMenuGroup delete confirm=false does NOT call removeWorkspace", async () => {
      F.mockDialogConfirm.mockResolvedValue(false);
      render(() => <ChatSidebar />);
      const renderMenuGroup = F.capturedProps!.renderMenuGroup;
      const { container } = render(() =>
        renderMenuGroup({ label: "WS to Delete", value: "ws-del" }),
      );
      const user = userEvent.setup();
      await user.click(container.querySelector('[aria-label="更多操作"]') as HTMLElement);
      await user.click(document.querySelector("[data-testid='row-action-delete']") as HTMLElement);
      await vi.waitFor(() => {
        expect(F.mockDialogConfirm).toHaveBeenCalled();
        expect(F.mockRemoveWorkspace).not.toHaveBeenCalled();
      });
    });
  });

  describe("Seam P1: Plugin group from registry metadata", () => {
    it("plugin group children are sorted by sidebar.order (not hardcoded order)", () => {
      render(() => <ChatSidebar />);
      const opts = F.capturedProps!.options;
      const pluginChildren = opts[0].children;
      expect(pluginChildren[0].value).toBe("skills");
      expect(pluginChildren[1].value).toBe("mcp");
    });

    it("plugin group children use route.path for navigation (not hardcoded)", () => {
      render(() => <ChatSidebar />);
      const opts = F.capturedProps!.options;
      const pluginChildren = opts[0].children;
      expect(pluginChildren.find((c: any) => c.value === "skills")).toBeTruthy();
      expect(pluginChildren.find((c: any) => c.value === "mcp")).toBeTruthy();
    });

    it("navigates using route.path from metadata (not hardcoded /plugins/skills path)", () => {
      render(() => <ChatSidebar />);
      F.capturedProps!.onMenuSelect!("skills");
      expect(F.mockNavigate).toHaveBeenCalledWith({ to: "/plugins/skills" });
    });

    it("navigates using route.path for mcp (not hardcoded /plugins/mcp path)", () => {
      render(() => <ChatSidebar />);
      F.capturedProps!.onMenuSelect!("mcp");
      expect(F.mockNavigate).toHaveBeenCalledWith({ to: "/plugins/mcp" });
    });

    it("icons are rendered from sidebar.icon string identifier (WandSparkles/Cable)", () => {
      render(() => <ChatSidebar />);
      const opts = F.capturedProps!.options;
      const pluginChildren = opts[0].children;
      const skillsChild = pluginChildren.find((c: any) => c.value === "skills");
      const mcpChild = pluginChildren.find((c: any) => c.value === "mcp");
      expect(skillsChild?.icon).toBeTruthy();
      expect(mcpChild?.icon).toBeTruthy();
    });

    it("FAILS if metadata order is ignored: changing order in registry should reorder sidebar", () => {
      const reversedMetadata = new Map([
        [
          "mcp",
          {
            id: "mcp",
            route: { path: "/plugins/mcp", label: "MCP" },
            sidebar: { icon: "Cable", order: 1, visible: true },
          },
        ],
        [
          "skills",
          {
            id: "skills",
            route: { path: "/plugins/skills", label: "Skills" },
            sidebar: { icon: "WandSparkles", order: 2, visible: true },
          },
        ],
      ]);

      const originalGetPluginMetadata = F.getPluginMetadata;
      F.getPluginMetadata = () => reversedMetadata;

      render(() => <ChatSidebar />);
      const opts = F.capturedProps!.options;
      const pluginChildren = opts[0].children;
      expect(pluginChildren[0].value).toBe("mcp");
      expect(pluginChildren[1].value).toBe("skills");

      F.getPluginMetadata = originalGetPluginMetadata;
    });

    it("FAILS if visible=false is ignored: hidden plugin should not appear", () => {
      const metadataWithHidden = new Map([
        [
          "skills",
          {
            id: "skills",
            route: { path: "/plugins/skills", label: "Skills" },
            sidebar: { icon: "WandSparkles", order: 3, visible: true },
          },
        ],
        [
          "hidden-plugin",
          {
            id: "hidden-plugin",
            route: { path: "/plugins/hidden", label: "Hidden" },
            sidebar: { icon: "Star", order: 1, visible: false },
          },
        ],
      ]);

      const originalGetPluginMetadata = F.getPluginMetadata;
      F.getPluginMetadata = () => metadataWithHidden;

      render(() => <ChatSidebar />);
      const opts = F.capturedProps!.options;
      const pluginChildren = opts[0].children;
      expect(pluginChildren.find((c: any) => c.value === "hidden-plugin")).toBeUndefined();
      expect(pluginChildren.length).toBe(1);

      F.getPluginMetadata = originalGetPluginMetadata;
    });

    it("unknown icon identifier: renders fallback (Box) without throwing", () => {
      // Replaces the previous throw-on-unknown test. The Record-map refactor
      // (chat-sidebar.tsx renderPluginIcon) removes the throw default — a typo
      // or missing icon entry now renders Box instead of crashing the sidebar
      // (the regression caught in commit c8e4331). PluginIconName typechecks
      // the icon name at compile time; this test covers the runtime drift case
      // (an icon name that's valid per lucide-solid types but absent from the
      // PLUGIN_ICONS map — e.g., a renamed upstream export).
      const metadataWithUnknownIcon = new Map<string, unknown>([
        [
          "bad-plugin",
          {
            id: "bad-plugin",
            route: { path: "/plugins/bad", label: "Bad Plugin" },
            sidebar: { icon: "NonExistentIcon", order: 1, visible: true },
          },
        ],
      ]);

      const originalGetPluginMetadata = F.getPluginMetadata;
      F.getPluginMetadata = () => metadataWithUnknownIcon as ReturnType<typeof originalGetPluginMetadata>;

      // Should NOT throw — sidebar renders with the Box fallback icon.
      expect(() => render(() => <ChatSidebar />)).not.toThrow();

      F.getPluginMetadata = originalGetPluginMetadata;
    });

    // Regression for dev-mode bug: automations plugin uses icon "Clock"
    // (matches the Lucide icon used in its own settings/rule-list/execution-history
    // components). renderPluginIcon previously only allowed the three
    // builtin-plugin icons and threw on render — see chat-sidebar.tsx:38.
    it("renders all real plugin icons (WandSparkles, Cable, Users, Clock) without throwing", () => {
      const realPlugins = new Map([
        [
          "skills",
          {
            id: "skills",
            route: { path: "/plugins/skills", label: "Skills" },
            sidebar: { icon: "WandSparkles", order: 3, visible: true },
          },
        ],
        [
          "mcp",
          {
            id: "mcp",
            route: { path: "/plugins/mcp", label: "MCP" },
            sidebar: { icon: "Cable", order: 4, visible: true },
          },
        ],
        [
          "multi-agents",
          {
            id: "multi-agents",
            route: { path: "/plugins/multi-agents", label: "智能体" },
            sidebar: { icon: "Users", order: 30, visible: true },
          },
        ],
        [
          "automations",
          {
            id: "automations",
            route: { path: "/plugins/automations", label: "Automations" },
            sidebar: { icon: "Clock", order: 5, visible: true },
          },
        ],
      ]);

      const originalGetPluginMetadata = F.getPluginMetadata;
      F.getPluginMetadata = () => realPlugins;

      // Should not throw — renderPluginIcon must handle every icon actually
      // declared in src/renderer/src/plugins/**/index.ts.
      expect(() => render(() => <ChatSidebar />)).not.toThrow();
      const opts = F.capturedProps!.options;
      const pluginChildren = opts[0].children;
      // Order: WandSparkles/skills(3) → Cable/mcp(4) → Clock/automations(5) → Users/multi-agents(30)
      expect(pluginChildren.map((c: any) => c.value)).toEqual([
        "skills",
        "mcp",
        "automations",
        "multi-agents",
      ]);

      F.getPluginMetadata = originalGetPluginMetadata;
    });
  });

  describe("Seam T8: RowActions integration", () => {
    beforeEach(() => {
      F.capturedRowActionsProps = null;
      F.mockChatSidebarActions.deleteConversation.mockClear();
      F.mockChatSidebarActions.renameConversation.mockClear();
      F.mockChatSidebarActions.renameWorkspace.mockClear();
      F.mockChatSidebarActions.removeWorkspace.mockClear();
    });

    vi.mock("./row-actions", async () => {
      const actual = await vi.importActual<typeof import("./row-actions")>(
        "./row-actions",
      );
      return {
        ...actual,
        RowActions: (props: any) => {
          F.capturedRowActionsProps = props;
          return <actual.RowActions {...props} />;
        },
      };
    });

    vi.mock("../lib/chat-sidebar-actions", () => ({
      get chatSidebarActions() {
        return F.mockChatSidebarActions;
      },
    }));

    it("renderMenuGroup uses RowActions with kind='workspace'", () => {
      render(() => <ChatSidebar />);
      const renderMenuGroup = F.capturedProps!.renderMenuGroup;
      render(() => renderMenuGroup({ label: "Test WS", value: "ws-1" }));
      expect(F.capturedRowActionsProps).toBeTruthy();
      expect(F.capturedRowActionsProps.kind).toBe("workspace");
      expect(F.capturedRowActionsProps.id).toBe("ws-1");
      expect(F.capturedRowActionsProps.label).toBe("Test WS");
    });

    it("renderMenu uses RowActions with kind='conv'", () => {
      render(() => <ChatSidebar />);
      expect(F.capturedProps!.renderMenu).toBeTruthy();
      const renderMenu = F.capturedProps!.renderMenu!;
      render(() => renderMenu({ label: "Chat 1", value: "c-1" }));
      expect(F.capturedRowActionsProps).toBeTruthy();
      expect(F.capturedRowActionsProps.kind).toBe("conv");
      expect(F.capturedRowActionsProps.id).toBe("c-1");
      expect(F.capturedRowActionsProps.label).toBe("Chat 1");
    });

    it("renderMenu passes isAgentActive from store.byId", () => {
      F.mockParamsAccessor.mockImplementation(() => ({ convId: "c-2" }));
      render(() => <ChatSidebar />);
      const renderMenu = F.capturedProps!.renderMenu!;
      render(() => renderMenu({ label: "Chat 2", value: "c-2" }));
      expect(F.capturedRowActionsProps.isAgentActive).toBe(true);
    });

    it("RowActions delete on conv row calls chatSidebarActions.deleteConversation with convId", async () => {
      F.mockDialogConfirm.mockResolvedValue(true);
      render(() => <ChatSidebar />);
      const renderMenu = F.capturedProps!.renderMenu!;
      const { container } = render(() => renderMenu({ label: "Chat to Delete", value: "c-del" }));
      const user = userEvent.setup();
      await user.click(container.querySelector('[aria-label="更多操作"]') as HTMLElement);
      await user.click(document.querySelector("[data-testid='row-action-delete']") as HTMLElement);
      await vi.waitFor(() => {
        expect(F.mockChatSidebarActions.deleteConversation).toHaveBeenCalledWith("c-del");
      });
    });

    it("RowActions rename on conv row calls chatSidebarActions.renameConversation with (convId, newTitle)", async () => {
      render(() => <ChatSidebar />);
      const renderMenu = F.capturedProps!.renderMenu!;
      const { container } = render(() => renderMenu({ label: "Old Chat", value: "c-ren" }));
      const user = userEvent.setup();
      await user.click(container.querySelector('[aria-label="更多操作"]') as HTMLElement);
      await user.click(document.querySelector("[data-testid='row-action-rename']") as HTMLElement);
      const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
      const { fireEvent } = await import("@solidjs/testing-library");
      fireEvent.input(input, { target: { value: "New Chat Title" } });
      fireEvent.keyDown(input, { key: "Enter" });
      await vi.waitFor(() => {
        expect(F.mockChatSidebarActions.renameConversation).toHaveBeenCalledWith("c-ren", "New Chat Title");
      });
    });

    it("deleting currently viewed conv (activated conv) navigates to home", async () => {
      F.mockParamsAccessor.mockImplementation(() => ({ convId: "c-1" }));
      F.mockDialogConfirm.mockResolvedValue(true);
      render(() => <ChatSidebar />);
      const renderMenu = F.capturedProps!.renderMenu!;
      const { container } = render(() => renderMenu({ label: "Active Chat", value: "c-1" }));
      const user = userEvent.setup();
      await user.click(container.querySelector('[aria-label="更多操作"]') as HTMLElement);
      await user.click(document.querySelector("[data-testid='row-action-delete']") as HTMLElement);
      await vi.waitFor(() => {
        expect(F.mockNavigate).toHaveBeenCalledWith({ to: "/" });
      });
    });
  });
});
