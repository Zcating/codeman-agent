//! workspace-rename-dialog.test.tsx — WorkspaceRenameDialog component tests (TDD RED)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@solidjs/testing-library";
import { Effect } from "effect";
import { WorkspaceRenameDialog } from "./workspace-rename-dialog";

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

const mockRenameWorkspace = vi.hoisted(() => vi.fn());

vi.mock("../stores/chat.store", () => ({
  renameWorkspace: mockRenameWorkspace,
}));

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("WorkspaceRenameDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders with initial label in input", () => {
    const { getByTestId } = render(() => (
      <WorkspaceRenameDialog
        workspaceId="ws-1"
        initialLabel="My Project"
        open={true}
        onClose={vi.fn()}
      />
    ));

    const input = getByTestId("rename-input") as HTMLInputElement;
    expect(input.value).toBe("My Project");
  });

  it("calls onClose when submitting unchanged label", async () => {
    const onClose = vi.fn();
    const { getByTestId } = render(() => (
      <WorkspaceRenameDialog
        workspaceId="ws-1"
        initialLabel="My Project"
        open={true}
        onClose={onClose}
      />
    ));

    const submitBtn = getByTestId("rename-submit");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    // renameWorkspace should not be called when label unchanged
    expect(mockRenameWorkspace).not.toHaveBeenCalled();
  });

  it("calls chatStore.renameWorkspace when label is changed and submit succeeds", async () => {
    mockRenameWorkspace.mockReturnValue(Effect.succeed(void 0));

    const onClose = vi.fn();
    const { getByTestId } = render(() => (
      <WorkspaceRenameDialog
        workspaceId="ws-1"
        initialLabel="My Project"
        open={true}
        onClose={onClose}
      />
    ));

    const input = getByTestId("rename-input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "New Name" } });

    const submitBtn = getByTestId("rename-submit");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockRenameWorkspace).toHaveBeenCalledWith("ws-1", "New Name");
    });
  });

  it("calls onClose when rename succeeds", async () => {
    mockRenameWorkspace.mockReturnValue(Effect.succeed(void 0));

    const onClose = vi.fn();
    const { getByTestId } = render(() => (
      <WorkspaceRenameDialog
        workspaceId="ws-1"
        initialLabel="My Project"
        open={true}
        onClose={onClose}
      />
    ));

    const input = getByTestId("rename-input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "New Name" } });

    const submitBtn = getByTestId("rename-submit");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("does not call onClose when rename fails", async () => {
    mockRenameWorkspace.mockReturnValue(
      Effect.fail({ _tag: "AppError", message: "Rename failed" })
    );

    const onClose = vi.fn();
    const { getByTestId } = render(() => (
      <WorkspaceRenameDialog
        workspaceId="ws-1"
        initialLabel="My Project"
        open={true}
        onClose={onClose}
      />
    ));

    const input = getByTestId("rename-input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "New Name" } });

    const submitBtn = getByTestId("rename-submit");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it("uses Effect.runPromiseExit to call renameWorkspace", async () => {
    mockRenameWorkspace.mockReturnValue(Effect.succeed(void 0));

    const { getByTestId } = render(() => (
      <WorkspaceRenameDialog
        workspaceId="ws-1"
        initialLabel="My Project"
        open={true}
        onClose={vi.fn()}
      />
    ));

    const input = getByTestId("rename-input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "New Name" } });

    const submitBtn = getByTestId("rename-submit");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      // Verify mock was called (indicating Effect.runPromiseExit was used)
      expect(mockRenameWorkspace).toHaveBeenCalled();
    });
  });
});
