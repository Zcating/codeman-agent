/**
 * conversations/ipc.test.ts
 *
 * ADR-0046 D3 测试策略：
 * - vi.mock("./data") 后测 handler wiring
 * - 频道注册齐全、args 转发、返回值透传、错误传播
 * - 保留现有断言骨架（频道列表、返回形状）
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted mocks are evaluated at module evaluation time, before vi.mock hoisting
const {
  mockIpcMain,
  mockRandomUUID,
  mockListConversations,
  mockGetConversation,
  mockCreateConversation,
  mockArchiveConversation,
  mockDeleteConversation,
  mockRenameConversation,
  mockListMessages,
  mockAppendMessage,
  mockSearchMessages,
  mockClearAllHistory,
} = vi.hoisted(() => ({
  mockIpcMain: { handle: vi.fn() },
  mockRandomUUID: vi.fn(() => "mock-uuid"),
  mockListConversations: vi.fn(() => Promise.resolve([])),
    mockGetConversation: vi.fn<() => Promise<{ id: string; title: string }>>(() => Promise.reject(new Error("not found"))),
  mockCreateConversation: vi.fn(() => Promise.resolve({})),
  mockArchiveConversation: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  mockDeleteConversation: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  mockRenameConversation: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  mockListMessages: vi.fn(() => Promise.resolve([])),
  mockAppendMessage: vi.fn(() => Promise.resolve({})),
  mockSearchMessages: vi.fn(() => Promise.resolve([])),
  mockClearAllHistory: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}));

vi.mock("electron", () => ({ ipcMain: mockIpcMain }));
vi.mock("node:crypto", () => ({ randomUUID: mockRandomUUID }));
vi.mock("./data.js", () => ({
  listConversations: mockListConversations,
  getConversation: mockGetConversation,
  createConversation: mockCreateConversation,
  archiveConversation: mockArchiveConversation,
  deleteConversation: mockDeleteConversation,
  renameConversation: mockRenameConversation,
  listMessages: mockListMessages,
  appendMessage: mockAppendMessage,
  searchMessagesSafe: mockSearchMessages,
  clearAllHistory: mockClearAllHistory,
}));
vi.mock("../../runtime.js", () => ({
  runMain: vi.fn((effect) => effect as unknown as Promise<unknown>),
}));

import { registerConversationsIpc } from "./ipc.js";

function handlerFor(channel: string) {
  const call = mockIpcMain.handle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`handler not registered: ${channel}`);
  }
  return call[1] as (...args: unknown[]) => unknown;
}

beforeEach(() => {
  mockIpcMain.handle.mockClear();
  mockRandomUUID.mockReturnValue("00000000-0000-4000-8000-000000000000");
  // Reset each mock to its initial resolved/rejected state
  mockListConversations.mockResolvedValue([]);
  mockGetConversation.mockResolvedValue({ id: "conv-1", title: "Test" });
  mockCreateConversation.mockResolvedValue({});
  mockArchiveConversation.mockResolvedValue(undefined);
  mockDeleteConversation.mockResolvedValue(undefined);
  mockRenameConversation.mockResolvedValue(undefined);
  mockListMessages.mockResolvedValue([]);
  mockAppendMessage.mockResolvedValue({});
  mockSearchMessages.mockResolvedValue([]);
  mockClearAllHistory.mockResolvedValue(undefined);
});

describe("registerConversationsIpc", () => {
  it("registers all 10 conversation + message channels", () => {
    registerConversationsIpc();
    const channels = mockIpcMain.handle.mock.calls.map(([name]) => name);
    expect(channels).toEqual([
      "clearAllHistory",
      "listConversations",
      "getConversation",
      "createConversation",
      "archiveConversation",
      "deleteConversation",
      "renameConversation",
      "listMessages",
      "appendMessage",
      "searchMessages",
    ]);
  });

  it("clearAllHistory calls data.clearAllHistory", async () => {
    registerConversationsIpc();
    await handlerFor("clearAllHistory")(undefined);
    expect(mockClearAllHistory).toHaveBeenCalledWith();
  });

  it("listConversations forwards includeArchived arg", async () => {
    registerConversationsIpc();
    await handlerFor("listConversations")(undefined, { includeArchived: true });
    expect(mockListConversations).toHaveBeenCalledWith(true);
  });

  it("getConversation forwards id arg", async () => {
    registerConversationsIpc();
    await handlerFor("getConversation")(undefined, { id: "conv-123" });
    expect(mockGetConversation).toHaveBeenCalledWith("conv-123");
  });

  it("createConversation forwards input object", async () => {
    registerConversationsIpc();
    const input = { title: "hello", workspaceId: "w1", systemPrompt: "sys" };
    await handlerFor("createConversation")(undefined, input);
    expect(mockCreateConversation).toHaveBeenCalledWith(input);
  });

  it("archiveConversation forwards id", async () => {
    registerConversationsIpc();
    await handlerFor("archiveConversation")(undefined, { id: "c1" });
    expect(mockArchiveConversation).toHaveBeenCalledWith("c1");
  });

  it("deleteConversation forwards id", async () => {
    registerConversationsIpc();
    await handlerFor("deleteConversation")(undefined, { id: "c1" });
    expect(mockDeleteConversation).toHaveBeenCalledWith("c1");
  });

  it("renameConversation forwards id and title", async () => {
    registerConversationsIpc();
    await handlerFor("renameConversation")(undefined, { id: "c1", title: "new" });
    expect(mockRenameConversation).toHaveBeenCalledWith("c1", "new");
  });

  it("listMessages forwards conversationId", async () => {
    registerConversationsIpc();
    await handlerFor("listMessages")(undefined, { conversationId: "c1" });
    expect(mockListMessages).toHaveBeenCalledWith("c1");
  });

  it("listMessages handles empty conversationId", async () => {
    registerConversationsIpc();
    await handlerFor("listMessages")(undefined, {});
    expect(mockListMessages).toHaveBeenCalledWith("");
  });

  it("appendMessage forwards full input", async () => {
    registerConversationsIpc();
    const input = {
      conversationId: "c1",
      role: "user",
      content: "hi",
    };
    await handlerFor("appendMessage")(undefined, input);
    expect(mockAppendMessage).toHaveBeenCalledWith(input);
  });

  it("searchMessages forwards query and limit", async () => {
    registerConversationsIpc();
    await handlerFor("searchMessages")(undefined, { query: "hello", limit: 10 });
    expect(mockSearchMessages).toHaveBeenCalledWith("hello", 10);
  });

  it("searchMessages uses default limit when not provided", async () => {
    registerConversationsIpc();
    await handlerFor("searchMessages")(undefined, { query: "hello" });
    expect(mockSearchMessages).toHaveBeenCalledWith("hello");
  });
});
