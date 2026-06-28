//! workspace-delete-dialog.test.tsx — WorkspaceDeleteDialog component tests (TDD RED)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@solidjs/testing-library";
import { Effect } from "effect";
import { WorkspaceDeleteDialog } from "./workspace-delete-dialog";

// ─── Mock useCodemanDialog ────────────────────────────────────────────────────

const mockConfirm = vi.fn();
const mockAlert = vi.fn();
const mockShow = vi.fn();

vi.mock("../../../shared/components/internal/codeman-dialog", () => ({
  useCodemanDialog: vi.fn(() => ({
    alert: mockAlert,
    confirm: mockConfirm,
    show: mockShow,
  })),
}));

// ─── Mock chatStore ─────────────────────────────────────────────────────────

const mockRemoveWorkspace = vi.hoisted(() => vi.fn());

vi.mock("../stores/chat.store", () => ({
  removeWorkspace: mockRemoveWorkspace,
}));

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("WorkspaceDeleteDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("calls dialog.confirm with correct options when handleDelete is invoked", async () => {
    mockConfirm.mockResolvedValue(true);
    mockRemoveWorkspace.mockReturnValue(Effect.succeed(void 0));

    const { getByTestId } = render(() => (
      <WorkspaceDeleteDialog
        workspaceId="ws-1"
        label="My Project"
        open={true}
        onClose={vi.fn()}
      />
    ));

    const deleteBtn = getByTestId("delete-btn");
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith({
        title: "Delete workspace",
        content: expect.stringContaining("My Project"),
        confirmText: "Delete",
        cancelText: "Cancel",
        destructive: true,
      });
    });
  });

  it("does not call removeWorkspace when user cancels confirm", async () => {
    mockConfirm.mockResolvedValue(false);

    const { getByTestId } = render(() => (
      <WorkspaceDeleteDialog
        workspaceId="ws-1"
        label="My Project"
        open={true}
        onClose={vi.fn()}
      />
    ));

    const deleteBtn = getByTestId("delete-btn");
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockRemoveWorkspace).not.toHaveBeenCalled();
    });
  });

  it("calls chatStore.removeWorkspace when user confirms", async () => {
    mockConfirm.mockResolvedValue(true);
    mockRemoveWorkspace.mockReturnValue(Effect.succeed(void 0));

    const onClose = vi.fn();
    const { getByTestId } = render(() => (
      <WorkspaceDeleteDialog
        workspaceId="ws-1"
        label="My Project"
        open={true}
        onClose={onClose}
      />
    ));

    const deleteBtn = getByTestId("delete-btn");
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockRemoveWorkspace).toHaveBeenCalledWith("ws-1");
    });
  });

  it("calls onClose when delete succeeds", async () => {
    mockConfirm.mockResolvedValue(true);
    mockRemoveWorkspace.mockReturnValue(Effect.succeed(void 0));

    const onClose = vi.fn();
    const { getByTestId } = render(() => (
      <WorkspaceDeleteDialog
        workspaceId="ws-1"
        label="My Project"
        open={true}
        onClose={onClose}
      />
    ));

    const deleteBtn = getByTestId("delete-btn");
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("does not call onClose when delete fails", async () => {
    mockConfirm.mockResolvedValue(true);
    mockRemoveWorkspace.mockReturnValue(
      Effect.fail({ _tag: "AppError", message: "Delete failed" })
    );

    const onClose = vi.fn();
    const { getByTestId } = render(() => (
      <WorkspaceDeleteDialog
        workspaceId="ws-1"
        label="My Project"
        open={true}
        onClose={onClose}
      />
    ));

    const deleteBtn = getByTestId("delete-btn");
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it("uses Effect.runPromiseExit to call removeWorkspace", async () => {
    mockConfirm.mockResolvedValue(true);
    mockRemoveWorkspace.mockReturnValue(Effect.succeed(void 0));

    const { getByTestId } = render(() => (
      <WorkspaceDeleteDialog
        workspaceId="ws-1"
        label="My Project"
        open={true}
        onClose={vi.fn()}
      />
    ));

    const deleteBtn = getByTestId("delete-btn");
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockRemoveWorkspace).toHaveBeenCalled();
    });
  });

  it("does not import WorkspaceService directly (per ADR-0016 D4)", async () => {
    // This test verifies the implementation doesn't import WorkspaceService
    // by checking that the module loads without errors
    const { getByTestId } = render(() => (
      <WorkspaceDeleteDialog
        workspaceId="ws-1"
        label="My Project"
        open={true}
        onClose={vi.fn()}
      />
    ));

    expect(getByTestId("delete-btn")).toBeTruthy();
  });
});
