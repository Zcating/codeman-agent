
import { cleanup, fireEvent, render, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RowActions, RowActionsProps } from "@codeman-frontend/features/chat/components/row-actions";

const mockConfirm = vi.hoisted(() => vi.fn());
vi.mock("@codeman-frontend/shared/components/internal/codeman-dialog", () => ({
  Dialog: { confirm: mockConfirm },
}));

function renderRowActions(props: Partial<RowActionsProps> & { kind: "workspace" | "conv"; id: string; label: string }) {
  return render(() => (
    <RowActions
      kind={props.kind}
      id={props.id}
      label={props.label}
      isAgentActive={props.isAgentActive}
      onDelete={props.onDelete ?? vi.fn()}
      onRename={props.onRename ?? vi.fn()}
    />
  ));
}

const triggerSelector = "[aria-label='更多操作']";
const renameItemSelector = "[data-testid='row-action-rename']";
const deleteItemSelector = "[data-testid='row-action-delete']";

/** 点击「...」打开菜单 */
async function openMenu(): Promise<void> {
  const user = userEvent.setup();
  await user.click(document.querySelector(triggerSelector) as HTMLElement);
}

/** 打开菜单并点击「重命名」菜单项 */
async function clickRenameMenuItem(): Promise<void> {
  await openMenu();
  const user = userEvent.setup();
  await user.click(document.querySelector(renameItemSelector) as HTMLElement);
}

beforeEach(() => {
  mockConfirm.mockReset();
});

afterEach(() => cleanup());

describe("RowActions idle state", () => {
  it("workspace: renders label text", () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "My Workspace" });
    expect(container.querySelector("[class*='truncate']")?.textContent).toBe("My Workspace");
  });

  it("workspace: renders more-actions trigger with aria-label='更多操作'", () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "My Workspace" });
    const trigger = container.querySelector(triggerSelector);
    expect(trigger).toBeTruthy();
  });

  it("conv: renders label text", () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Chat 1" });
    expect(container.querySelector("[class*='truncate']")?.textContent).toBe("Chat 1");
  });

  it("conv: renders more-actions trigger", () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Chat 1" });
    expect(container.querySelector(triggerSelector)).toBeTruthy();
  });

  it("workspace: hover-reveal — trigger opacity-0 by default", () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "WS" });
    const trigger = container.querySelector(triggerSelector) as HTMLElement;
    expect(trigger.className).toContain("opacity-0");
  });

  it("workspace: hover-reveal — trigger visible via group-hover/row", () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "WS" });
    const trigger = container.querySelector(triggerSelector) as HTMLElement;
    expect(trigger.className).toContain("group-hover/row:opacity-100");
  });

  it("workspace: menu open keeps trigger visible via aria-expanded", () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "WS" });
    const trigger = container.querySelector(triggerSelector) as HTMLElement;
    expect(trigger.className).toContain("aria-expanded:opacity-100");
  });
});

describe("RowActions idle + isAgentActive", () => {
  it("conv: renders Loader2 spinner with aria-label='streaming' when isAgentActive=true", () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Chat 1", isAgentActive: true });
    const spinner = container.querySelector("[aria-label='streaming']");
    expect(spinner).toBeTruthy();
  });

  it("conv: does NOT render spinner when isAgentActive=false (default)", () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Chat 1" });
    const spinner = container.querySelector("[aria-label='streaming']");
    expect(spinner).toBeNull();
  });

  it("workspace: isAgentActive prop is ignored (no spinner)", () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "WS", isAgentActive: true });
    const spinner = container.querySelector("[aria-label='streaming']");
    expect(spinner).toBeNull();
  });
});

describe("RowActions dropdown menu", () => {
  it("opens menu and renders 重命名/删除 items", async () => {
    renderRowActions({ kind: "workspace", id: "ws-1", label: "WS" });
    await openMenu();
    expect(document.querySelector(renameItemSelector)).toBeTruthy();
    expect(document.querySelector(deleteItemSelector)).toBeTruthy();
  });

  it("delete item has destructive variant styling", async () => {
    renderRowActions({ kind: "workspace", id: "ws-1", label: "WS" });
    await openMenu();
    const deleteItem = document.querySelector(deleteItemSelector) as HTMLElement;
    expect(deleteItem.className).toContain("text-destructive");
    expect(deleteItem).toHaveAttribute("data-variant", "destructive");
  });
});

