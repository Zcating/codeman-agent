//! CodemanSidebar 测试 — D7-CS cascade tree（@ark-ui/solid Accordion 驱动）
//!
//! 按项目约定：mock @ark-ui/solid Accordion 组件（参考 codeman-select.test.tsx 模式），
//! 这样 jsdom 下不需要 EnvironmentProvider 也不依赖 zag-js state machine。
//! 真 Ark UI 行为由 e2e 测试覆盖（spec 09）。

import { render, fireEvent, cleanup } from "@solidjs/testing-library";
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { CodemanSidebar, type CodemanSidebarProps, type WorkspaceNode } from "./codeman-sidebar";

// ─── Ark UI Accordion mock ──────────────────────────────────────────────────────
//
// 用 plain JS Map 追踪展开状态 + 在 ItemTrigger 的 onClick 内同步切换。
// 完全替代真 zag-js state machine，足以覆盖 sidebar cascade 行为契约。

let openValues: Set<string> = new Set();
let sharedOnValueChange: ((details: { value: string[] }) => void) | null = null;

vi.mock("@ark-ui/solid", async () => {
  const actual = await vi.importActual<typeof import("@ark-ui/solid")>("@ark-ui/solid");

  // mock ItemContext：用 module-level Map 模拟 zag-js 的 item context provider。
  // ItemTrigger 在 mock 中通过 props.value 拿到 workspaceId（由 mock Item 显式注入）。
  return {
    ...actual,
    Accordion: {
      Root: (props: any) => {
        sharedOnValueChange = props.onValueChange ?? null;
        return <>{props.children}</>;
      },
      Item: (props: any) => {
        const wsId: string = props.value;
        const isOpen = openValues.has(wsId);
        // 把 wsId 通过 children render-prop 传给 ItemTrigger，让 mock 知道 workspace 身份。
        return (
          <div
            data-part="item"
            data-state={isOpen ? "open" : "closed"}
            data-workspace-id={props["data-workspace-id"]}
            data-value={wsId}
            class={props.class}
          >
            {props.children}
          </div>
        );
      },
      ItemTrigger: (props: any) => {
        // 从最近的 [data-workspace-id] 祖先取 wsId
        // 因为 mock 不支持 useContext，靠 DOM 查找
        return (
          <button
            type="button"
            data-part="item-trigger"
            data-state="closed"
            aria-expanded="false"
            aria-label={props["aria-label"]}
            class={props.class}
            onClick={(e: MouseEvent) => {
              // 找到最近的 [data-workspace-id] 祖先
              let el = e.currentTarget as HTMLElement | null;
              while (el && !el.hasAttribute("data-workspace-id")) {
                el = el.parentElement;
              }
              const wsId = el?.getAttribute("data-workspace-id") ?? "";
              if (openValues.has(wsId)) {
                openValues.delete(wsId);
              } else {
                openValues.clear();
                openValues.add(wsId);
              }
              if (sharedOnValueChange) {
                sharedOnValueChange({ value: Array.from(openValues) });
              }
              // 手动更新所有 items 的 DOM（single-expand 模式会切换所有 item 的 data-state）
              document.querySelectorAll("[data-workspace-id]").forEach((itemEl) => {
                const itemWsId = itemEl.getAttribute("data-workspace-id")!;
                const isOpen = openValues.has(itemWsId);
                itemEl.setAttribute("data-state", isOpen ? "open" : "closed");
                const trigger = itemEl.querySelector('[data-part="item-trigger"]') as HTMLElement | null;
                if (trigger) {
                  trigger.setAttribute("data-state", isOpen ? "open" : "closed");
                  trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
                }
                const content = itemEl.querySelector('[data-part="item-content"]') as HTMLElement | null;
                if (content) {
                  content.setAttribute("data-state", isOpen ? "open" : "closed");
                  if (isOpen) {
                    content.removeAttribute("hidden");
                    content.style.display = "";
                  } else {
                    content.setAttribute("hidden", "");
                    content.style.display = "none";
                  }
                }
              });
            }}
          >
            {props.children}
          </button>
        );
      },
      ItemContent: (props: any) => {
        // mock 简化：内容始终渲染，初始 hidden + display:none；ItemTrigger onClick 会更新
        return (
          <div
            data-part="item-content"
            data-state="closed"
            hidden={true}
            style={{ display: "none" }}
          >
            {props.children}
          </div>
        );
      },
      ItemIndicator: (props: any) => (
        <span data-part="item-indicator" data-state="closed">
          {props.children}
        </span>
      ),
    },
  };
});

