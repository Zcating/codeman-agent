import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Database as DB } from "better-sqlite3";

const fakeIpcMain = vi.hoisted(() => ({ handle: vi.fn() }));
const fakeDialog = vi.hoisted(() => ({ showOpenDialog: vi.fn() }));
const mockRandomUUID = vi.hoisted(() => vi.fn(() => "mock-uuid"));

vi.mock("electron", () => ({
  ipcMain: fakeIpcMain,
  dialog: fakeDialog,
}));

vi.mock("node:crypto", () => ({
  randomUUID: mockRandomUUID,
}));

class FakeStatement {
  all = vi.fn<() => unknown[]>().mockReturnValue([]);
  get = vi.fn<() => undefined>().mockReturnValue(undefined);
  run = vi.fn();
}
class FakeDatabase {
  statement = new FakeStatement();
  prepare = vi.fn((_sql: string) => this.statement);
  exec = vi.fn();
}
const fakeDb = new FakeDatabase();

import { registerWorkspacesIpc } from "./ipc.js";

const CHANNELS = [
  "listWorkspaces",
  "addWorkspace",
  "renameWorkspace",
  "deleteWorkspace",
  "pickWorkspacePath",
];

function register(): void {
  registerWorkspacesIpc({ db: fakeDb as unknown as DB });
}

function handler(channel: string): (e: unknown, args: unknown) => unknown {
  const entry = fakeIpcMain.handle.mock.calls.find((c) => c[0] === channel);
  if (!entry) {
    throw new Error(`channel "${channel}" not registered`);
  }
  return entry[1] as (e: unknown, args: unknown) => unknown;
}

beforeEach(() => {
  fakeIpcMain.handle.mockClear();
  fakeDialog.showOpenDialog.mockReset();
  mockRandomUUID.mockClear();
  fakeDb.prepare.mockClear();
  fakeDb.statement.run.mockClear();
});

describe("registerWorkspacesIpc", () => {
  it("registers all 5 channels", () => {
    register();
    const channels = fakeIpcMain.handle.mock.calls.map((c) => c[0]);
    expect(channels).toEqual(CHANNELS);
  });

  it("listWorkspaces returns empty array when no rows", () => {
    register();
    const result = handler("listWorkspaces")(undefined, undefined);
    expect(result).toEqual([]);
  });

  it("addWorkspace inserts a row and returns the mapped workspace", () => {
    register();
    const result = handler("addWorkspace")(undefined, { label: "Docs", rootPath: "C:/docs" });
    expect(fakeDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO workspaces"),
    );
    expect(fakeDb.statement.run).toHaveBeenCalledWith(
      "mock-uuid",
      "Docs",
      "C:/docs",
      expect.any(Number),
    );
    expect(result).toEqual({
      id: "mock-uuid",
      label: "Docs",
      rootPath: "C:/docs",
      createdAt: expect.any(Number),
    });
  });

  it("renameWorkspace runs an UPDATE", () => {
    register();
    handler("renameWorkspace")(undefined, { id: "w1", label: "New Name" });
    expect(fakeDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE workspaces"),
    );
    expect(fakeDb.statement.run).toHaveBeenCalledWith("New Name", "w1");
  });

  it("deleteWorkspace runs a DELETE", () => {
    register();
    handler("deleteWorkspace")(undefined, { id: "w1" });
    expect(fakeDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM workspaces"),
    );
    expect(fakeDb.statement.run).toHaveBeenCalledWith("w1");
  });

  it("pickWorkspacePath returns null when dialog is canceled", async () => {
    register();
    fakeDialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    await expect(handler("pickWorkspacePath")(undefined, undefined)).resolves.toBeNull();
  });

  it("pickWorkspacePath returns the first filePath when not canceled", async () => {
    register();
    fakeDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ["/x"] });
    await expect(handler("pickWorkspacePath")(undefined, undefined)).resolves.toBe("/x");
  });
});
