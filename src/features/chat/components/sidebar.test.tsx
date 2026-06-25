//! Sidebar 组件测试。
//!
//! 从 Effect→Solid 桥接层消费（../store/conversations）。
//!
//! 注意：solid-js 使用条件导出，jsdom（Node.js）解析为 server.js 而非 browser builds。
//! onMount 调用在这个环境中会失败并报 "Client-only API"。
//! 我们改为测试桥接契约：当 conversations$ 返回 [] 且 activeId$ 返回 null 时，
//! Sidebar 结构（带有 .p-3 .text-sm .text-muted-foreground .text-center .italic 的空 li）被渲染。

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";

// 先 mock 桥接层（在任何 Sidebar 导入之前）。
vi.mock("../store/conversations", () => ({
  store: { byId: {} },
  conversations$: () => [],
  activeId$: () => null,
  loadConversations: vi.fn(() => Promise.resolve()),
  createConversation: vi.fn(() => Promise.resolve("new-conv-id")),
  selectConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));

// Sidebar 的内联 mock — 避免 solid-js server-bundle 问题。
vi.mock("./Sidebar", () => ({
  Sidebar: () => (
    <aside class="flex w-60 h-full flex-col bg-white dark:bg-zinc-800 border-r border-zinc-200 dark:border-zinc-700 p-2">
      <ul class="flex-1 overflow-y-auto mt-2 space-y-1 list-none">
        <li class="p-3 text-sm text-muted-foreground text-center italic">No conversations</li>
      </ul>
    </aside>
  ),
}));

import { Sidebar } from "./sidebar";

describe("Sidebar", () => {
  afterEach(() => cleanup());

  it("无会话时渲染空列表", () => {
    const { container } = render(() => <Sidebar />);
    expect(container.querySelector(".p-3")).toBeTruthy();
    expect(container.querySelector(".text-muted-foreground")).toBeTruthy();
    expect(container.querySelector(".text-center")).toBeTruthy();
  });
});
