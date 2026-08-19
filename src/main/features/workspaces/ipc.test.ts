/**
 * workspaces/ipc.test.ts
 *
 * - vi.mock("./data") 后测 handler wiring
 * - 频道注册齐全、args 转发、返回值透传
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted mocks are evaluated at module evaluation time, before vi.mock hoisting
const {
  mockIpcMain,
  mockDialog,
  mockRandomUUID,
  mockListWorkspaces,
  mockAddWorkspace,
  mockRenameWorkspace,
  mockDeleteWorkspace,
} = vi.hoisted(() => ({
  mockIpcMain: { handle: vi.fn() },
  mockDialog: { showOpenDialog: vi.fn() },
  mockRandomUUID: vi.fn(() => "mock-uuid"),
  mockListWorkspaces: vi.fn(() => Promise.resolve([])),
  mockAddWorkspace: vi.fn(() => Promise.resolve({})),
  mockRenameWorkspace: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  mockDeleteWorkspace: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}));

vi.mock("electron", () => ({
  ipcMain: mockIpcMain,
  dialog: mockDialog,
}));
vi.mock("node:crypto", () => ({
  randomUUID: mockRandomUUID,
}));
vi.mock("./data.js", () => ({
  listWorkspaces: mockListWorkspaces,
  addWorkspace: mockAddWorkspace,
  renameWorkspace: mockRenameWorkspace,
  deleteWorkspace: mockDeleteWorkspace,
}));
vi.mock("../../runtime.js", () => ({
  runMain: vi.fn((effect) => effect as unknown as Promise<unknown>),
}));

import { registerWorkspacesIpc } from "./ipc.js";

const CHANNELS = [
  "listWorkspaces",
  "addWorkspace",
  "renameWorkspace",
  "deleteWorkspace",
  "pickWorkspacePath",
];

function register(): void {
  registerWorkspacesIpc();
}

function handler(channel: string): (e: unknown, args: unknown) => unknown {
  const entry = mockIpcMain.handle.mock.calls.find((c) => c[0] === channel);
  if (!entry) {
    throw new Error(`channel "${channel}" not registered`);
  }
  return entry[1] as (e: unknown, args: unknown) => unknown;
}

beforeEach(() => {
  mockIpcMain.handle.mockClear();
  mockDialog.showOpenDialog.mockReset();
  mockRandomUUID.mockClear();
  [
    mockListWorkspaces,
    mockAddWorkspace,
    mockRenameWorkspace,
    mockDeleteWorkspace,
  ].forEach((fn) => { fn.mockReset(); });
});

describe("registerWorkspacesIpc", () => {
  it("registers all 5 channels", () => {
    register();
    const channels = mockIpcMain.handle.mock.calls.map((c) => c[0]);
    expect(channels).toEqual(CHANNELS);
  });

  it("listWorkspaces calls data.listWorkspaces", async () => {
    register();
    mockListWorkspaces.mockResolvedValue([]);
    await handler("listWorkspaces")(undefined, undefined);
    expect(mockListWorkspaces).toHaveBeenCalledWith();
  });

  it("addWorkspace forwards input object", async () => {
    register();
    const input = { label: "Docs", rootPath: "C:/docs" };
    mockAddWorkspace.mockResolvedValue({ id: "w1", label: "Docs", rootPath: "C:/docs", createdAt: 123 });
    await handler("addWorkspace")(undefined, input);
    expect(mockAddWorkspace).toHaveBeenCalledWith(input);
  });

  it("renameWorkspace forwards id and label", async () => {
    register();
    await handler("renameWorkspace")(undefined, { id: "w1", label: "New Name" });
    expect(mockRenameWorkspace).toHaveBeenCalledWith("w1", "New Name");
  });

  it("deleteWorkspace forwards id", async () => {
    register();
    await handler("deleteWorkspace")(undefined, { id: "w1" });
    expect(mockDeleteWorkspace).toHaveBeenCalledWith("w1");
  });

  it("pickWorkspacePath returns null when dialog is canceled", async () => {
    register();
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    await expect(handler("pickWorkspacePath")(undefined, undefined)).resolves.toBeNull();
  });

  it("pickWorkspacePath returns the first filePath when not canceled", async () => {
    register();
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ["/x"] });
    await expect(handler("pickWorkspacePath")(undefined, undefined)).resolves.toBe("/x");
  });

  it("handler returns value from data function", async () => {
    const expected = { id: "w1", label: "Docs", rootPath: "C:/docs", createdAt: 123 };
    mockAddWorkspace.mockResolvedValue(expected);
    register();
    const result = await handler("addWorkspace")(undefined, { label: "Docs" });
    expect(result).toBe(expected);
  });
});