describe("RowActions delete-confirm flow (codemanDialog.confirm)", () => {
  it("workspace: click 删除 → opens confirm dialog with workspace copy", async () => {
    mockConfirm.mockResolvedValue(true);
    renderRowActions({ kind: "workspace", id: "ws-del", label: "My WS" });
    await openMenu();
    const user = userEvent.setup();
    await user.click(document.querySelector(deleteItemSelector) as HTMLElement);
    expect(mockConfirm).toHaveBeenCalledWith({
      title: "删除项目",
      content: "确定要删除「My WS」吗？此操作不可撤销。",
      confirmText: "删除",
      cancelText: "取消",
      destructive: true,
    });
  });

  it("conv: click 删除 → opens confirm dialog with conversation copy", async () => {
    mockConfirm.mockResolvedValue(true);
    renderRowActions({ kind: "conv", id: "c-del", label: "Chat" });
    await openMenu();
    const user = userEvent.setup();
    await user.click(document.querySelector(deleteItemSelector) as HTMLElement);
    expect(mockConfirm).toHaveBeenCalledWith({
      title: "删除对话",
      content: "确定要删除「Chat」吗？此操作不可撤销。",
      confirmText: "删除",
      cancelText: "取消",
      destructive: true,
    });
  });

  it("confirmed=true → calls onDelete(id)", async () => {
    mockConfirm.mockResolvedValue(true);
    const onDelete = vi.fn();
    renderRowActions({ kind: "workspace", id: "ws-del", label: "WS", onDelete });
    await openMenu();
    const user = userEvent.setup();
    await user.click(document.querySelector(deleteItemSelector) as HTMLElement);
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith("ws-del"));
  });

  it("confirmed=false → does NOT call onDelete", async () => {
    mockConfirm.mockResolvedValue(false);
    const onDelete = vi.fn();
    renderRowActions({ kind: "conv", id: "c-1", label: "Chat", onDelete });
    await openMenu();
    const user = userEvent.setup();
    await user.click(document.querySelector(deleteItemSelector) as HTMLElement);
    await waitFor(() => expect(onDelete).not.toHaveBeenCalled());
  });
});

