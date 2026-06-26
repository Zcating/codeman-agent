//! WorkspaceCard component tests.
//! Tests rendering, toggle, path input, browse button, and delete.

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@solidjs/testing-library";
import { WorkspaceCard } from "./workspace-card";
import { mockState } from "../../../__mocks__/@tauri-apps/api/core";
import type { Workspace } from "../../../shared/lib/types";

// Mock solid-js/store — WorkspaceCard 导入 appStore, appStore 用 createStore。
// jsdom 没有 Solid reactive context,需要这个 mock。
// 必须支持 setStore 的 1-arg 和 2-arg 两种签名。
// **不**在 vitest.setup.ts 全局注册:见 settings.test.tsx 同位置注释。
vi.mock("solid-js/store", () => {
  let store: { value: unknown } = { value: null };
  const setStore = vi.fn((...args: unknown[]) => {
    const updater = args.length === 2 ? args[1] : args[0];
    if (typeof updater === "function") {
      store.value = (updater as (prev: unknown) => unknown)(store.value);
    } else {
      store.value = updater;
    }
  });
  const storeProxy = new Proxy(store, {
    get(t, p) {
      if (p === "value") {
        return store.value;
      }
      return (t as any)[p];
    },
    set(t, p, v) {
      if (p === "value") {
        store.value = v;
        return true;
      }
      (t as any)[p] = v;
      return true;
    },
  });
  return { createStore: () => [storeProxy, setStore] };
});

import { _resetAppStoreForTest } from "../../../shared/stores/app.store";

const mockWorkspace: Workspace = {
  id: "ws-001",
  label: "My Project",
  root_path: "C:\\Projects\\my-project",
  enabled: true,
};

describe("WorkspaceCard", () => {
  let onUpdate: Mock<(patch: Partial<Workspace>) => void>;
  let onRemove: Mock<() => void>;

  beforeEach(() => {
    onUpdate = vi.fn();
    onRemove = vi.fn();
    // Set up mockState.settings.workspaces so handlePathBlur can map over it
    mockState.settings = {
      ...mockState.settings,
      workspaces: [{ ...mockWorkspace }],
    };
    // 重置 appStore,确保 appStore.state.value 不为 null
    _resetAppStoreForTest();
    cleanup();
    vi.clearAllMocks();
  });

  it("renders all controls with provided workspace", () => {
    render(() => (
      <WorkspaceCard workspace={mockWorkspace} onUpdate={onUpdate} onRemove={onRemove} />
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

  it("Browse button contains FolderOpen icon", () => {
    render(() => (
      <WorkspaceCard workspace={mockWorkspace} onUpdate={onUpdate} onRemove={onRemove} />
    ));

    const browseBtn = document.querySelector("[data-testid='workspace-browse']");
    expect(browseBtn).toBeTruthy();
    expect(browseBtn?.querySelector("svg")).toBeTruthy();
  });

  it("renders disabled workspace correctly", () => {
    const disabled: Workspace = { ...mockWorkspace, enabled: false };
    render(() => <WorkspaceCard workspace={disabled} onUpdate={onUpdate} onRemove={onRemove} />);

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
      <WorkspaceCard workspace={mockWorkspace} onUpdate={onUpdate} onRemove={onRemove} />
    ));

    screen.getByText("Delete").click();

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("renders with empty root_path", () => {
    const emptyPath: Workspace = { ...mockWorkspace, root_path: "" };
    render(() => <WorkspaceCard workspace={emptyPath} onUpdate={onUpdate} onRemove={onRemove} />);

    // Placeholder text should be shown
    expect(screen.getByPlaceholderText("C:\\path\\to\\workspace")).toBeInTheDocument();
  });

  // ── Test 7: handlePathBlur no-op 当值未变 ──
  it("handlePathBlur no-op 当值未变", async () => {
    render(() => (
      <WorkspaceCard workspace={mockWorkspace} onUpdate={onUpdate} onRemove={onRemove} />
    ));

    // Blur without changing the input value
    const input = screen.getByDisplayValue("C:\\Projects\\my-project") as HTMLInputElement;
    expect(input).toBeTruthy();

    // Fire blur directly - no change to the input value means early return
    fireEvent.blur(input);

    // onUpdate should NOT have been called since value didn't change
    expect(onUpdate).not.toHaveBeenCalled();
  });

  // ── Test 8: handlePathBlur 写值 当值变 ──
  it("handlePathBlur 写值 when value changes", async () => {
    render(() => (
      <WorkspaceCard workspace={mockWorkspace} onUpdate={onUpdate} onRemove={onRemove} />
    ));

    const input = screen.getByDisplayValue("C:\\Projects\\my-project") as HTMLInputElement;

    // Simulate user typing by firing input event with new value, then blur
    fireEvent.input(input, { target: { value: "D:\\New\\Path" } });
    fireEvent.blur(input);

    // onUpdate should have been called with the new path
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith({ root_path: "D:\\New\\Path" });
    });
  });

  // ── Test 9: handleBrowse no-op 当 invoke 返回 null ──
  it("handleBrowse no-op 当 pick_workspace_path 返回 null", async () => {
    mockState.resolvedByCommand["pick_workspace_path"] = null;

    render(() => (
      <WorkspaceCard workspace={mockWorkspace} onUpdate={onUpdate} onRemove={onRemove} />
    ));

    fireEvent.click(screen.getByText("Browse…"));
    await new Promise((resolve) => setTimeout(resolve, 10));

    // onUpdate should NOT have been called
    expect(onUpdate).not.toHaveBeenCalled();
    // Input value should remain unchanged
    expect(screen.getByDisplayValue("C:\\Projects\\my-project")).toBeInTheDocument();

    delete mockState.resolvedByCommand["pick_workspace_path"];
  });

  // ── Test 10: handleBrowse 写值 当 invoke 返回路径 ──
  it("handleBrowse 写值 when pick_workspace_path 返回路径", async () => {
    mockState.resolvedByCommand["pick_workspace_path"] = "C:/picked";

    render(() => (
      <WorkspaceCard workspace={mockWorkspace} onUpdate={onUpdate} onRemove={onRemove} />
    ));

    fireEvent.click(screen.getByText("Browse…"));
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith({ root_path: "C:/picked" });
    });

    delete mockState.resolvedByCommand["pick_workspace_path"];
  });
});
