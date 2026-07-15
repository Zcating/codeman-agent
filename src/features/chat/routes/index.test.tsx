//! routes/index.test.tsx — Chat route components tests (V2.2)
//!
 //! Tests the new route structure:
 //! - HomeRoute renders HomeAgentForm
 //! - ConversationRoute renders ChatView with back button
 //! - ChatLayout renders sidebar + outlet + footer

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";
import type { ConversationState } from "../stores/chat.store";
import type { Workspace } from "../../../shared/lib/types";

// ─── Mock @tanstack/solid-router ──────────────────────────────────────────

const mockUseParams = vi.fn((_opts?: any) => () => ({}));
const mockUseNavigate = vi.fn((_opts?: any) => {});

vi.mock("@tanstack/solid-router", () => ({
  Outlet: () => <div data-testid="outlet">Outlet</div>,
  Link: (props: any) => {
    const { activeProps, inactiveProps, ...rest } = props;
    return <a {...rest} {...(props.to ? { href: props.to } : {})}>{props.children}</a>;
  },
  useParams: () => mockUseParams({ from: "/conversation/$convId" }),
  useNavigate: () => mockUseNavigate,
}));

vi.mock("../stores/chat.store", async () => {
  const effect = await vi.importActual<typeof import("effect")>("effect");
  // 每个 mock 返回独立的 Effect，避免 runPromiseExit 重复消费同一实例导致 _op 丢失
  const freshSuccess = () => effect.Effect.succeed(undefined);
  return {
    store: { byId: {} },
    workspaces$: vi.fn<() => Array<{ id: string; label: string; root_path: string }>>(),
    conversations$: vi.fn<() => any[]>(),
    deleteConversation: vi.fn(() => freshSuccess()),
    setSelectedWorkspaceId: vi.fn<(id: string | null) => void>(),
    loadWorkspaces: vi.fn(() => freshSuccess()),
    loadConversations: vi.fn(() => freshSuccess()),
    createConversation: vi.fn(),
    sendMessage: vi.fn(),
    cancel: vi.fn(),
    archiveConversation: vi.fn(),
    setupConvState: vi.fn(),
    renameWorkspace: vi.fn(() => freshSuccess()),
    removeWorkspace: vi.fn(() => freshSuccess()),
    addWorkspace: vi.fn(() => freshSuccess()),
  };
});

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
      <button
        data-testid="sidebar-delete-conv-1"
        onClick={() => props.onDeleteItem?.("conv-1")}
      >
        Delete conv-1
      </button>
      <button
        data-testid="sidebar-rename-ws-1"
        onClick={() => props.onRenameWorkspace?.("ws-1", "My Project")}
      >
        Rename ws-1
      </button>
      <button
        data-testid="sidebar-delete-ws-1"
        onClick={() => props.onDeleteWorkspace?.("ws-1", "My Project")}
      >
        Delete ws-1
      </button>
      <button data-testid="sidebar-back-to-home" onClick={() => props.onCreateItem?.()}>
        New conversation
      </button>
      <span data-testid="sidebar-selected-item">{props.selectedItemId ?? "none"}</span>
    </div>
  ),
  type: {},
}));

// ─── Mock HomeAgentForm ──────────────────────────────────────────────────

vi.mock("../components/home", () => ({
  HomeAgentForm: () => (
    <div data-testid="home-agent-form">HomeAgentForm</div>
  ),
}));

// ─── Mock ChatView ──────────────────────────────────────────────────────

vi.mock("../components/chat-view", () => ({
  ChatView: (props: any) => (
    <div data-testid="chat-view">
      <span data-testid="chat-view-conv-id">{props.convId ?? "none"}</span>
    </div>
  ),
}));

// ─── Mock workspace-rename-dialog ──────────────────────────────────────────

const mockShowRenameDialog = vi.hoisted(() => vi.fn<(...args: string[]) => Promise<string | null>>(async () => null));

vi.mock("../components/workspace-rename-dialog", () => ({
  showRenameDialog: mockShowRenameDialog,
}));

// ─── Mock Dialog ──────────────────────────────────────────────────────────────

const mockDialogConfirm = vi.hoisted(() => vi.fn(async () => false));

vi.mock("../../../shared/components/internal/codeman-dialog", () => ({
  Dialog: {
    confirm: mockDialogConfirm,
    show: vi.fn(),
    alert: vi.fn(),
  },
}));

