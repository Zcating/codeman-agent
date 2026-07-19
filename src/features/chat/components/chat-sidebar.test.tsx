//! ChatSidebar — chat-domain wrapper tests.
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
  renderGroupHeader?: (group: any) => any;
  currentValue?: string;
  onItemSelect?: (value: string) => void;
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
      renderGroupHeader: props.renderGroupHeader,
      currentValue: props.currentValue,
      onItemSelect: props.onItemSelect,
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

describe("ChatSidebar", () => {
  it("builds options from workspaces + conversations (groups + leaves)", () => {
    render(() => <ChatSidebar />);
    expect(F.capturedProps).toBeTruthy();
    const opts = F.capturedProps!.options;
    expect(opts.length).toBe(2);
    expect(opts[0]).toMatchObject({
      label: "Frontend",
      value: "ws-1",
      defaultExpanded: true,
    });
    expect(opts[0].children).toEqual([
      { label: "Chat 1", value: "c-1" },
      { label: "Chat 2", value: "c-2" },
    ]);
    expect(opts[1]).toMatchObject({
      label: "Backend",
      value: "ws-2",
      defaultExpanded: false,
    });
    expect(opts[1].children).toEqual([{ label: "Chat 3", value: "c-3" }]);
  });

  it("passes emptyMessage='No workspaces' to CodemanSidebar", () => {
    render(() => <ChatSidebar />);
    expect(F.capturedProps?.emptyMessage).toBe("No workspaces");
  });

  it("first workspace has defaultExpanded=true; second false", () => {
    render(() => <ChatSidebar />);
    expect(F.capturedProps!.options[0].defaultExpanded).toBe(true);
    expect(F.capturedProps!.options[1].defaultExpanded).toBe(false);
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

  it("onItemSelect navigates to /conversation/{value}", () => {
    render(() => <ChatSidebar />);
    F.capturedProps!.onItemSelect!("c-1");
    expect(F.mockNavigate).toHaveBeenCalledWith({ to: "/conversation/c-1" });
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
});