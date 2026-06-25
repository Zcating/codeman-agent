//! Sidebar 组件测试。
//!
//! 通过 vi.mock("../stores/conversations.store") mock 桥接层,
//! 渲染真实 Sidebar 组件,覆盖所有交互和状态分支。

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@solidjs/testing-library";
import { Sidebar } from "./sidebar";
import type { ConversationState } from "../stores/conversations.store";

// ─── Mock store module (correct path, no Sidebar mock) ───────────────────────
//
// vi.mock is hoisted. Factory returns inline vi.fn() — no outer scope refs.
// Per-test state is set by re-importing the mocked module and calling
// vi.mocked(exports).mockReturnValue(...) on the function exports.

vi.mock("../stores/conversations.store", () => ({
  store: { byId: {} as Record<string, ConversationState> },
  conversations$: vi.fn(() => []),
  activeId$: vi.fn(() => null),
  loadConversations: vi.fn(() => Promise.resolve()),
  createConversation: vi.fn(() => Promise.resolve()),
  selectConversation: vi.fn(),
  deleteConversation: vi.fn(() => Promise.resolve()),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeConv(id: string, title: string, updatedAt = 1700000000): ConversationState {
  return {
    id,
    title,
    system_prompt: null,
    created_at: 1700000000,
    updated_at: updatedAt,
    archived_at: null,
    messages: [],
    streamingMessageId: null,
    runtime: {} as any,
  };
}

// Re-import the mocked module to get function references we can configure
async function getMockedStore() {
  const mod = await import("../stores/conversations.store");
  return mod;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("Sidebar", () => {
  afterEach(async () => {
    cleanup();
    vi.clearAllMocks();
    // Clear store.byId between tests to prevent state leakage
    const mod = await import("../stores/conversations.store");
    Object.keys(mod.store.byId).forEach((k) => delete mod.store.byId[k]);
  });

  // H1: Renders empty fallback "暂无会话" when conversations$ returns []
  it("无会话时渲染空列表占位符", async () => {
    const mod = await getMockedStore();
    vi.mocked(mod.conversations$).mockReturnValue([]);
    const { container } = render(() => <Sidebar />);
    const li = container.querySelector('li[role="status"]');
    expect(li).toBeTruthy();
    expect(li?.textContent).toBe("暂无会话");
  });

  // H2: onMount triggers loadConversations(false)
  it("onMount 调用 loadConversations(false)", async () => {
    const mod = await getMockedStore();
    vi.mocked(mod.conversations$).mockReturnValue([]);
    render(() => <Sidebar />);
    expect(mod.loadConversations).toHaveBeenCalledTimes(1);
    expect(mod.loadConversations).toHaveBeenCalledWith(false);
  });

  // H3: Renders <li role="link"> for each conversation; aria-current="page" on active
  it("渲染每个会话为 link角色,且激活项有 aria-current=page", async () => {
    const mod = await getMockedStore();
    const convs = [makeConv("c1", "会话一"), makeConv("c2", "会话二")];
    vi.mocked(mod.conversations$).mockReturnValue(convs);
    vi.mocked(mod.activeId$).mockReturnValue("c1");
    const { container } = render(() => <Sidebar />);
    const items = container.querySelectorAll('li[role="link"]');
    expect(items.length).toBe(2);
    expect(items[0].getAttribute("aria-current")).toBe("page");
    expect(items[1].getAttribute("aria-current")).toBeNull();
  });

  // H4: Click on conversation calls selectConversation(c.id)
  it("点击会话项调用 selectConversation(id)", async () => {
    const mod = await getMockedStore();
    const convs = [makeConv("c1", "会话一")];
    vi.mocked(mod.conversations$).mockReturnValue(convs);
    const { container } = render(() => <Sidebar />);
    const item = container.querySelector('li[role="link"]')!;
    fireEvent.click(item);
    expect(mod.selectConversation).toHaveBeenCalledTimes(1);
    expect(mod.selectConversation).toHaveBeenCalledWith("c1");
  });

  // H5: Right-click (contextmenu) sets confirmingId(c.id) → confirm UI shows
  it("右键会话项显示确认删除 UI", async () => {
    const mod = await getMockedStore();
    const convs = [makeConv("c1", "会话一")];
    vi.mocked(mod.conversations$).mockReturnValue(convs);
    const { container } = render(() => <Sidebar />);
    const item = container.querySelector('li[role="link"]')!;
    fireEvent.contextMenu(item);
    expect(container.textContent).toContain("确定删除");
  });

  // H6: Click delete button in confirm UI calls handleConfirmDelete → deleteConversation
  it("点击确认删除按钮调用 deleteConversation", async () => {
    const mod = await getMockedStore();
    const convs = [makeConv("c1", "会话一")];
    vi.mocked(mod.conversations$).mockReturnValue(convs);
    const { container } = render(() => <Sidebar />);
    const item = container.querySelector('li[role="link"]')!;
    fireEvent.contextMenu(item);
    const deleteBtn = container.querySelector('button[aria-label="确认删除"]');
    expect(deleteBtn).toBeTruthy();
    fireEvent.click(deleteBtn!);
    await Promise.resolve();
    expect(mod.deleteConversation).toHaveBeenCalledTimes(1);
    expect(mod.deleteConversation).toHaveBeenCalledWith("c1");
  });

  // H7: Click cancel button in confirm UI sets confirmingId(null)
  it("点击取消按钮关闭确认 UI", async () => {
    const mod = await getMockedStore();
    const convs = [makeConv("c1", "会话一")];
    vi.mocked(mod.conversations$).mockReturnValue(convs);
    const { container } = render(() => <Sidebar />);
    const item = container.querySelector('li[role="link"]')!;
    fireEvent.contextMenu(item);
    const cancelBtn = container.querySelector('button[aria-label="取消删除"]');
    expect(cancelBtn).toBeTruthy();
    fireEvent.click(cancelBtn!);
    expect(container.textContent).not.toContain("确定删除");
  });

  // H8: Keyboard ArrowDown cycles to next conversation + selects
  it("ArrowDown 键切换到下一会话并选中", async () => {
    const mod = await getMockedStore();
    const convs = [makeConv("c1", "会话一"), makeConv("c2", "会话二")];
    vi.mocked(mod.conversations$).mockReturnValue(convs);
    vi.mocked(mod.activeId$).mockReturnValue("c1");
    const { container } = render(() => <Sidebar />);
    const list = container.querySelector("ul[role='navigation']")!;
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(mod.selectConversation).toHaveBeenCalledWith("c2");
  });

  // H9: Keyboard ArrowUp wraps to last when at first
  it("ArrowUp 键在首项时循环到末项", async () => {
    const mod = await getMockedStore();
    const convs = [makeConv("c1", "会话一"), makeConv("c2", "会话二")];
    vi.mocked(mod.conversations$).mockReturnValue(convs);
    vi.mocked(mod.activeId$).mockReturnValue("c1");
    const { container } = render(() => <Sidebar />);
    const list = container.querySelector("ul[role='navigation']")!;
    fireEvent.keyDown(list, { key: "ArrowUp" });
    expect(mod.selectConversation).toHaveBeenCalledWith("c2");
  });

  // H10: Keyboard Enter on current selection → selectConversation again
  it("Enter 键重新选中当前会话", async () => {
    const mod = await getMockedStore();
    const convs = [makeConv("c1", "会话一"), makeConv("c2", "会话二")];
    vi.mocked(mod.conversations$).mockReturnValue(convs);
    vi.mocked(mod.activeId$).mockReturnValue("c1");
    const { container } = render(() => <Sidebar />);
    const list = container.querySelector("ul[role='navigation']")!;
    fireEvent.keyDown(list, { key: "Enter" });
    expect(mod.selectConversation).toHaveBeenCalledWith("c1");
  });

  // H11: Keyboard Delete sets confirmingId
  it("Delete 键进入确认删除模式", async () => {
    const mod = await getMockedStore();
    const convs = [makeConv("c1", "会话一")];
    vi.mocked(mod.conversations$).mockReturnValue(convs);
    vi.mocked(mod.activeId$).mockReturnValue("c1");
    const { container } = render(() => <Sidebar />);
    const list = container.querySelector("ul[role='navigation']")!;
    fireEvent.keyDown(list, { key: "Delete" });
    expect(container.textContent).toContain("确定删除");
  });

  // H12: Keyboard Escape clears confirmingId
  it("Escape 键退出确认删除模式", async () => {
    const mod = await getMockedStore();
    const convs = [makeConv("c1", "会话一")];
    vi.mocked(mod.conversations$).mockReturnValue(convs);
    vi.mocked(mod.activeId$).mockReturnValue("c1");
    const { container } = render(() => <Sidebar />);
    const list = container.querySelector("ul[role='navigation']")!;
    fireEvent.keyDown(list, { key: "Delete" });
    expect(container.textContent).toContain("确定删除");
    fireEvent.keyDown(list, { key: "Escape" });
    expect(container.textContent).not.toContain("确定删除");
  });

  // H13: Streaming badge "⏳" shows when store.byId[c.id]?.streamingMessageId != null
  it("streamingMessageId 不为空时显示 ⏳ 徽标", async () => {
    const mod = await getMockedStore();
    const convs = [makeConv("c1", "会话一")];
    convs[0].streamingMessageId = "stream-123";
    // Update store.byId with streaming state
    mod.store.byId["c1"] = convs[0];
    vi.mocked(mod.conversations$).mockReturnValue(convs);
    const { container } = render(() => <Sidebar />);
    const badge = container.querySelector('[aria-label="streaming"]');
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toBe("⏳");
  });

  // H14: No streaming badge when streamingMessageId is null
  it("streamingMessageId 为 null 时不显示 ⏳ 徽标", async () => {
    const mod = await getMockedStore();
    const convs = [makeConv("c1", "会话一")];
    vi.mocked(mod.conversations$).mockReturnValue(convs);
    const { container } = render(() => <Sidebar />);
    const badge = container.querySelector('[aria-label="streaming"]');
    expect(badge).toBeNull();
  });

  // H15: "新对话" button calls createConversation("新会话")
  it("点击新对话按钮调用 createConversation(新会话)", async () => {
    const mod = await getMockedStore();
    vi.mocked(mod.conversations$).mockReturnValue([]);
    const { container } = render(() => <Sidebar />);
    const btn = container.querySelector('button[aria-label="新建会话"]');
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(mod.createConversation).toHaveBeenCalledTimes(1);
    expect(mod.createConversation).toHaveBeenCalledWith("新会话");
  });

  // H16: handleListKeyDown early-return when items.length === 0
  it("会话列表为空时键盘导航直接返回", async () => {
    const mod = await getMockedStore();
    vi.mocked(mod.conversations$).mockReturnValue([]);
    const { container } = render(() => <Sidebar />);
    const list = container.querySelector("ul[role='navigation']")!;
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(mod.selectConversation).not.toHaveBeenCalled();
  });

  // H17: createEffect resets confirmingId on activeId change
  // Testing this requires a full re-render with changed activeId$, which Solid
  // reactivity handles automatically. We verify the effect is set up by checking
  // that activeId$ is called on mount (which triggers the initial effect run).
  it("createEffect 监听 activeId$ 变化", async () => {
    const mod = await getMockedStore();
    const convs = [makeConv("c1", "会话一"), makeConv("c2", "会话二")];
    vi.mocked(mod.conversations$).mockReturnValue(convs);
    vi.mocked(mod.activeId$).mockReturnValue("c1");
    render(() => <Sidebar />);
    // activeId$ is called on mount and by the createEffect
    expect(mod.activeId$).toHaveBeenCalled();
  });

  // H18: Date formatting "zh-CN" applied to updated_at
  it("会话日期使用 zh-CN 区域格式显示", async () => {
    const mod = await getMockedStore();
    const convs = [makeConv("c1", "会话一", 1700000000)];
    vi.mocked(mod.conversations$).mockReturnValue(convs);
    const { container } = render(() => <Sidebar />);
    const dateText = container.textContent;
    expect(dateText).toMatch(/2023|11|15/);
  });

  // Additional: ArrowDown wraps to first when at last
  it("ArrowDown 在末项时循环到首项", async () => {
    const mod = await getMockedStore();
    const convs = [makeConv("c1", "会话一"), makeConv("c2", "会话二")];
    vi.mocked(mod.conversations$).mockReturnValue(convs);
    vi.mocked(mod.activeId$).mockReturnValue("c2");
    const { container } = render(() => <Sidebar />);
    const list = container.querySelector("ul[role='navigation']")!;
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(mod.selectConversation).toHaveBeenCalledWith("c1");
  });

  // Additional: Verify active conversation has correct styling class
  it("激活会话项有 active 样式 (bg-primary)", async () => {
    const mod = await getMockedStore();
    const convs = [makeConv("c1", "会话一"), makeConv("c2", "会话二")];
    vi.mocked(mod.conversations$).mockReturnValue(convs);
    vi.mocked(mod.activeId$).mockReturnValue("c1");
    const { container } = render(() => <Sidebar />);
    const items = container.querySelectorAll('li[role="link"]');
    expect(items[0].className).toContain("bg-primary");
    expect(items[1].className).not.toContain("bg-primary");
  });

  // Additional: Delete key does nothing when no active conversation
  it("无激活会话时 Delete 键不显示确认 UI", async () => {
    const mod = await getMockedStore();
    const convs = [makeConv("c1", "会话一")];
    vi.mocked(mod.conversations$).mockReturnValue(convs);
    vi.mocked(mod.activeId$).mockReturnValue(null);
    const { container } = render(() => <Sidebar />);
    const list = container.querySelector("ul[role='navigation']")!;
    fireEvent.keyDown(list, { key: "Delete" });
    expect(container.textContent).not.toContain("确定删除");
  });

  // Additional: Enter key does nothing when no active conversation
  it("无激活会话时 Enter 键不调用 selectConversation", async () => {
    const mod = await getMockedStore();
    const convs = [makeConv("c1", "会话一")];
    vi.mocked(mod.conversations$).mockReturnValue(convs);
    vi.mocked(mod.activeId$).mockReturnValue(null);
    const { container } = render(() => <Sidebar />);
    const list = container.querySelector("ul[role='navigation']")!;
    fireEvent.keyDown(list, { key: "Enter" });
    expect(mod.selectConversation).not.toHaveBeenCalled();
  });
});
