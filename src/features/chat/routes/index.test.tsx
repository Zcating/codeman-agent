//! routes/index.test.tsx — ChatLayout 状态机测试 (T4.3)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@solidjs/testing-library";
import type { Conversation } from "../../../shared/lib/types";

// ─── Mock @tanstack/solid-router ──────────────────────────────────────────

vi.mock("@tanstack/solid-router", () => ({
  Link: (props: any) => {
    const { activeProps, inactiveProps, ...rest } = props;
    return <a {...rest} {...(props.to ? { href: props.to } : {})}>{props.children}</a>;
  },
  useRouter: () => ({ navigate: vi.fn() }),
}));

// ─── Mock chat.store ────────────────────────────────────────────────

vi.mock("../stores/chat.store", () => ({
  store: { byId: {} },
  activeId$: vi.fn<() => string | null>(),
  workspaces$: vi.fn<() => Array<{ id: string; label: string; root_path: string }>>(),
  conversations$: vi.fn<() => Conversation[]>(),
  selectConversation: vi.fn<(id: string) => void>(),
  deleteConversation: vi.fn(),
  clearActiveConversation: vi.fn<() => void>(),
  setSelectedWorkspaceId: vi.fn<(id: string | null) => void>(),
  createConversation: vi.fn(),
  sendMessage: vi.fn(),
  cancel: vi.fn(),
  archiveConversation: vi.fn(),
  setupConvState: vi.fn(),
  loadConversations: vi.fn(),
}));

// ─── Mock CodemanSidebar (internal component) ────────────────────────────────

vi.mock("../../../shared/components/internal/codeman-sidebar", () => ({
  CodemanSidebar: (props: any) => (
    <div data-testid="codeman-sidebar">
      <button
        data-testid="sidebar-ws-ws-1"
        onClick={() => props.onEmptyWorkspaceClick?.("ws-1")}
      >
        Workspace ws-1
      </button>
      <button
        data-testid="sidebar-item-conv-1"
        onClick={() => props.onSelectItem?.("conv-1")}
      >
        Conversation conv-1
      </button>
      <button data-testid="sidebar-back-to-home" onClick={() => props.onCreateItem?.()}>
        New conversation
      </button>
      <button data-testid="sidebar-add-workspace" onClick={() => props.onAddWorkspace?.()}>
        Add workspace
      </button>
      <span data-testid="sidebar-selected-item">{props.selectedItemId ?? "none"}</span>
    </div>
  ),
  type: {},
}));

// ─── Import ChatLayout after mocks ─────────────────────────────────────────

import { ChatLayout } from "./index";

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("ChatLayout — state machine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("T4.3.1: Renders HomeAgentForm when activeId$() === null", async () => {
    const { activeId$ } = await import("../stores/chat.store") as any;
    activeId$.mockReturnValue(null);

    const { getByTestId, queryByTestId } = render(() => <ChatLayout />);
    // HomeAgentForm should be visible
    expect(getByTestId("codex-input")).toBeTruthy();
    // Back button should NOT be visible
    expect(queryByTestId("back-to-home")).toBeNull();
  });

  it("T4.3.2: Back button shows when activeId$() !== null", async () => {
    const { activeId$ } = await import("../stores/chat.store") as any;
    activeId$.mockReturnValue("conv-1");

    const { getByTestId } = render(() => <ChatLayout />);
    expect(getByTestId("back-to-home")).toBeTruthy();
  });

  it("T4.3.3: Back button hidden when activeId$() === null", async () => {
    const { activeId$ } = await import("../stores/chat.store") as any;
    activeId$.mockReturnValue(null);

    const { queryByTestId } = render(() => <ChatLayout />);
    expect(queryByTestId("back-to-home")).toBeNull();
  });

  it("T4.3.4: Click back button → clearActiveConversation called", async () => {
    const { activeId$, clearActiveConversation } = await import("../stores/chat.store") as any;
    activeId$.mockReturnValue("conv-1");

    const { getByTestId } = render(() => <ChatLayout />);
    fireEvent.click(getByTestId("back-to-home"));
    expect(clearActiveConversation).toHaveBeenCalledTimes(1);
  });

  it("T4.3.5: CodemanSidebar visible when workspaces exist", async () => {
    const { workspaces$ } = await import("../stores/chat.store") as any;
    workspaces$.mockReturnValue([
      { id: "ws-1", label: "My Project", root_path: "C:\\projects" },
    ]);

    const { getByTestId } = render(() => <ChatLayout />);
    expect(getByTestId("codeman-sidebar")).toBeTruthy();
  });

  it("T4.3.6: Click empty workspace in sidebar → setSelectedWorkspaceId called (D7-CS)", async () => {
    const { workspaces$, setSelectedWorkspaceId } = await import("../stores/chat.store") as any;
    workspaces$.mockReturnValue([
      { id: "ws-1", label: "My Project", root_path: "C:\\projects" },
    ]);

    const { getByTestId } = render(() => <ChatLayout />);
    // D7-CS: workspace header click expands/collapses; empty ws click triggers handleEmptyWorkspaceClick
    fireEvent.click(getByTestId("sidebar-ws-ws-1"));
    expect(setSelectedWorkspaceId).toHaveBeenCalledWith("ws-1");
  });

  it("T4.3.7: Click conversation item in sidebar → selectConversation called", async () => {
    const { workspaces$, conversations$, selectConversation } = await import("../stores/chat.store") as any;
    workspaces$.mockReturnValue([
      { id: "ws-1", label: "My Project", root_path: "C:\\projects" },
    ]);
    conversations$.mockReturnValue([
      {
        id: "conv-1",
        title: "Test Chat",
        workspace_id: "ws-1",
        updated_at: Date.now() / 1000,
        created_at: Date.now() / 1000,
        system_prompt: null,
        archived_at: null,
      },
    ]);

    const { getByTestId } = render(() => <ChatLayout />);
    fireEvent.click(getByTestId("sidebar-item-conv-1"));
    expect(selectConversation).toHaveBeenCalledWith("conv-1");
  });

  it("T4.3.8: CodemanSidebar hidden when no workspaces AND no active conv", async () => {
    const { workspaces$ } = await import("../stores/chat.store") as any;
    workspaces$.mockReturnValue([]);
    const { activeId$ } = await import("../stores/chat.store") as any;
    activeId$.mockReturnValue(null);

    const { queryByTestId } = render(() => <ChatLayout />);
    expect(queryByTestId("codeman-sidebar")).toBeNull();
  });
});
