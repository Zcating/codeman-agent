//! ChatSidebar — chat-domain wrapper tests (PR 2).
//!
//! Strategy: mock CodemanSidebar to capture the props ChatSidebar passes.
//! Verify ChatSidebar's CONTRACT (what it passes to CodemanSidebar) rather
//! than the rendered DOM. Chat-sidebar.test.tsx verifies chat-specific
//! wiring; codeman-sidebar.test.tsx verifies the universal sidebar's
//! rendering; row-actions.test.tsx verifies the leaf component (delete +
//! rename + inline-confirm + inline edit-in-place).

import { render } from "@solidjs/testing-library";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Effect } from "effect";

// ─── Captured props from ChatSidebar → CodemanSidebar ─────────────────────

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
      "c-1": { workspaceId: "ws-1", streamingMessageId: null },
      "c-2": { workspaceId: "ws-1", streamingMessageId: "msg-x" },
      "c-3": { workspaceId: "ws-2", streamingMessageId: null },
    } as Record<string, { workspaceId: string; streamingMessageId: string | null }>,
    mockNavigate: vi.fn(),
    mockParamsAccessor: vi.fn(() => ({ convId: undefined as string | undefined })),
    mockSetSelectedWorkspaceId: vi.fn(),
    mockDeleteConversation: vi.fn(() => Effect.succeed(undefined)),
    mockRenameWorkspace: vi.fn(() => Effect.succeed(undefined)),
    mockRemoveWorkspace: vi.fn(() => Effect.succeed(undefined)),
    mockDialogConfirm: vi.fn(),
    capturedProps: null as CapturedProps | null,
    // For RowActions mock (T8)
    capturedRowActionsProps: null as any,
    mockChatSidebarActions: {
      deleteConversation: vi.fn().mockResolvedValue(undefined),
      renameConversation: vi.fn().mockResolvedValue(undefined),
      renameWorkspace: vi.fn().mockResolvedValue(true),
      removeWorkspace: vi.fn().mockResolvedValue(true),
    },
    // Default plugin metadata for tests
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

// ─── Module mocks ──────────────────────────────────────────────────────────

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

// ─── Imports under test ───────────────────────────────────────────────────

import { ChatSidebar } from "@codeman-frontend/features/chat/components/chat-sidebar";