describe("RowActions editing state", () => {
  it("workspace: click 重命名 menu item → input appears with aria-label='Rename input'", async () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "My Workspace" });
    await clickRenameMenuItem();
    const input = container.querySelector("[aria-label='Rename input']");
    expect(input).toBeTruthy();
  });

  it("workspace: input initial value equals label", async () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "My Workspace" });
    await clickRenameMenuItem();
    const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
    expect(input.value).toBe("My Workspace");
  });

  it("workspace: Enter with non-empty trim → calls onRename(id, value.trim()) + returns to idle", async () => {
    const onRename = vi.fn();
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "Old Name", onRename });
    await clickRenameMenuItem();
    const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "New Name" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("ws-1", "New Name");
    expect(container.querySelector("[aria-label='Rename input']")).toBeNull();
  });

  it("workspace: Enter with empty trim → does NOT call onRename + returns to idle", async () => {
    const onRename = vi.fn();
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "Old Name", onRename });
    await clickRenameMenuItem();
    const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).not.toHaveBeenCalled();
    expect(container.querySelector("[aria-label='Rename input']")).toBeNull();
  });

  it("editing: label span is NOT rendered (only input shows)", async () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Chat" });
    await clickRenameMenuItem();
    expect(container.querySelector("[aria-label='Rename input']")).toBeTruthy();
    const labelSpans = Array.from(container.querySelectorAll("span")).filter(
      (s) => s.textContent?.trim() === "Chat" && s.classList.contains("truncate"),
    );
    expect(labelSpans.length).toBe(0);
  });

  it("editing (workspace): label span is NOT rendered (only input shows)", async () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "zcat-blog-cms" });
    await clickRenameMenuItem();
    expect(container.querySelector("[aria-label='Rename input']")).toBeTruthy();
    const labelSpans = Array.from(container.querySelectorAll("span")).filter(
      (s) => s.textContent?.trim() === "zcat-blog-cms" && s.classList.contains("truncate"),
    );
    expect(labelSpans.length).toBe(0);
  });

  it("idle: label span IS rendered (sanity — fix must not break idle state)", () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Chat" });
    const labelSpans = Array.from(container.querySelectorAll("span")).filter(
      (s) => s.textContent?.trim() === "Chat" && s.classList.contains("truncate"),
    );
    expect(labelSpans.length).toBe(1);
    expect(container.querySelector("[aria-label='Rename input']")).toBeNull();
  });

  it("workspace: Escape → does NOT call onRename + returns to idle", async () => {
    const onRename = vi.fn();
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "Old Name", onRename });
    await clickRenameMenuItem();
    const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "Something" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onRename).not.toHaveBeenCalled();
    expect(container.querySelector("[aria-label='Rename input']")).toBeNull();
  });

  it("workspace: blur → does NOT call onRename + returns to idle", async () => {
    const onRename = vi.fn();
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "Old Name", onRename });
    await clickRenameMenuItem();
    const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "Something" } });
    fireEvent.blur(input);
    expect(onRename).not.toHaveBeenCalled();
    expect(container.querySelector("[aria-label='Rename input']")).toBeNull();
  });

  it("conv: click 重命名 menu item → input appears", async () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "My Chat" });
    await clickRenameMenuItem();
    const input = container.querySelector("[aria-label='Rename input']");
    expect(input).toBeTruthy();
  });

  it("conv: input initial value equals label", async () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "My Chat" });
    await clickRenameMenuItem();
    const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
    expect(input.value).toBe("My Chat");
  });

  it("conv: Enter with non-empty trim → calls onRename(id, value.trim()) + returns to idle", async () => {
    const onRename = vi.fn();
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Old Chat", onRename });
    await clickRenameMenuItem();
    const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "New Chat" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("c-1", "New Chat");
    expect(container.querySelector("[aria-label='Rename input']")).toBeNull();
  });

  it("conv: Enter with empty trim → does NOT call onRename + returns to idle", async () => {
    const onRename = vi.fn();
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Old Chat", onRename });
    await clickRenameMenuItem();
    const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).not.toHaveBeenCalled();
    expect(container.querySelector("[aria-label='Rename input']")).toBeNull();
  });

  it("conv: Escape → does NOT call onRename + returns to idle", async () => {
    const onRename = vi.fn();
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Old Chat", onRename });
    await clickRenameMenuItem();
    const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "New Chat" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onRename).not.toHaveBeenCalled();
    expect(container.querySelector("[aria-label='Rename input']")).toBeNull();
  });

  it("conv: blur → does NOT call onRename + returns to idle", async () => {
    const onRename = vi.fn();
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Old Chat", onRename });
    await clickRenameMenuItem();
    const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "New Chat" } });
    fireEvent.blur(input);
    expect(onRename).not.toHaveBeenCalled();
    expect(container.querySelector("[aria-label='Rename input']")).toBeNull();
  });

  it("input has maxLength=80", async () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "WS" });
    await clickRenameMenuItem();
    const input = container.querySelector("[aria-label='Rename input']") as HTMLInputElement;
    expect(input.maxLength).toBe(80);
  });

  it("input focuses and selects all on mount", async () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "Select Me" });
    await clickRenameMenuItem();
    const input = await waitFor(() => {
      const el = container.querySelector("[aria-label='Rename input']");
      if (!el) { throw new Error("input not found"); }
      return el as HTMLInputElement;
    });
    expect(input.value).toBe("Select Me");
    expect(input.maxLength).toBe(80);

    // Regression guard: entering rename must put the input into active focus
    // and pre-select the entire label so the user can start typing (or
    // pressing Delete/Backspace) immediately, without a second click.
    // In jsdom the ref callback defers focus via queueMicrotask to avoid a
    // race with the click event's default focus restoration; waitFor polls
    // across the microtask boundary.
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it("conv: entering rename focuses the input and pre-selects the label", async () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "My Chat" });
    await clickRenameMenuItem();
    const input = await waitFor(() => {
      const el = container.querySelector("[aria-label='Rename input']");
      if (!el) { throw new Error("input not found"); }
      return el as HTMLInputElement;
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("My Chat".length);
  });
});

describe("RowActions trigger styling", () => {
  it("trigger keeps hover-reveal classes from the old icon buttons", () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Chat" });
    const trigger = container.querySelector(triggerSelector) as HTMLElement;
    expect(trigger.className).toContain("hover:bg-sidebar-accent");
    expect(trigger.className).toContain("hover:text-sidebar-accent-foreground");
  });
});

describe("RowActions vertical alignment", () => {
  it("idle: outer row div has self-center so it centers within parent flex", () => {
    const { container } = renderRowActions({ kind: "conv", id: "c-1", label: "Chat" });
    const trigger = container.querySelector(triggerSelector) as HTMLElement;
    expect(trigger.parentElement).toBeTruthy();
    expect((trigger.parentElement as HTMLElement).className).toContain("self-center");
  });

  it("workspace: outer row div also has self-center", () => {
    const { container } = renderRowActions({ kind: "workspace", id: "ws-1", label: "WS" });
    const trigger = container.querySelector(triggerSelector) as HTMLElement;
    expect((trigger.parentElement as HTMLElement).className).toContain("self-center");
  });
});
