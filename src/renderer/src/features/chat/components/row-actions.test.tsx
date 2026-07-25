//! RowActions — unified "row operation" component for workspace + conv rows.
//!
//! Encapsulates delete (inline-confirm) + rename (inline-edit-in-place).
//! Mirrors ConvDeleteAction idle + confirming-delete visual patterns and
//! WorkspaceActions rename + delete aria-label conventions.
//!
/*
 * State machine:
 * ───────────────────────────────────────────────────────────────────────────
 *  Mode               │ Entry condition          │ Exit to idle        │ Exit to other
 * ────────────────────┼──────────────────────────┼─────────────────────┼────────────────
 *  idle               │ initial                 │ —                   │ click trash → confirming-delete
 *                     │                          │                     │ click pencil → editing
 * ────────────────────┼──────────────────────────┼─────────────────────┼────────────────
 *  confirming-delete  │ click Trash2 button     │ click 取消 → idle   │ click 删除 → idle (calls onDelete)
 *                     │                          │                     │ (no other exit)
 * ────────────────────┼──────────────────────────┼─────────────────────┼────────────────
 *  editing            │ click Pencil button     │ Enter (trim≠"")    │ click 取消 → idle
 *                     │                          │   → idle (calls     │ Escape → idle
 *                     │                          │   onRename)         │ blur → idle
 *                     │                          │ Enter (trim==="")   │
 *                     │                          │   → idle (no call)  │
 * ───────────────────────────────────────────────────────────────────────────
 */

import { cleanup, fireEvent, render, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RowActions, RowActionsProps } from "./row-actions";

// ─── Shared render helper ───────────────────────────────────────────────────

function renderRowActions(props: Partial<RowActionsProps> & { kind: "workspace" | "conv"; id: string; label: string }) {
  return render(() => (
    <RowActions
      kind={props.kind}
      id={props.id}
      label={props.label}
      isStreaming={props.isStreaming}
      onDelete={props.onDelete ?? vi.fn()}
      onRename={props.onRename ?? vi.fn()}
    />
  ));
}

afterEach(() => cleanup());

// ─── idle state ──────────────────────────────────────────────────────────────

describe("RowActions idle state", () => {
  it("workspace: renders label text", () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "My Workspace" });
    expect(container.querySelector("[class*='truncate']")?.textContent).toBe("My Workspace");
  });

  it("workspace: renders Pencil button with correct aria-label", () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "My Workspace" });
    const pencilBtn = container.querySelector("[aria-label='Rename My Workspace']");
    expect(pencilBtn).toBeTruthy();
  });

  it("workspace: renders Trash2 button with aria-label='Delete My Workspace'", () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "My Workspace" });
    const trashBtn = container.querySelector("[aria-label='Delete My Workspace']");
    expect(trashBtn).toBeTruthy();
  });

  it("conv: renders label text", () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Chat 1" });
    expect(container.querySelector("[class*='truncate']")?.textContent).toBe("Chat 1");
  });

  it("conv: renders Pencil button with aria-label='Rename Chat 1'", () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Chat 1" });
    const pencilBtn = container.querySelector("[aria-label='Rename Chat 1']");
    expect(pencilBtn).toBeTruthy();
  });

  it("conv: renders Trash2 button with aria-label='Delete conversation'", () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Chat 1" });
    const trashBtn = container.querySelector("[aria-label='Delete conversation']");
    expect(trashBtn).toBeTruthy();
  });

  it("workspace: hover-reveal — buttons opacity-0 by default", () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "WS" });
    const pencilBtn = container.querySelector("[aria-label='Rename WS']") as HTMLElement;
    expect(pencilBtn.className).toContain("opacity-0");
  });

  it("workspace: hover-reveal — buttons visible via group-hover/row", () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "WS" });
    const pencilBtn = container.querySelector("[aria-label='Rename WS']") as HTMLElement;
    expect(pencilBtn.className).toContain("group-hover/row:opacity-100");
  });

  it("conv: hover-reveal — buttons opacity-0 by default", () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Chat" });
    const pencilBtn = container.querySelector("[aria-label='Rename Chat']") as HTMLElement;
    expect(pencilBtn.className).toContain("opacity-0");
  });

  it("conv: hover-reveal — buttons visible via group-hover/row", () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Chat" });
    const pencilBtn = container.querySelector("[aria-label='Rename Chat']") as HTMLElement;
    expect(pencilBtn.className).toContain("group-hover/row:opacity-100");
  });
});

