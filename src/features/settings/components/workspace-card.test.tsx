//! WorkspaceCard component tests.
//! Tests rendering, toggle, path input, browse button, and delete.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@solidjs/testing-library";
import { WorkspaceCard } from "./workspace-card";
import type { Workspace } from "../../../shared/lib/types";

const mockWorkspace: Workspace = {
  id: "ws-001",
  label: "My Project",
  root_path: "C:\\Projects\\my-project",
  enabled: true,
};

describe("WorkspaceCard", () => {
  let onUpdate: ReturnType<typeof vi.fn>;
  let onRemove: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onUpdate = vi.fn();
    onRemove = vi.fn();
    cleanup();
    vi.clearAllMocks();
  });

  it("renders all controls with provided workspace", () => {
    render(() => (
      <WorkspaceCard
        workspace={mockWorkspace}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />
    ));

    // Label visible
    expect(screen.getByText("My Project")).toBeInTheDocument();
    // Enabled toggle present
    const checkbox = screen.queryByRole("checkbox");
    expect(checkbox).toBeTruthy();
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    // ID visible
    expect(screen.getByText("ws-001")).toBeInTheDocument();
    // Root path visible
    expect(screen.getByDisplayValue("C:\\Projects\\my-project")).toBeInTheDocument();
    // Browse button present
    expect(screen.getByText("Browse…")).toBeInTheDocument();
    // Delete button present
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("renders disabled workspace correctly", () => {
    const disabled: Workspace = { ...mockWorkspace, enabled: false };
    render(() => (
      <WorkspaceCard workspace={disabled} onUpdate={onUpdate} onRemove={onRemove} />
    ));

    const checkbox = screen.queryByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });

  it("calls onUpdate with enabled=false when toggle is unchecked", () => {
    render(() => (
      <WorkspaceCard
        workspace={{ ...mockWorkspace, enabled: true }}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />
    ));

    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    checkbox.click();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ enabled: false });
  });

  it("calls onUpdate with enabled=true when toggle is checked", () => {
    render(() => (
      <WorkspaceCard
        workspace={{ ...mockWorkspace, enabled: false }}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />
    ));

    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    checkbox.click();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ enabled: true });
  });

  it("calls onRemove when delete button is clicked", () => {
    render(() => (
      <WorkspaceCard
        workspace={mockWorkspace}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />
    ));

    screen.getByText("Delete").click();

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("renders with empty root_path", () => {
    const emptyPath: Workspace = { ...mockWorkspace, root_path: "" };
    render(() => (
      <WorkspaceCard workspace={emptyPath} onUpdate={onUpdate} onRemove={onRemove} />
    ));

    // Placeholder text should be shown
    expect(screen.getByPlaceholderText("C:\\path\\to\\workspace")).toBeInTheDocument();
  });
});
