/**
 * compaction/ipc.test.ts
 *
 * ADR-0046 D3 测试策略：
 * - vi.mock("./data") 后测 handler wiring
 * - 频道注册齐全、args 转发、返回值透传
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted mocks are evaluated at module evaluation time, before vi.mock hoisting
const { mockIpcMain, mockRandomUUID, mockListCompactionEntries, mockAppendCompactionEntry } = vi.hoisted(
  () => ({
    mockIpcMain: { handle: vi.fn() },
    mockRandomUUID: vi.fn(() => "mock-uuid"),
    mockListCompactionEntries: vi.fn(() => Promise.resolve([])),
    mockAppendCompactionEntry: vi.fn(() => Promise.resolve({})),
  })
);

vi.mock("electron", () => ({ ipcMain: mockIpcMain }));
vi.mock("node:crypto", () => ({ randomUUID: mockRandomUUID }));
vi.mock("./data.js", () => ({
  listCompactionEntries: mockListCompactionEntries,
  appendCompactionEntry: mockAppendCompactionEntry,
}));
vi.mock("../../runtime.js", () => ({
  runMain: vi.fn((effect) => effect as unknown as Promise<unknown>),
}));

import { registerCompactionIpc } from "./ipc.js";

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
  mockListCompactionEntries.mockResolvedValue([]);
  mockAppendCompactionEntry.mockResolvedValue({});
});

describe("registerCompactionIpc", () => {
  it("registers compaction:list and compaction:append channels", () => {
    registerCompactionIpc();
    const channels = mockIpcMain.handle.mock.calls.map(([name]) => name);
    expect(channels).toEqual(["compaction:list", "compaction:append"]);
  });

  it("compaction:list forwards conversationId", async () => {
    registerCompactionIpc();
    await handlerFor("compaction:list")(undefined, { conversationId: "conv-1" });
    expect(mockListCompactionEntries).toHaveBeenCalledWith("conv-1");
  });

  it("compaction:list handles empty conversationId", async () => {
    registerCompactionIpc();
    await handlerFor("compaction:list")(undefined, {});
    expect(mockListCompactionEntries).toHaveBeenCalledWith("");
  });

  it("compaction:append forwards full input", async () => {
    registerCompactionIpc();
    const input = {
      conversationId: "conv-1",
      summary: "A summary",
      model: "gpt-4o",
      tokensBefore: 5000,
      kind: "manual" as const,
      firstKeptMessageId: "msg-100",
    };
    await handlerFor("compaction:append")(undefined, input);
    expect(mockAppendCompactionEntry).toHaveBeenCalledWith(input);
  });

  it("handler returns value from data function", async () => {
    const expected = {
      id: "cmp-1",
      conversationId: "conv-1",
      summary: "A summary",
      model: "gpt-4o",
      tokensBefore: 5000,
      kind: "manual" as const,
      createdAt: 1700000003000,
      firstKeptMessageId: "msg-100",
    };
    mockAppendCompactionEntry.mockResolvedValue(expected);
    registerCompactionIpc();
    const result = await handlerFor("compaction:append")(undefined, {
      conversationId: "conv-1",
      summary: "A summary",
      model: "gpt-4o",
      tokensBefore: 5000,
      kind: "manual",
      firstKeptMessageId: "msg-100",
    });
    expect(result).toBe(expected);
  });
});