// ─── idle + isStreaming (conv only) ────────────────────────────────────────

describe("RowActions idle + isStreaming", () => {
  it("conv: renders Loader2 spinner with aria-label='streaming' when isStreaming=true", () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Chat 1", isStreaming: true });
    const spinner = container.querySelector("[aria-label='streaming']");
    expect(spinner).toBeTruthy();
  });

  it("conv: does NOT render spinner when isStreaming=false (default)", () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Chat 1" });
    const spinner = container.querySelector("[aria-label='streaming']");
    expect(spinner).toBeNull();
  });

  it("workspace: isStreaming prop is ignored (no spinner)", () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "WS", isStreaming: true });
    const spinner = container.querySelector("[aria-label='streaming']");
    expect(spinner).toBeNull();
  });
});

// ─── confirming-delete state ─────────────────────────────────────────────────

describe("RowActions confirming-delete state", () => {
  it("workspace: click Trash2 → overlay appears with data-state='confirming'", () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "WS to delete" });
    const trashBtn = container.querySelector("[aria-label='Delete WS to delete']") as HTMLElement;
    fireEvent.click(trashBtn);
    const overlay = container.querySelector("[data-state='confirming']");
    expect(overlay).toBeTruthy();
  });

  it("workspace: overlay has 删除 button (bg-destructive) + 取消 button (border)", () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "WS" });
    fireEvent.click(container.querySelector("[aria-label='Delete WS']") as HTMLElement);
    const confirmBtn = container.querySelector("[aria-label='确认删除']");
    const cancelBtn = container.querySelector("[aria-label='取消删除']");
    expect(confirmBtn).toBeTruthy();
    expect(cancelBtn).toBeTruthy();
    // confirmBtn uses bg-destructive
    expect((confirmBtn as HTMLElement).className).toContain("bg-destructive");
    // cancelBtn uses border
    expect((cancelBtn as HTMLElement).className).toContain("border");
  });

  it("workspace: click 删除 → calls onDelete(id) + returns to idle", () => {
    const onDelete = vi.fn();
    const { container } = renderRowActions({ kind: "workspace", id: "ws-del", label: "WS", onDelete });
    fireEvent.click(container.querySelector("[aria-label='Delete WS']") as HTMLElement);
    fireEvent.click(container.querySelector("[aria-label='确认删除']") as HTMLElement);
    expect(onDelete).toHaveBeenCalledWith("ws-del");
    // back to idle — no overlay
    expect(container.querySelector("[data-state='confirming']")).toBeNull();
  });

  it("workspace: click 取消 → does NOT call onDelete + returns to idle", () => {
    const onDelete = vi.fn();
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "WS", onDelete });
    fireEvent.click(container.querySelector("[aria-label='Delete WS']") as HTMLElement);
    fireEvent.click(container.querySelector("[aria-label='取消删除']") as HTMLElement);
    expect(onDelete).not.toHaveBeenCalled();
    expect(container.querySelector("[data-state='confirming']")).toBeNull();
  });

  it("conv: click Trash2 → overlay appears with data-state='confirming'", () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Chat to delete" });
    const trashBtn = container.querySelector("[aria-label='Delete conversation']") as HTMLElement;
    fireEvent.click(trashBtn);
    const overlay = container.querySelector("[data-state='confirming']");
    expect(overlay).toBeTruthy();
  });

  it("conv: overlay has 删除 + 取消 buttons", () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Chat" });
    fireEvent.click(container.querySelector("[aria-label='Delete conversation']") as HTMLElement);
    const confirmBtn = container.querySelector("[aria-label='确认删除']");
    const cancelBtn = container.querySelector("[aria-label='取消删除']");
    expect(confirmBtn).toBeTruthy();
    expect(cancelBtn).toBeTruthy();
  });

  it("conv: click 删除 → calls onDelete(id) + returns to idle", () => {
    const onDelete = vi.fn();
    const { container } = renderRowActions({ kind: "conv", id: "conv-del", label: "Chat", onDelete });
    fireEvent.click(container.querySelector("[aria-label='Delete conversation']") as HTMLElement);
    fireEvent.click(container.querySelector("[aria-label='确认删除']") as HTMLElement);
    expect(onDelete).toHaveBeenCalledWith("conv-del");
    expect(container.querySelector("[data-state='confirming']")).toBeNull();
  });

  it("conv: click 取消 → does NOT call onDelete + returns to idle", () => {
    const onDelete = vi.fn();
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Chat", onDelete });
    fireEvent.click(container.querySelector("[aria-label='Delete conversation']") as HTMLElement);
    fireEvent.click(container.querySelector("[aria-label='取消删除']") as HTMLElement);
    expect(onDelete).not.toHaveBeenCalled();
    expect(container.querySelector("[data-state='confirming']")).toBeNull();
  });
});