// ─── 测试 helpers ────────────────────────────────────────────────────────────

function defaultProps(overrides: Partial<CodemanSidebarProps> = {}): CodemanSidebarProps {
  return {
    nodes: [],
    selectedItemId: null,
    onSelectItem: vi.fn(),
    onDeleteItem: vi.fn(),
    onCreateItem: vi.fn(),
    onEmptyWorkspaceClick: vi.fn(),
    ...overrides,
  };
}

function makeWs(
  id: string,
  label: string,
  children: WorkspaceNode["children"] = [],
): WorkspaceNode {
  return { kind: "workspace", id, label, rootPath: "/tmp", children };
}

function queryWorkspaceItem(container: HTMLElement, wsId: string): HTMLElement | null {
  return container.querySelector(`[data-workspace-id="${wsId}"]`);
}

// ─── 测试套件 ──────────────────────────────────────────────────────────────────

describe("CodemanSidebar (D7-CS cascade tree, @ark-ui/solid Accordion 驱动)", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    openValues = new Set();
    sharedOnValueChange = null;
  });

  // ─── 默认折叠状态 ─────────────────────────────────────────────────────────

  describe("workspaces 默认全折叠", () => {
    it("所有 workspace item 的 data-state 默认为 closed", () => {
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          nodes: [
            makeWs("ws-1", "Frontend"),
            makeWs("ws-2", "Backend"),
          ],
        })} />
      ));
      const headers = container.querySelectorAll("[data-workspace-id]");
      expect(headers.length).toBe(2);
      for (const h of Array.from(headers)) {
        expect(h.getAttribute("data-state")).toBe("closed");
      }
    });

    it("折叠状态下 workspace children 不可见（content hidden）", () => {
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          nodes: [
            makeWs("ws-1", "Frontend", [
              { kind: "conv", id: "c-1", label: "Chat 1" },
            ]),
          ],
        })} />
      ));
      const item = queryWorkspaceItem(container, "ws-1")!;
      const trigger = item.querySelector('[data-part="item-trigger"]') as HTMLElement;
      const content = item.querySelector('[data-part="item-content"]') as HTMLElement;
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(content.hasAttribute("hidden")).toBe(true);
    });
  });

  // ─── 展开/收起 ────────────────────────────────────────────────────────────

  describe("点击 workspace header 展开其 children", () => {
    it("点击后 item data-state=open，trigger aria-expanded=true", () => {
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          nodes: [
            makeWs("ws-1", "Frontend", [
              { kind: "conv", id: "c-1", label: "Chat 1" },
            ]),
          ],
        })} />
      ));
      const item = queryWorkspaceItem(container, "ws-1")!;
      const trigger = item.querySelector('[data-part="item-trigger"]') as HTMLElement;
      fireEvent.click(trigger);
      expect(item.getAttribute("data-state")).toBe("open");
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      expect(container.querySelector("[data-conv-id='c-1']")).toBeTruthy();
    });
  });

  describe("点击同一已展开 workspace 收起", () => {
    it("再次点击后回到 data-state=closed（collapsible=true）", () => {
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          nodes: [makeWs("ws-1", "Frontend", [{ kind: "conv", id: "c-1", label: "Chat 1" }])],
        })} />
      ));
      const item = queryWorkspaceItem(container, "ws-1")!;
      const trigger = item.querySelector('[data-part="item-trigger"]') as HTMLElement;
      fireEvent.click(trigger);
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      fireEvent.click(trigger);
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(item.getAttribute("data-state")).toBe("closed");
    });
  });

  describe("点击另一 workspace 自动收起上一个", () => {
    it("multiple=false 模式下同时只有一个 workspace 的 data-state=open", () => {
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          nodes: [
            makeWs("ws-1", "Frontend", [{ kind: "conv", id: "c-1", label: "Chat 1" }]),
            makeWs("ws-2", "Backend", [{ kind: "conv", id: "c-2", label: "Chat 2" }]),
          ],
        })} />
      ));
      const item1 = queryWorkspaceItem(container, "ws-1")!;
      const item2 = queryWorkspaceItem(container, "ws-2")!;
      const trigger1 = item1.querySelector('[data-part="item-trigger"]') as HTMLElement;
      const trigger2 = item2.querySelector('[data-part="item-trigger"]') as HTMLElement;
      fireEvent.click(trigger1);
      expect(item1.getAttribute("data-state")).toBe("open");
      expect(item2.getAttribute("data-state")).toBe("closed");
      fireEvent.click(trigger2);
      expect(item1.getAttribute("data-state")).toBe("closed");
      expect(item2.getAttribute("data-state")).toBe("open");
    });
  });

  // ─── 空 workspace 空态 ──────────────────────────────────────────────────

  describe("空 workspace 空态", () => {
    it("展开空 workspace 显示「该 workspace 暂无会话」按钮 + 点击触发 onEmptyWorkspaceClick", () => {
      const onEmpty = vi.fn();
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          nodes: [makeWs("ws-empty", "Empty WS", [])],
          onEmptyWorkspaceClick: onEmpty,
        })} />
      ));
      const item = queryWorkspaceItem(container, "ws-empty")!;
      const trigger = item.querySelector('[data-part="item-trigger"]') as HTMLElement;
      fireEvent.click(trigger);
      const emptyBtn = container.querySelector(`[data-empty-workspace-id="ws-empty"]`) as HTMLElement;
      expect(emptyBtn).toBeTruthy();
      expect(emptyBtn.textContent).toContain("该 workspace 暂无会话");
      fireEvent.click(emptyBtn);
      expect(onEmpty).toHaveBeenCalledWith("ws-empty");
    });

    it("有 convs 的 workspace 不显示空态按钮", () => {
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          nodes: [makeWs("ws-1", "WS", [{ kind: "conv", id: "c-1", label: "Chat 1" }])],
        })} />
      ));
      const item = queryWorkspaceItem(container, "ws-1")!;
      const trigger = item.querySelector('[data-part="item-trigger"]') as HTMLElement;
      fireEvent.click(trigger);
      expect(container.querySelector("[data-empty-workspace-id]")).toBeNull();
    });
  });

  // ─── workspace 不再 active（only conv 可 active） ───────────────────────

  describe("workspace header 永不被标记为 active", () => {
    it("trigger 上没有 bg-sidebar-primary 高亮（workspace never active）", () => {
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          nodes: [
            makeWs("ws-1", "Frontend", [{ kind: "conv", id: "c-1", label: "Chat 1" }]),
            makeWs("ws-2", "Backend"),
          ],
        })} />
      ));
      const trigger = container.querySelector('[data-workspace-id="ws-1"] [data-part="item-trigger"]') as HTMLElement;
      expect(trigger.className).not.toContain("bg-sidebar-primary");
    });
  });

  // ─── conv 高亮跟随 selectedItemId ───────────────────────────────────────

  describe("active conv 高亮", () => {
    it("展开 workspace 后 active conv 显示 aria-current='page'", () => {
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          nodes: [
            makeWs("ws-1", "Frontend", [
              { kind: "conv", id: "c-1", label: "Active Chat" },
              { kind: "conv", id: "c-2", label: "Other" },
            ]),
          ],
          selectedItemId: "c-1",
        })} />
      ));
      const item = queryWorkspaceItem(container, "ws-1")!;
      const trigger = item.querySelector('[data-part="item-trigger"]') as HTMLElement;
      fireEvent.click(trigger);
      const activeConv = container.querySelector("[data-conv-id='c-1']") as HTMLElement;
      expect(activeConv.getAttribute("aria-current")).toBe("page");
    });

    it("折叠 workspace 后 conv 不可见（content hidden）", () => {
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          nodes: [
            makeWs("ws-1", "Frontend", [
              { kind: "conv", id: "c-1", label: "Chat 1" },
            ]),
          ],
          selectedItemId: "c-1",
        })} />
      ));
      const item = queryWorkspaceItem(container, "ws-1")!;
      const content = item.querySelector('[data-part="item-content"]') as HTMLElement;
      expect(content.hasAttribute("hidden")).toBe(true);
    });
  });

  // ─── streaming badge + delete + create ───────────────────────────────────

  describe("streaming badge", () => {
    it("streaming conv 上显示 aria-label='streaming' 的 Loader2", () => {
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          nodes: [makeWs("ws-1", "WS", [{ kind: "conv", id: "c-1", label: "Streaming chat", isStreaming: true }])],
        })} />
      ));
      const trigger = container.querySelector('[data-workspace-id="ws-1"] [data-part="item-trigger"]') as HTMLElement;
      fireEvent.click(trigger);
      const spinner = container.querySelector("[aria-label='streaming']") as HTMLElement;
      expect(spinner).toBeTruthy();
      expect(spinner.tagName.toLowerCase()).toBe("svg");
    });
  });

  describe("Inline delete confirm", () => {
    it("点击 delete 按钮显示确认 UI", () => {
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          nodes: [makeWs("ws-1", "WS", [{ kind: "conv", id: "c-1", label: "Chat 1" }])],
          onDeleteItem: vi.fn(),
        })} />
      ));
      const trigger = container.querySelector('[data-workspace-id="ws-1"] [data-part="item-trigger"]') as HTMLElement;
      fireEvent.click(trigger);
      fireEvent.click(container.querySelector("[aria-label='Delete']") as HTMLElement);
      expect(container.querySelector("[aria-label='确认删除']")).toBeTruthy();
      expect(container.querySelector("[aria-label='取消删除']")).toBeTruthy();
    });

    it("确认删除调用 onDeleteItem", () => {
      const onDelete = vi.fn();
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          nodes: [makeWs("ws-1", "WS", [{ kind: "conv", id: "c-1", label: "Chat 1" }])],
          onDeleteItem: onDelete,
        })} />
      ));
      const trigger = container.querySelector('[data-workspace-id="ws-1"] [data-part="item-trigger"]') as HTMLElement;
      fireEvent.click(trigger);
      fireEvent.click(container.querySelector("[aria-label='Delete']") as HTMLElement);
      fireEvent.click(container.querySelector("[aria-label='确认删除']") as HTMLElement);
      expect(onDelete).toHaveBeenCalledWith("c-1");
    });

    it("取消删除隐藏确认 UI", () => {
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          nodes: [makeWs("ws-1", "WS", [{ kind: "conv", id: "c-1", label: "Chat 1" }])],
          onDeleteItem: vi.fn(),
        })} />
      ));
      const trigger = container.querySelector('[data-workspace-id="ws-1"] [data-part="item-trigger"]') as HTMLElement;
      fireEvent.click(trigger);
      fireEvent.click(container.querySelector("[aria-label='Delete']") as HTMLElement);
      fireEvent.click(container.querySelector("[aria-label='取消删除']") as HTMLElement);
      expect(container.querySelector("[aria-label='确认删除']")).toBeNull();
    });
  });

  describe("Create button", () => {
    it("渲染 create button 当 onCreateItem 提供", () => {
      const onCreate = vi.fn();
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({ onCreateItem: onCreate })} />
      ));
      const btn = container.querySelector("[aria-label='新对话']") as HTMLElement;
      expect(btn).toBeTruthy();
      fireEvent.click(btn);
      expect(onCreate).toHaveBeenCalledTimes(1);
    });

    it("不渲染 create button 当 onCreateItem 省略", () => {
      const props = defaultProps();
      delete (props as Partial<CodemanSidebarProps>).onCreateItem;
      const { container } = render(() => <CodemanSidebar {...props} />);
      expect(container.querySelector("[aria-label='新对话']")).toBeNull();
    });
  });

  describe("Workspaces empty state", () => {
    it("无 workspaces 时显示空态文本（No workspaces）", () => {
      const { container } = render(() => <CodemanSidebar {...defaultProps()} />);
      expect(container.textContent).toContain("No workspaces");
    });
  });

  // ─── workspace hover rename + delete ─────────────────────────────────────────

  describe("Workspace hover actions", () => {
    it("renders rename and delete buttons on workspace hover", () => {
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          nodes: [makeWs("ws-1", "My Workspace")],
          onRenameWorkspace: vi.fn(),
          onDeleteWorkspace: vi.fn(),
        })} />
      ));
      const item = queryWorkspaceItem(container, "ws-1")!;
      const trigger = item.querySelector('[data-part="item-trigger"]') as HTMLElement;
      // Hover the workspace trigger
      fireEvent.mouseEnter(trigger);
      const renameBtn = container.querySelector("[aria-label='Rename My Workspace']") as HTMLElement;
      const deleteBtn = container.querySelector("[aria-label='Delete My Workspace']") as HTMLElement;
      expect(renameBtn).toBeTruthy();
      expect(deleteBtn).toBeTruthy();
    });

    it("rename button click calls onRenameWorkspace(id, label)", () => {
      const onRename = vi.fn();
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          nodes: [makeWs("ws-1", "My Workspace")],
          onRenameWorkspace: onRename,
        })} />
      ));
      const item = queryWorkspaceItem(container, "ws-1")!;
      const trigger = item.querySelector('[data-part="item-trigger"]') as HTMLElement;
      fireEvent.mouseEnter(trigger);
      const renameBtn = container.querySelector("[aria-label='Rename My Workspace']") as HTMLElement;
      fireEvent.click(renameBtn);
      expect(onRename).toHaveBeenCalledWith("ws-1", "My Workspace");
    });

    it("delete button click calls onDeleteWorkspace(id, label)", () => {
      const onDelete = vi.fn();
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          nodes: [makeWs("ws-1", "My Workspace")],
          onDeleteWorkspace: onDelete,
        })} />
      ));
      const item = queryWorkspaceItem(container, "ws-1")!;
      const trigger = item.querySelector('[data-part="item-trigger"]') as HTMLElement;
      fireEvent.mouseEnter(trigger);
      const deleteBtn = container.querySelector("[aria-label='Delete My Workspace']") as HTMLElement;
      fireEvent.click(deleteBtn);
      expect(onDelete).toHaveBeenCalledWith("ws-1", "My Workspace");
    });

    it("buttons do not trigger accordion expand/collapse", () => {
      const { container } = render(() => (
        <CodemanSidebar {...defaultProps({
          nodes: [makeWs("ws-1", "WS", [{ kind: "conv", id: "c-1", label: "Chat 1" }])],
          onRenameWorkspace: vi.fn(),
          onDeleteWorkspace: vi.fn(),
        })} />
      ));
      const item = queryWorkspaceItem(container, "ws-1")!;
      const trigger = item.querySelector('[data-part="item-trigger"]') as HTMLElement;
      // Initially collapsed
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      // Click rename button (should NOT expand)
      fireEvent.mouseEnter(trigger);
      const renameBtn = container.querySelector("[aria-label='Rename WS']") as HTMLElement;
      fireEvent.click(renameBtn);
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
    });
  });
});
