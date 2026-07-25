//! ChatSidebar — chat-domain wrapper tests (PR 2).
//!
//! Strategy: mock CodemanSidebar to capture the props ChatSidebar passes.
//! Verify ChatSidebar's CONTRACT (what it passes to CodemanSidebar) rather
//! than the rendered DOM. Chat-sidebar.test.tsx verifies chat-specific
//! wiring; codeman-sidebar.test.tsx verifies the universal sidebar's
//! rendering; workspace-actions.test.tsx + conv-delete-action.test.tsx
//! verify the leaf components.

import { render } from "@solidjs/testing-library";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Effect } from "effect";

// ─── Captured props from ChatSidebar → CodemanSidebar ─────────────────────

interface CapturedProps {
  options: any[];
  renderItem: (item: any) => any;
  renderSubItem?: (sub: any) => any;
  renderGroupHeader?: (group: any) => any;
  currentValue?: string;
  onItemSelect?: (value: string) => void;
  onSubItemSelect?: (value: string) => void;
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
    mockShowRenameDialog: vi.fn(),
    capturedProps: null as CapturedProps | null,
    // For RowActions mock (T8)
    capturedRowActionsProps: null as any,
    mockChatSidebarActions: {
      deleteConversation: vi.fn().mockResolvedValue(undefined),
      renameConversation: vi.fn().mockResolvedValue(undefined),
      renameWorkspace: vi.fn().mockResolvedValue(true),
      removeWorkspace: vi.fn().mockResolvedValue(true),
    },
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

vi.mock("./workspace-rename-dialog", () => ({
  showRenameDialog: (...args: unknown[]) => F.mockShowRenameDialog(...args),
}));

vi.mock("../../../shared/components/internal/codeman-sidebar", () => ({
  CodemanSidebar: (props: any) => {
    F.capturedProps = {
      options: props.options,
      renderItem: props.renderItem,
      renderSubItem: props.renderSubItem,
      renderGroupHeader: props.renderGroupHeader,
      currentValue: props.currentValue,
      onItemSelect: props.onItemSelect,
      onSubItemSelect: props.onSubItemSelect,
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

import { ChatSidebar } from "./chat-sidebar";

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
  F.mockShowRenameDialog.mockReset();
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("ChatSidebar (PR 2)", () => {
  it("builds SidebarGroupOption[] with workspace items and conv subItems", () => {
    render(() => <ChatSidebar />);
    expect(F.capturedProps).toBeTruthy();
    const opts = F.capturedProps!.options;
    expect(opts.length).toBe(1);
    // Top-level project group — always visible (no defaultExpanded; sidebar-reshim Q28 reversal)
    expect(opts[0]).toMatchObject({
      label: "项目",
      value: "workspace",
    });
    // Two workspaces as children, each carrying per-workspace Accordion defaultExpanded
    expect(opts[0].children.length).toBe(2);
    expect(opts[0].children[0]).toMatchObject({
      label: "Frontend",
      value: "ws-1",
      defaultExpanded: true,
    });
    // Convs as subItems (not children)
    expect(opts[0].children[0].subItems).toEqual([
      { label: "Chat 1", value: "c-1" },
      { label: "Chat 2", value: "c-2" },
    ]);
    expect(opts[0].children[1]).toMatchObject({
      label: "Backend",
      value: "ws-2",
      defaultExpanded: true,
    });
    expect(opts[0].children[1].subItems).toEqual([
      { label: "Chat 3", value: "c-3" },
    ]);
  });

  it("passes emptyMessage='No workspaces' to CodemanSidebar", () => {
    render(() => <ChatSidebar />);
    expect(F.capturedProps?.emptyMessage).toBe("No workspaces");
  });

  it("onSubItemSelect navigates to /conversation/{value}", () => {
    render(() => <ChatSidebar />);
    F.capturedProps!.onSubItemSelect!("c-1");
    expect(F.mockNavigate).toHaveBeenCalledWith({ to: "/conversation/c-1" });
  });

  it("onItemSelect also navigates (for workspace click, though chat uses onSubItemSelect)", () => {
    render(() => <ChatSidebar />);
    F.capturedProps!.onItemSelect!("c-1");
    expect(F.mockNavigate).toHaveBeenCalledWith({ to: "/conversation/c-1" });
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
    const subItems = F.capturedProps!.options[0].children[0].subItems;
    // c-1 has updatedAt=200, c-2 has updatedAt=100
    expect(subItems[0].label).toBe("Chat 1");
    expect(subItems[1].label).toBe("Chat 2");
  });

  // ─── Seam 20: workspace hover rename + delete ─────────────────────────────
  describe("Seam 20: workspace hover rename+delete via renderItem", () => {
    it("renderItem returns JSX containing rename and delete buttons", () => {
      render(() => <ChatSidebar />);
      expect(F.capturedProps).toBeTruthy();
      const renderItem = F.capturedProps!.renderItem;
      const { container } = render(() =>
        renderItem({ label: "Test WS", value: "ws-test" }),
      );
      expect(container.querySelector('[aria-label="Rename Test WS"]')).toBeTruthy();
      expect(container.querySelector('[aria-label="Delete Test WS"]')).toBeTruthy();
    });

    it("renderItem workspace row does NOT render ConvDeleteAction (no 'Delete conversation' button)", () => {
      // Workspace rows must not include the conv-style trash button — it was
      // historically misplaced here, calling handleConvDelete(wsId) which
      // invoked chatSidebarActions.deleteConversation(wsId) on a non-existent
      // conv id. Workspace rows now show only label + (right) rename+delete
      // (with delete using inline-confirm).
      render(() => <ChatSidebar />);
      const renderItem = F.capturedProps!.renderItem;
      const { container } = render(() =>
        renderItem({ label: "Test WS", value: "ws-test" }),
      );
      expect(container.querySelector('[aria-label="Delete conversation"]')).toBeFalsy();
    });

    it("renderItem delete button shows inline-confirm overlay IN PLACE — does NOT open any dialog", async () => {
      render(() => <ChatSidebar />);
      const renderItem = F.capturedProps!.renderItem;
      const { container } = render(() =>
        renderItem({ label: "WS to Delete", value: "ws-del" }),
      );
      // Initially: no confirming overlay, no dialog call
      expect(container.querySelector('[data-state="confirming"]')).toBeFalsy();
      expect(F.mockDialogConfirm).not.toHaveBeenCalled();
      // Click the delete button — should switch the row into inline-confirm state
      const deleteBtn = container.querySelector('[aria-label="Delete WS to Delete"]') as HTMLButtonElement;
      deleteBtn.click();
      // STILL no modal call (the entire point of the fix)
      expect(F.mockDialogConfirm).not.toHaveBeenCalled();
      // The inline overlay appears at the original row position with 删除 / 取消 buttons
      expect(container.querySelector('[data-state="confirming"]')).toBeTruthy();
      expect(container.querySelector('[aria-label="确认删除"]')).toBeTruthy();
      expect(container.querySelector('[aria-label="取消删除"]')).toBeTruthy();
    });

    it("renderItem inline-confirm '取消' button hides overlay without calling removeWorkspace", async () => {
      render(() => <ChatSidebar />);
      const renderItem = F.capturedProps!.renderItem;
      const { container } = render(() =>
        renderItem({ label: "WS to Delete", value: "ws-del" }),
      );
      // Enter inline-confirm state
      const deleteBtn = container.querySelector('[aria-label="Delete WS to Delete"]') as HTMLButtonElement;
      deleteBtn.click();
      expect(container.querySelector('[data-state="confirming"]')).toBeTruthy();
      // Cancel
      const cancelBtn = container.querySelector('[aria-label="取消删除"]') as HTMLButtonElement;
      expect(cancelBtn).toBeTruthy();
      cancelBtn.click();
      // removeWorkspace was NOT called
      expect(F.mockRemoveWorkspace).not.toHaveBeenCalled();
      // Overlay is gone — row returns to its hover/idle state
      expect(container.querySelector('[data-state="confirming"]')).toBeFalsy();
      expect(container.querySelector('[aria-label="确认删除"]')).toBeFalsy();
      expect(container.querySelector('[aria-label="取消删除"]')).toBeFalsy();
    });
  });

  // ─── Seam T8: RowActions integration ───────────────────────────────────────
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

    it("renderItem uses RowActions with kind='workspace'", () => {
      render(() => <ChatSidebar />);
      const renderItem = F.capturedProps!.renderItem;
      render(() => renderItem({ label: "Test WS", value: "ws-1" }));
      expect(F.capturedRowActionsProps).toBeTruthy();
      expect(F.capturedRowActionsProps.kind).toBe("workspace");
      expect(F.capturedRowActionsProps.id).toBe("ws-1");
      expect(F.capturedRowActionsProps.label).toBe("Test WS");
    });

    it("renderSubItem uses RowActions with kind='conv'", () => {
      render(() => <ChatSidebar />);
      expect(F.capturedProps!.renderSubItem).toBeTruthy();
      const renderSubItem = F.capturedProps!.renderSubItem!;
      render(() => renderSubItem({ label: "Chat 1", value: "c-1" }));
      expect(F.capturedRowActionsProps).toBeTruthy();
      expect(F.capturedRowActionsProps.kind).toBe("conv");
      expect(F.capturedRowActionsProps.id).toBe("c-1");
      expect(F.capturedRowActionsProps.label).toBe("Chat 1");
    });

    it("renderSubItem passes isStreaming from store.byId", () => {
      // c-2 has streamingMessageId: "msg-x" in mockStoreById
      F.mockParamsAccessor.mockImplementation(() => ({ convId: "c-2" }));
      render(() => <ChatSidebar />);
      const renderSubItem = F.capturedProps!.renderSubItem!;
      render(() => renderSubItem({ label: "Chat 2", value: "c-2" }));
      expect(F.capturedRowActionsProps.isStreaming).toBe(true);
    });

    it("RowActions delete on conv row calls chatSidebarActions.deleteConversation with convId", async () => {
      render(() => <ChatSidebar />);
      const renderSubItem = F.capturedProps!.renderSubItem!;
      const { container } = render(() => renderSubItem({ label: "Chat to Delete", value: "c-del" }));
      // Click the trash button
      const deleteBtn = container.querySelector("[aria-label='Delete conversation']") as HTMLButtonElement;
      deleteBtn.click();
      // Confirm delete
      const confirmBtn = container.querySelector("[aria-label='确认删除']") as HTMLButtonElement;
      confirmBtn.click();
      expect(F.mockChatSidebarActions.deleteConversation).toHaveBeenCalledWith("c-del");
    });

    it("RowActions rename on conv row calls chatSidebarActions.renameConversation with (convId, newTitle)", async () => {
      render(() => <ChatSidebar />);
      const renderSubItem = F.capturedProps!.renderSubItem!;
      const { container } = render(() => renderSubItem({ label: "Old Chat", value: "c-ren" }));
      // Click rename button
      const renameBtn = container.querySelector("[aria-label='Rename Old Chat']") as HTMLButtonElement;
      renameBtn.click();
      // Type new name
      const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
      const { fireEvent } = await import("@solidjs/testing-library");
      fireEvent.input(input, { target: { value: "New Chat Title" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(F.mockChatSidebarActions.renameConversation).toHaveBeenCalledWith("c-ren", "New Chat Title");
    });

    it("deleting currently viewed conv (activated conv) navigates to home", async () => {
      // Set up: currently viewing c-1
      F.mockParamsAccessor.mockImplementation(() => ({ convId: "c-1" }));
      render(() => <ChatSidebar />);
      const renderSubItem = F.capturedProps!.renderSubItem!;
      const { container } = render(() => renderSubItem({ label: "Active Chat", value: "c-1" }));
      // Click delete on c-1 (the currently viewed conv)
      const deleteBtn = container.querySelector("[aria-label='Delete conversation']") as HTMLButtonElement;
      deleteBtn.click();
      const confirmBtn = container.querySelector("[aria-label='确认删除']") as HTMLButtonElement;
      confirmBtn.click();
      // Wait for async handleConvDelete to complete
      await vi.waitFor(() => {
        expect(F.mockNavigate).toHaveBeenCalledWith({ to: "/" });
      });
    });
  });
});