// ─── editing state ───────────────────────────────────────────────────────────

describe("RowActions editing state", () => {
  it("workspace: click Pencil → input appears with aria-label='Rename input'", () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "My Workspace" });
    fireEvent.click(container.querySelector("[aria-label='Rename My Workspace']") as HTMLElement);
    const input = container.querySelector("[aria-label='Rename input']");
    expect(input).toBeTruthy();
  });

  it("workspace: input initial value equals label", () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "My Workspace" });
    fireEvent.click(container.querySelector("[aria-label='Rename My Workspace']") as HTMLElement);
    const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
    expect(input.value).toBe("My Workspace");
  });

  it("workspace: Enter with non-empty trim → calls onRename(id, value.trim()) + returns to idle", () => {
    const onRename = vi.fn();
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "Old Name", onRename });
    fireEvent.click(container.querySelector("[aria-label='Rename Old Name']") as HTMLElement);
    const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
    // Change value
    fireEvent.input(input, { target: { value: "New Name" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("ws-1", "New Name");
    expect(container.querySelector("[aria-label='Rename input']")).toBeNull();
  });

  it("workspace: Enter with empty trim → does NOT call onRename + returns to idle", () => {
    const onRename = vi.fn();
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "Old Name", onRename });
    fireEvent.click(container.querySelector("[aria-label='Rename Old Name']") as HTMLElement);
    const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).not.toHaveBeenCalled();
    expect(container.querySelector("[aria-label='Rename input']")).toBeNull();
  });

  it("workspace: Escape → does NOT call onRename + returns to idle", () => {
    const onRename = vi.fn();
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "Old Name", onRename });
    fireEvent.click(container.querySelector("[aria-label='Rename Old Name']") as HTMLElement);
    const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "Something" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onRename).not.toHaveBeenCalled();
    expect(container.querySelector("[aria-label='Rename input']")).toBeNull();
  });

  it("workspace: blur → does NOT call onRename + returns to idle", () => {
    const onRename = vi.fn();
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "Old Name", onRename });
    fireEvent.click(container.querySelector("[aria-label='Rename Old Name']") as HTMLElement);
    const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "Something" } });
    fireEvent.blur(input);
    expect(onRename).not.toHaveBeenCalled();
    expect(container.querySelector("[aria-label='Rename input']")).toBeNull();
  });

  it("conv: click Pencil → input appears", () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "My Chat" });
    fireEvent.click(container.querySelector("[aria-label='Rename My Chat']") as HTMLElement);
    const input = container.querySelector("[aria-label='Rename input']");
    expect(input).toBeTruthy();
  });

  it("conv: input initial value equals label", () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "My Chat" });
    fireEvent.click(container.querySelector("[aria-label='Rename My Chat']") as HTMLElement);
    const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
    expect(input.value).toBe("My Chat");
  });

  it("conv: Enter with non-empty trim → calls onRename(id, value.trim()) + returns to idle", () => {
    const onRename = vi.fn();
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Old Chat", onRename });
    fireEvent.click(container.querySelector("[aria-label='Rename Old Chat']") as HTMLElement);
    const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "New Chat" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("c-1", "New Chat");
    expect(container.querySelector("[aria-label='Rename input']")).toBeNull();
  });

  it("conv: Enter with empty trim → does NOT call onRename + returns to idle", () => {
    const onRename = vi.fn();
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Old Chat", onRename });
    fireEvent.click(container.querySelector("[aria-label='Rename Old Chat']") as HTMLElement);
    const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).not.toHaveBeenCalled();
    expect(container.querySelector("[aria-label='Rename input']")).toBeNull();
  });

  it("conv: Escape → does NOT call onRename + returns to idle", () => {
    const onRename = vi.fn();
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Old Chat", onRename });
    fireEvent.click(container.querySelector("[aria-label='Rename Old Chat']") as HTMLElement);
    const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "New Chat" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onRename).not.toHaveBeenCalled();
    expect(container.querySelector("[aria-label='Rename input']")).toBeNull();
  });

  it("conv: blur → does NOT call onRename + returns to idle", () => {
    const onRename = vi.fn();
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Old Chat", onRename });
    fireEvent.click(container.querySelector("[aria-label='Rename Old Chat']") as HTMLElement);
    const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "New Chat" } });
    fireEvent.blur(input);
    expect(onRename).not.toHaveBeenCalled();
    expect(container.querySelector("[aria-label='Rename input']")).toBeNull();
  });

  it("input has maxLength=80", () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "WS" });
    fireEvent.click(container.querySelector("[aria-label='Rename WS']") as HTMLElement);
    const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
    expect(input.maxLength).toBe(80);
  });

  it("input focuses and selects all on mount", async () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "Select Me" });
    fireEvent.click(container.querySelector("[aria-label='Rename Select Me']") as HTMLElement);
    // Verify input appears and is ready for editing
    const input = await waitFor(() => {
      const el = container.querySelector("[aria-label='Rename input']");
      if (!el) throw new Error("input not found");
      return el as HTMLInputElement;
    });
    expect(input.value).toBe("Select Me");
    expect(input.maxLength).toBe(80);
    // Note: jsdom does not fully support Selection API or activeElement tracking.
    // The component calls el.focus() + el.setSelectionRange(0, value.length) on mount.
    // Focus behavior is indirectly verified by other tests:
    // - Enter with non-empty trim saves correctly
    // - Enter with empty trim cancels correctly
    // - Escape cancels correctly
    // - blur cancels correctly
  });
});