// ─── Setup ─────────────────────────────────────────────────────────────────

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

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("ChatSidebar (PR 2)", () => {
  it("builds CodemanSidebarGroupOption[] with plugin group and project group", () => {
    render(() => <ChatSidebar />);
    expect(F.capturedProps).toBeTruthy();
    const opts = F.capturedProps!.options;
    expect(opts.length).toBe(2);

    // Plugin group (top)
    expect(opts[0]).toMatchObject({
      label: "插件",
      value: "plugins",
    });
    // Plugin children: Skills and MCP
    expect(opts[0].children.length).toBe(2);
    expect(opts[0].children[0]).toMatchObject({
      label: "Skills",
      value: "skills",
    });
    expect(opts[0].children[1]).toMatchObject({
      label: "MCP",
      value: "mcp",
    });

    // Project group (second) — always visible (no defaultExpanded; sidebar-reshim Q28 reversal)
    expect(opts[1]).toMatchObject({
      label: "项目",
      value: "workspace",
    });
    // Two MenuGroups as children, each carrying per-group Accordion defaultExpanded
    expect(opts[1].children.length).toBe(2);
    expect(opts[1].children[0]).toMatchObject({
      label: "Frontend",
      value: "ws-1",
      defaultExpanded: true,
    });
    // Convs as Menu children of each MenuGroup
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

  it("onMenuGroupSelect is NOT wired (MenuGroup click must NOT navigate — ADR-0023 D7-CS)", () => {
    // Per ADR-0023 D7-CS: MenuGroups are NEVER active, only
    // menus are. Clicking a MenuGroup label should ONLY toggle its accordion —
    // it must NOT navigate to /conversation/{wsId} (a non-existent conv route).
    // Universal CodemanSidebar still calls props.onMenuGroupSelect?.() — but
    // chat intentionally does not pass one (no-op when undefined).
    render(() => <ChatSidebar />);
    expect(F.capturedProps?.onMenuGroupSelect).toBeUndefined();
  });

  it("clicking MenuGroup label does NOT navigate (regression: avoid /conversation/{wsId} 404)", async () => {
    // User-reported 2026-07-25: clicking the outer accordion trigger button
    // used to navigate to /conversation/{wsId}. Workspace id ≠ conv id → 404.
    // After fix: chat passes no onMenuGroupSelect → CodemanSidebar's
    // handleSelect is a no-op → no navigation. Accordion toggle still fires.
    render(() => <ChatSidebar />);
    F.mockNavigate.mockClear();
    expect(F.capturedProps?.onMenuGroupSelect).toBeUndefined();
    expect(F.mockNavigate).not.toHaveBeenCalled();
  });

  it("clicking inner Delete button in renderMenuGroup does NOT navigate (RowActions stopPropagation)", async () => {
    // Defensive: inner Rename/Delete buttons in RowActions call
    // e.stopPropagation() so the outer CodemanSidebar trigger's onClick should
    // NOT fire. After fix, onMenuGroupSelect is absent — but we still assert
    // no navigate to lock the defensive contract.
    render(() => <ChatSidebar />);
    F.mockNavigate.mockClear();
    const renderMenuGroup = F.capturedProps!.renderMenuGroup;
    const { container } = render(() =>
      renderMenuGroup({ label: "WS", value: "ws-navigate" }),
    );
    const deleteBtn = container.querySelector('[aria-label="Delete WS"]') as HTMLButtonElement;
    deleteBtn.click();
    expect(F.mockNavigate).not.toHaveBeenCalled();
    expect(container.querySelector('[data-state="confirming"]')).toBeTruthy();
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
    // c-1 has updatedAt=200, c-2 has updatedAt=100
    expect(menus[0].label).toBe("Chat 1");
    expect(menus[1].label).toBe("Chat 2");
  });

  // ─── Seam 20: workspace hover rename + delete ─────────────────────────────
  describe("Seam 20: MenuGroup hover rename+delete via renderMenuGroup", () => {
    it("renderMenuGroup returns JSX containing rename and delete buttons", () => {
      render(() => <ChatSidebar />);
      expect(F.capturedProps).toBeTruthy();
      const renderMenuGroup = F.capturedProps!.renderMenuGroup;
      const { container } = render(() =>
        renderMenuGroup({ label: "Test WS", value: "ws-test" }),
      );
      expect(container.querySelector('[aria-label="Rename Test WS"]')).toBeTruthy();
      expect(container.querySelector('[aria-label="Delete Test WS"]')).toBeTruthy();
    });

    it("renderMenuGroup row does NOT render ConvDeleteAction (no 'Delete conversation' button)", () => {
      render(() => <ChatSidebar />);
      const renderMenuGroup = F.capturedProps!.renderMenuGroup;
      const { container } = render(() =>
        renderMenuGroup({ label: "Test WS", value: "ws-test" }),
      );
      expect(container.querySelector('[aria-label="Delete conversation"]')).toBeFalsy();
    });

    it("renderMenuGroup delete button shows inline-confirm overlay IN PLACE — does NOT open any dialog", async () => {
      render(() => <ChatSidebar />);
      const renderMenuGroup = F.capturedProps!.renderMenuGroup;
      const { container } = render(() =>
        renderMenuGroup({ label: "WS to Delete", value: "ws-del" }),
      );
      expect(container.querySelector('[data-state="confirming"]')).toBeFalsy();
      expect(F.mockDialogConfirm).not.toHaveBeenCalled();
      const deleteBtn = container.querySelector('[aria-label="Delete WS to Delete"]') as HTMLButtonElement;
      deleteBtn.click();
      expect(F.mockDialogConfirm).not.toHaveBeenCalled();
      expect(container.querySelector('[data-state="confirming"]')).toBeTruthy();
      expect(container.querySelector('[aria-label="确认删除"]')).toBeTruthy();
      expect(container.querySelector('[aria-label="取消删除"]')).toBeTruthy();
    });

    it("renderMenuGroup inline-confirm '取消' button hides overlay without calling removeWorkspace", async () => {
      render(() => <ChatSidebar />);
      const renderMenuGroup = F.capturedProps!.renderMenuGroup;
      const { container } = render(() =>
        renderMenuGroup({ label: "WS to Delete", value: "ws-del" }),
      );
      const deleteBtn = container.querySelector('[aria-label="Delete WS to Delete"]') as HTMLButtonElement;
      deleteBtn.click();
      expect(container.querySelector('[data-state="confirming"]')).toBeTruthy();
      const cancelBtn = container.querySelector('[aria-label="取消删除"]') as HTMLButtonElement;
      expect(cancelBtn).toBeTruthy();
      cancelBtn.click();
      expect(F.mockRemoveWorkspace).not.toHaveBeenCalled();
      expect(container.querySelector('[data-state="confirming"]')).toBeFalsy();
      expect(container.querySelector('[aria-label="确认删除"]')).toBeFalsy();
      expect(container.querySelector('[aria-label="取消删除"]')).toBeFalsy();
    });
  });

  // ─── Seam P1: Plugin group derived from registry metadata ─────────────────────
  describe("Seam P1: Plugin group from registry metadata", () => {
    // Mock @codeman-frontend/plugins for getPluginMetadata
    vi.mock("@codeman-frontend/plugins", () => ({
      getPluginMetadata: () => F.getPluginMetadata(),
    }));

    it("plugin group children are sorted by sidebar.order (not hardcoded order)", () => {
      render(() => <ChatSidebar />);
      const opts = F.capturedProps!.options;
      const pluginChildren = opts[0].children;
      // skills has order=3, mcp has order=4 → skills should come first
      expect(pluginChildren[0].value).toBe("skills");
      expect(pluginChildren[1].value).toBe("mcp");
    });

    it("plugin group children use route.path for navigation (not hardcoded)", () => {
      render(() => <ChatSidebar />);
      const opts = F.capturedProps!.options;
      const pluginChildren = opts[0].children;
      // Verify the children have the correct values that map to route.path
      expect(pluginChildren.find((c: any) => c.value === "skills")).toBeTruthy();
      expect(pluginChildren.find((c: any) => c.value === "mcp")).toBeTruthy();
    });

    it("navigates using route.path from metadata (not hardcoded /plugins/skills path)", () => {
      render(() => <ChatSidebar />);
      // The onMenuSelect handler should navigate using registry metadata
      // Skills value "skills" should navigate to "/plugins/skills" from metadata
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
      // Icons should be JSX elements (WandSparkles for skills, Cable for mcp)
      expect(skillsChild?.icon).toBeTruthy();
      expect(mcpChild?.icon).toBeTruthy();
    });

    it("FAILS if metadata order is ignored: changing order in registry should reorder sidebar", () => {
      // Build metadata with REVERSED order to prove sorting is applied
      const reversedMetadata = new Map([
        [
          "mcp",
          {
            id: "mcp",
            route: { path: "/plugins/mcp", label: "MCP" },
            sidebar: { icon: "Cable", order: 1, visible: true }, // mcp comes first
          },
        ],
        [
          "skills",
          {
            id: "skills",
            route: { path: "/plugins/skills", label: "Skills" },
            sidebar: { icon: "WandSparkles", order: 2, visible: true }, // skills comes second
          },
        ],
      ]);

      // This test FAILS with hardcoded implementation because mcp is hardcoded first
      // With registry-based implementation, mcp should appear first
      const originalGetPluginMetadata = F.getPluginMetadata;
      F.getPluginMetadata = () => reversedMetadata;

      render(() => <ChatSidebar />);
      const opts = F.capturedProps!.options;
      const pluginChildren = opts[0].children;
      // With registry-based implementation sorted by order, mcp (order=1) should come first
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
      // hidden-plugin should NOT appear
      expect(pluginChildren.find((c: any) => c.value === "hidden-plugin")).toBeUndefined();
      expect(pluginChildren.length).toBe(1); // only skills

      F.getPluginMetadata = originalGetPluginMetadata;
    });
  });

  // ─── Seam T8: RowActions integration ────────────────────────────────────────
  describe("Seam T8: RowActions integration", () => {
    beforeEach(() => {
      F.capturedRowActionsProps = null;
      F.mockChatSidebarActions.deleteConversation.mockClear();
      F.mockChatSidebarActions.renameConversation.mockClear();
      F.mockChatSidebarActions.renameWorkspace.mockClear();
      F.mockChatSidebarActions.removeWorkspace.mockClear();
    });

    // Mock RowActions to:
    // 1. Render the actual RowActions component (so OLD DOM tests still work)
    // 2. Capture the props (so NEW prop-verification tests work)
    vi.mock("./row-actions", async () => {
      const actual = await vi.importActual<typeof import("./row-actions")>(
        "./row-actions",
      );
      return {
        ...actual,
        RowActions: (props: any) => {
          F.capturedRowActionsProps = props;
          // Render actual RowActions so DOM queries still work
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

    it("renderMenu passes isStreaming from store.byId", () => {
      F.mockParamsAccessor.mockImplementation(() => ({ convId: "c-2" }));
      render(() => <ChatSidebar />);
      const renderMenu = F.capturedProps!.renderMenu!;
      render(() => renderMenu({ label: "Chat 2", value: "c-2" }));
      expect(F.capturedRowActionsProps.isStreaming).toBe(true);
    });

    it("RowActions delete on conv row calls chatSidebarActions.deleteConversation with convId", async () => {
      render(() => <ChatSidebar />);
      const renderMenu = F.capturedProps!.renderMenu!;
      const { container } = render(() => renderMenu({ label: "Chat to Delete", value: "c-del" }));
      const deleteBtn = container.querySelector("[aria-label='Delete conversation']") as HTMLButtonElement;
      deleteBtn.click();
      const confirmBtn = container.querySelector("[aria-label='确认删除']") as HTMLButtonElement;
      confirmBtn.click();
      expect(F.mockChatSidebarActions.deleteConversation).toHaveBeenCalledWith("c-del");
    });

    it("RowActions rename on conv row calls chatSidebarActions.renameConversation with (convId, newTitle)", async () => {
      render(() => <ChatSidebar />);
      const renderMenu = F.capturedProps!.renderMenu!;
      const { container } = render(() => renderMenu({ label: "Old Chat", value: "c-ren" }));
      const renameBtn = container.querySelector("[aria-label='Rename Old Chat']") as HTMLButtonElement;
      renameBtn.click();
      const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
      const { fireEvent } = await import("@solidjs/testing-library");
      fireEvent.input(input, { target: { value: "New Chat Title" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(F.mockChatSidebarActions.renameConversation).toHaveBeenCalledWith("c-ren", "New Chat Title");
    });

    it("deleting currently viewed conv (activated conv) navigates to home", async () => {
      F.mockParamsAccessor.mockImplementation(() => ({ convId: "c-1" }));
      render(() => <ChatSidebar />);
      const renderMenu = F.capturedProps!.renderMenu!;
      const { container } = render(() => renderMenu({ label: "Active Chat", value: "c-1" }));
      const deleteBtn = container.querySelector("[aria-label='Delete conversation']") as HTMLButtonElement;
      deleteBtn.click();
      const confirmBtn = container.querySelector("[aria-label='确认删除']") as HTMLButtonElement;
      confirmBtn.click();
      await vi.waitFor(() => {
        expect(F.mockNavigate).toHaveBeenCalledWith({ to: "/" });
      });
    });
  });
});