// ─── Import route components from barrel ────────────────────────────────────

import { HomeRoute } from "./home-route";
import { ConversationRoute } from "./conversation-route";
import { ChatLayout } from "./chat-layout";

// ─── HomeRoute tests ─────────────────────────────────────────────────────

describe("HomeRoute", () => {
  afterEach(() => {
    cleanup();
  });

  it("Renders HomeAgentForm", () => {
    const { getByTestId } = render(() => <HomeRoute />);
    expect(getByTestId("home-agent-form")).toBeTruthy();
  });
});

// ─── ConversationRoute tests ──────────────────────────────────────────────

describe("ConversationRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("Does NOT render the back-to-home button (Q1: removed)", () => {
    // Mock useParams to return a convId (useParams returns an Accessor)
    mockUseParams.mockReturnValue(() => ({ convId: "test-conv-id" }));

    const { queryByTestId, getByTestId } = render(() => <ConversationRoute />);

    expect(queryByTestId("back-to-home")).toBeNull();
    expect(getByTestId("chat-view")).toBeTruthy();
    expect(getByTestId("chat-view-conv-id").textContent).toBe("test-conv-id");
  });
});

// ─── ChatLayout tests ────────────────────────────────────────────────────

describe("ChatLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("Calls loadConversations on mount (regression: H1 bug)", async () => {
    const { loadConversations, workspaces$ } = await import("../stores/chat.store") as any;
    workspaces$.mockReturnValue([
      { id: "ws-1", label: "My Project", root_path: "C:\\projects" },
    ]);

    render(() => <ChatLayout />);

    await vi.waitFor(() => {
      expect(loadConversations).toHaveBeenCalled();
    });
  });

  it("Renders sidebar when workspaces exist", async () => {
    const { workspaces$ } = await import("../stores/chat.store") as any;
    workspaces$.mockReturnValue([
      { id: "ws-1", label: "My Project", root_path: "C:\\projects" },
    ]);

    const { getByTestId } = render(() => <ChatLayout />);
    expect(getByTestId("codeman-sidebar")).toBeTruthy();
  });

  it("Renders footer with settings link", () => {
    const { getByText } = render(() => <ChatLayout />);
    expect(getByText("codeman-agent")).toBeTruthy();
    expect(getByText("设置")).toBeTruthy();
  });

  it("Renders outlet for child routes", () => {
    const { getByTestId } = render(() => <ChatLayout />);
    expect(getByTestId("outlet")).toBeTruthy();
  });

  it("Renders sidebar even when no workspaces (always-show)", async () => {
    const { workspaces$ } = await import("../stores/chat.store") as any;
    workspaces$.mockReturnValue([]);

    const { queryByTestId } = render(() => <ChatLayout />);
    expect(queryByTestId("codeman-sidebar")).not.toBeNull();
  });

  it("Highlights selected item from params", async () => {
    const { workspaces$ } = await import("../stores/chat.store") as any;
    workspaces$.mockReturnValue([
      { id: "ws-1", label: "My Project", root_path: "C:\\projects" },
    ]);
    const { conversations$ } = await import("../stores/chat.store") as any;
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

    // Mock useParams to return selected convId (useParams returns an Accessor)
    mockUseParams.mockReturnValue(() => ({ convId: "conv-1" }));

    const { getByTestId } = render(() => <ChatLayout />);
    expect(getByTestId("sidebar-selected-item").textContent).toBe("conv-1");
  });

  it("Click empty workspace → setSelectedWorkspaceId called", async () => {
    const { workspaces$, setSelectedWorkspaceId } = await import("../stores/chat.store") as any;
    workspaces$.mockReturnValue([
      { id: "ws-1", label: "My Project", root_path: "C:\\projects" },
    ]);

    const { getByTestId } = render(() => <ChatLayout />);
    getByTestId("sidebar-ws-ws-1").click();
    expect(setSelectedWorkspaceId).toHaveBeenCalledWith("ws-1");
  });

  it("Click new conversation → navigate to /", async () => {
    const { workspaces$ } = await import("../stores/chat.store") as any;
    workspaces$.mockReturnValue([
      { id: "ws-1", label: "My Project", root_path: "C:\\projects" },
    ]);

    const { getByTestId } = render(() => <ChatLayout />);
    getByTestId("sidebar-back-to-home").click();
    expect(mockUseNavigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("Click sidebar conversation → navigate to /conversation/${id}", async () => {
    const { workspaces$ } = await import("../stores/chat.store") as any;
    workspaces$.mockReturnValue([
      { id: "ws-1", label: "My Project", root_path: "C:\\projects" },
    ]);

    const { getByTestId } = render(() => <ChatLayout />);
    getByTestId("sidebar-item-conv-1").click();
    expect(mockUseNavigate).toHaveBeenCalledWith({ to: "/conversation/conv-1" });
  });

  it("Click rename workspace with same name → no renameWorkspace call", async () => {
    const { workspaces$, renameWorkspace } = await import("../stores/chat.store") as any;
    workspaces$.mockReturnValue([
      { id: "ws-1", label: "My Project", root_path: "C:\\projects" },
    ]);
    mockShowRenameDialog.mockResolvedValue("My Project"); // same name

    const { getByTestId } = render(() => <ChatLayout />);
    getByTestId("sidebar-rename-ws-1").click();
    // Wait for the async rename operation to potentially settle
    await new Promise((r) => setTimeout(r, 50));
    // renameWorkspace should NOT be called (label didn't change)
    expect(renameWorkspace).not.toHaveBeenCalled();
  });

  it("Click rename workspace failed → console.error called", async () => {
    const { workspaces$, renameWorkspace } = await import("../stores/chat.store") as any;
    const effect = await vi.importActual<typeof import("effect")>("effect");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    workspaces$.mockReturnValue([
      { id: "ws-1", label: "My Project", root_path: "C:\\projects" },
    ]);
    renameWorkspace.mockReturnValue(effect.Effect.fail("rename failed"));
    mockShowRenameDialog.mockResolvedValue("New Name");

    const { getByTestId } = render(() => <ChatLayout />);
    getByTestId("sidebar-rename-ws-1").click();

    // Wait for console.error to be called (async rename)
    await vi.waitFor(() => {
      // Exit.fail produces a Cause (Fail) object — just verify the prefix
      const calls = consoleSpy.mock.calls.filter(c => c[0] === "[ERROR] [chat-layout] rename failed:");
      expect(calls.length).toBeGreaterThanOrEqual(1);
    }, { timeout: 2_000 });
    consoleSpy.mockRestore();
  });

  it("Click delete workspace confirmed with error → console.error", async () => {
    const { workspaces$, removeWorkspace } = await import("../stores/chat.store") as any;
    const effect = await vi.importActual<typeof import("effect")>("effect");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    workspaces$.mockReturnValue([
      { id: "ws-1", label: "My Project", root_path: "C:\\projects" },
    ]);
    removeWorkspace.mockReturnValue(effect.Effect.fail("delete failed"));
    mockDialogConfirm.mockResolvedValue(true);

    const { getByTestId } = render(() => <ChatLayout />);
    getByTestId("sidebar-delete-ws-1").click();

    // Wait for console.error to be called (async delete)
    await vi.waitFor(() => {
      const calls = consoleSpy.mock.calls.filter(c => c[0] === "[ERROR] [chat-layout] delete failed:");
      expect(calls.length).toBeGreaterThanOrEqual(1);
    }, { timeout: 2_000 });
    consoleSpy.mockRestore();
  });

  it("Click delete conversation → deleteConversation called", async () => {
    const { deleteConversation } = await import("../stores/chat.store") as any;
    const { workspaces$ } = await import("../stores/chat.store") as any;
    workspaces$.mockReturnValue([
      { id: "ws-1", label: "My Project", root_path: "C:\\projects" },
    ]);

    const { getByTestId } = render(() => <ChatLayout />);
    getByTestId("sidebar-delete-conv-1").click();
    expect(deleteConversation).toHaveBeenCalledWith("conv-1");
  });

  it("Click rename workspace → showRenameDialog called", async () => {
    const { workspaces$ } = await import("../stores/chat.store") as any;
    workspaces$.mockReturnValue([
      { id: "ws-1", label: "My Project", root_path: "C:\\projects" },
    ]);
    mockShowRenameDialog.mockResolvedValue("New Name");

    const { getByTestId } = render(() => <ChatLayout />);
    getByTestId("sidebar-rename-ws-1").click();
    // Allow the async handler to settle
    await vi.waitFor(() => {
      expect(mockShowRenameDialog).toHaveBeenCalledWith("My Project");
    });
  });

  it("Click rename workspace with new name → renameWorkspace called", async () => {
    const { workspaces$, renameWorkspace } = await import("../stores/chat.store") as any;
    workspaces$.mockReturnValue([
      { id: "ws-1", label: "My Project", root_path: "C:\\projects" },
    ]);
    mockShowRenameDialog.mockResolvedValue("Updated Name");

    const { getByTestId } = render(() => <ChatLayout />);
    getByTestId("sidebar-rename-ws-1").click();

    await vi.waitFor(() => {
      expect(renameWorkspace).toHaveBeenCalledWith("ws-1", "Updated Name");
    });
  });

  it("Click delete workspace → Dialog.confirm called", async () => {
    const { workspaces$ } = await import("../stores/chat.store") as any;
    workspaces$.mockReturnValue([
      { id: "ws-1", label: "My Project", root_path: "C:\\projects" },
    ]);
    mockDialogConfirm.mockResolvedValue(false);

    const { getByTestId } = render(() => <ChatLayout />);
    getByTestId("sidebar-delete-ws-1").click();

    await vi.waitFor(() => {
      expect(mockDialogConfirm).toHaveBeenCalled();
    });
  });

  it("Click delete workspace confirmed → removeWorkspace called", async () => {
    const { workspaces$, removeWorkspace } = await import("../stores/chat.store") as any;
    workspaces$.mockReturnValue([
      { id: "ws-1", label: "My Project", root_path: "C:\\projects" },
    ]);
    mockDialogConfirm.mockResolvedValue(true);

    const { getByTestId } = render(() => <ChatLayout />);
    getByTestId("sidebar-delete-ws-1").click();

    await vi.waitFor(() => {
      expect(removeWorkspace).toHaveBeenCalledWith("ws-1");
    });
  });

  // ─── 回归测试：删除当前 conversation 所属 workspace 成功后跳转首页 ───────

  it("删除当前conversation所属workspace成功 → 跳转首页（回归）", async () => {
    // vi.mock replaces the module; TypeScript sees the real module type but the mock
    // returns void and uses snake_case vs the real type's camelCase. Using
    // `as unknown as` (not `as any`) preserves type safety for derived variables
    // — the target type propagates to all downstream uses.
    // ReturnType captures the mock's callable + .mockReturnValue method signature.
    const typedStore = await import("../stores/chat.store") as unknown as {
      workspaces$: ReturnType<typeof vi.fn<() => Workspace[]>>;
      removeWorkspace: ReturnType<typeof vi.fn<(id: string) => { pipe: () => unknown }>>;
      store: { byId: Record<string, ConversationState> };
    };
    const { workspaces$, removeWorkspace, store } = typedStore;
    const effect = await vi.importActual<typeof import("effect")>("effect");

    workspaces$.mockReturnValue([
      { id: "ws-1", label: "My Project", rootPath: "C:\\projects", createdAt: Date.now() / 1000 },
    ]);

    // 注入 conversation fixture：conv-1 属于 ws-1
    // AgentRuntime.run returns Stream.Stream; we provide a minimal mock with pipe and iterator.
    const mockStream = {
      pipe: () => mockStream,
      [Symbol.iterator]: () => ({ next: () => ({ done: true, value: undefined }) }),
    };
    store.byId = {
      "conv-1": {
        id: "conv-1",
        title: "Test Chat",
        systemPrompt: null,
        workspaceId: "ws-1",
        createdAt: Date.now() / 1000,
        updatedAt: Date.now() / 1000,
        archivedAt: null,
        messages: [],
        streamingMessageId: null,
        lastError: null,
        runtime: {
          run: () => mockStream as unknown as import("effect").Stream.Stream<import("../lib/runtime").RuntimeEvent, never, never>,
          cancel: () => {},
        },
      },
    };

    // 当前 URL 为 /conversation/conv-1
    mockUseParams.mockReturnValue(() => ({ convId: "conv-1" }));
    mockDialogConfirm.mockResolvedValue(true);
    removeWorkspace.mockReturnValue(effect.Effect.succeed(undefined));

    const { getByTestId } = render(() => <ChatLayout />);
    getByTestId("sidebar-delete-ws-1").click();

    await vi.waitFor(() => {
      expect(mockUseNavigate).toHaveBeenCalledWith({ to: "/" });
    });
  });
});