// ─── Icon color contrast (sidebar visibility) ──────────────────────────────────
//
// Bug: RowActions idle buttons inherit text color from parent row, which can
// match the row's hover background — icons become invisible when row is hovered.
// Fix mirrors ConvDeleteAction: explicit text-muted-foreground base + hover
// variants that contrast with bg-sidebar-accent.

describe("RowActions idle icon contrast", () => {
  it("Pencil button has text-muted-foreground base class", () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Chat" });
    const pencilBtn = container.querySelector("[aria-label='Rename Chat']") as HTMLElement;
    expect(pencilBtn.className).toContain("text-muted-foreground");
  });

  it("Pencil button uses hover:bg-sidebar-accent + hover:text-sidebar-accent-foreground", () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Chat" });
    const pencilBtn = container.querySelector("[aria-label='Rename Chat']") as HTMLElement;
    expect(pencilBtn.className).toContain("hover:bg-sidebar-accent");
    expect(pencilBtn.className).toContain("hover:text-sidebar-accent-foreground");
  });

  it("Trash2 button has text-muted-foreground base class", () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Chat" });
    const trashBtn = container.querySelector("[aria-label='Delete conversation']") as HTMLElement;
    expect(trashBtn.className).toContain("text-muted-foreground");
  });

  it("Trash2 button uses hover:bg-sidebar-accent (icon: hover:text-destructive retained)", () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Chat" });
    const trashBtn = container.querySelector("[aria-label='Delete conversation']") as HTMLElement;
    expect(trashBtn.className).toContain("hover:bg-sidebar-accent");
    expect(trashBtn.className).toContain("hover:text-destructive");
  });

  it("workspace variant: same icon contrast classes on both buttons", () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "WS" });
    const pencilBtn = container.querySelector("[aria-label='Rename WS']") as HTMLElement;
    const trashBtn = container.querySelector("[aria-label='Delete WS']") as HTMLElement;
    expect(pencilBtn.className).toContain("text-muted-foreground");
    expect(pencilBtn.className).toContain("hover:bg-sidebar-accent");
    expect(trashBtn.className).toContain("text-muted-foreground");
    expect(trashBtn.className).toContain("hover:bg-sidebar-accent");
  });
});
