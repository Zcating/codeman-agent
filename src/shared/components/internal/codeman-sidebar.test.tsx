import { render, fireEvent, cleanup } from "@solidjs/testing-library";
import { describe, expect, it, vi, afterEach } from "vitest";
import { CodemanSidebar, type CodemanSidebarProps } from "./codeman-sidebar";

function defaultProps(overrides: Partial<CodemanSidebarProps> = {}): CodemanSidebarProps {
  return {
    workspaces: [],
    selectedWorkspaceId: null,
    onSelectWorkspace: vi.fn(),
    items: [],
    selectedItemId: null,
    onSelectItem: vi.fn(),
    onCreateItem: vi.fn(),
    onDeleteItem: vi.fn(),
    onAddWorkspace: vi.fn(),
    ...overrides,
  };
}

describe("CodemanSidebar (Layer 2 business composition)", () => {
  afterEach(() => cleanup());

  describe("Workspace group", () => {
    it("renders workspaces list when provided", () => {
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          workspaces: [
            { id: "ws-1", label: "Frontend", rootPath: "/path/frontend" },
            { id: "ws-2", label: "Backend", rootPath: "/path/backend" },
          ],
          selectedWorkspaceId: "ws-1",
        })} />
      ));
      expect(container.textContent).toContain("Frontend");
      expect(container.textContent).toContain("Backend");
    });

    it("calls onSelectWorkspace when workspace clicked", () => {
      const onSelect = vi.fn();
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          workspaces: [{ id: "ws-1", label: "Frontend", rootPath: "/p" }],
          onSelectWorkspace: onSelect,
        })} />
      ));
      const button = container.querySelector("[aria-label='Workspace: Frontend']") as HTMLElement;
      fireEvent.click(button);
      expect(onSelect).toHaveBeenCalledWith("ws-1");
    });

    it("active workspace has sidebar-primary bg", () => {
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          workspaces: [
            { id: "ws-1", label: "Active WS", rootPath: "/p1" },
            { id: "ws-2", label: "Other WS", rootPath: "/p2" },
          ],
          selectedWorkspaceId: "ws-1",
        })} />
      ));
      const activeButton = container.querySelector("[aria-label='Workspace: Active WS']") as HTMLElement;
      const otherButton = container.querySelector("[aria-label='Workspace: Other WS']") as HTMLElement;
      expect(activeButton.className).toContain("bg-sidebar-primary");
      expect(otherButton.className).not.toContain("bg-sidebar-primary");
    });

    it("empty workspaces shows fallback with add button when onAddWorkspace provided", () => {
      const onAdd = vi.fn();
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({ workspaces: [], onAddWorkspace: onAdd })} />
      ));
      const addBtn = container.querySelector("[aria-label='Add workspace']") as HTMLElement;
      expect(addBtn).toBeTruthy();
      fireEvent.click(addBtn);
      expect(onAdd).toHaveBeenCalledTimes(1);
    });
  });

  describe("Items (conversations) group", () => {
    it("renders items with labels", () => {
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          items: [
            { id: "c-1", label: "First chat", subLabel: "2024-01-15" },
            { id: "c-2", label: "Second chat", subLabel: "2024-01-16" },
          ],
        })} />
      ));
      expect(container.textContent).toContain("First chat");
      expect(container.textContent).toContain("Second chat");
      expect(container.textContent).toContain("2024-01-15");
    });

    it("empty items shows fallback text", () => {
      const { container } = render(() => <CodemanSidebar {...defaultProps()} />);
      expect(container.textContent).toContain("暂无会话");
    });

    it("calls onSelectItem when item clicked", () => {
      const onSelect = vi.fn();
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          items: [{ id: "c-1", label: "Chat 1" }],
          onSelectItem: onSelect,
        })} />
      ));
      const btn = container.querySelector("[aria-label='会话: Chat 1']") as HTMLElement;
      fireEvent.click(btn);
      expect(onSelect).toHaveBeenCalledWith("c-1");
    });

    it("active item has sidebar-primary bg", () => {
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          items: [
            { id: "c-1", label: "Active" },
            { id: "c-2", label: "Other" },
          ],
          selectedItemId: "c-1",
        })} />
      ));
      const activeBtn = container.querySelector("[aria-label='会话: Active']") as HTMLElement;
      expect(activeBtn.className).toContain("bg-sidebar-primary");
    });

    it("streaming item shows Loader2 spinner with aria-label=streaming", () => {
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          items: [{ id: "c-1", label: "Streaming chat", isStreaming: true }],
        })} />
      ));
      const spinner = container.querySelector("[aria-label='streaming']") as HTMLElement;
      expect(spinner).toBeTruthy();
      expect(spinner.tagName.toLowerCase()).toBe("svg");
    });
  });

  describe("Inline delete confirm", () => {
    it("clicking delete button shows confirm UI", () => {
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          items: [{ id: "c-1", label: "Chat 1" }],
          onDeleteItem: vi.fn(),
        })} />
      ));
      const deleteBtn = container.querySelector("[aria-label='Delete']") as HTMLElement;
      fireEvent.click(deleteBtn);
      expect(container.querySelector("[aria-label='确认删除']")).toBeTruthy();
      expect(container.querySelector("[aria-label='取消删除']")).toBeTruthy();
    });

    it("confirming delete calls onDeleteItem", () => {
      const onDelete = vi.fn();
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          items: [{ id: "c-1", label: "Chat 1" }],
          onDeleteItem: onDelete,
        })} />
      ));
      fireEvent.click(container.querySelector("[aria-label='Delete']") as HTMLElement);
      fireEvent.click(container.querySelector("[aria-label='确认删除']") as HTMLElement);
      expect(onDelete).toHaveBeenCalledWith("c-1");
    });

    it("cancel delete hides confirm UI", () => {
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          items: [{ id: "c-1", label: "Chat 1" }],
          onDeleteItem: vi.fn(),
        })} />
      ));
      fireEvent.click(container.querySelector("[aria-label='Delete']") as HTMLElement);
      fireEvent.click(container.querySelector("[aria-label='取消删除']") as HTMLElement);
      expect(container.querySelector("[aria-label='确认删除']")).toBeNull();
    });

    it("disabled item has no delete action", () => {
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          items: [{ id: "c-1", label: "Old conv", isDisabled: true }],
          onDeleteItem: vi.fn(),
        })} />
      ));
      expect(container.querySelector("[aria-label='Delete']")).toBeNull();
    });
  });

  describe("Create button", () => {
    it("renders create button when onCreateItem provided", () => {
      const onCreate = vi.fn();
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({ onCreateItem: onCreate })} />
      ));
      const btn = container.querySelector("[aria-label='新对话']") as HTMLElement;
      expect(btn).toBeTruthy();
      fireEvent.click(btn);
      expect(onCreate).toHaveBeenCalledTimes(1);
    });

    it("hides create button when onCreateItem omitted", () => {
      const props = defaultProps();
      delete (props as Partial<CodemanSidebarProps>).onCreateItem;
      const { container } = render(() => <CodemanSidebar {...props} />);
      expect(container.querySelector("[aria-label='新对话']")).toBeNull();
    });
  });
});
