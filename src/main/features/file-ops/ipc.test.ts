import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Database as DB } from "better-sqlite3";
import { registerFileOpsIpc } from "./ipc.js";

const mockIpcMain = vi.hoisted(() => ({ handle: vi.fn() }));

const mockFileSandbox = vi.hoisted(() => ({
  validatePathInWorkspace: vi.fn(),
  readFileInWorkspace: vi.fn(),
  writeFileInWorkspace: vi.fn(),
}));

const mockNodeFs = vi.hoisted(() => ({
  readFile: vi.fn(),
  unlink: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
}));

vi.mock("electron", () => ({ ipcMain: mockIpcMain }));
vi.mock("../../file-sandbox.js", () => mockFileSandbox);
vi.mock("node:fs/promises", () => mockNodeFs);

class FakeStatement {
  all(): unknown[] {
    return [];
  }
  get(): unknown {
    return { id: "w1", label: "work", root_path: "/root", created_at: 100 };
  }
  run(): void {}
}

class FakeDatabase {
  prepare(_sql: string): FakeStatement {
    return new FakeStatement();
  }
  exec(_sql: string): void {}
}

const fakeDb = new FakeDatabase();

function register(): void {
  registerFileOpsIpc({ db: fakeDb as unknown as DB });
}

function handler(channel: string) {
  const call = mockIpcMain.handle.mock.calls.find((c) => c[0] === channel);
  if (!call) {
    throw new Error(`channel not registered: ${channel}`);
  }
  return call[1];
}

beforeEach(() => {
  mockIpcMain.handle.mockClear();
  mockFileSandbox.validatePathInWorkspace.mockResolvedValue("/abs/path");
  mockFileSandbox.readFileInWorkspace.mockReset();
  mockFileSandbox.writeFileInWorkspace.mockReset();
  mockNodeFs.readFile.mockReset();
  mockNodeFs.readdir.mockReset();
});

describe("registerFileOpsIpc", () => {
  it("registers the 5 file-ops channels", () => {
    register();
    expect(mockIpcMain.handle).toHaveBeenCalledTimes(5);
    const channels = mockIpcMain.handle.mock.calls.map((c) => c[0]);
    expect(channels).toEqual(["readFile", "writeFile", "editFile", "searchFiles", "deleteFile"]);
  });

  it("readFile calls readFileInWorkspace and returns its result", async () => {
    mockFileSandbox.readFileInWorkspace.mockResolvedValue("file content");
    register();
    const result = await handler("readFile")(undefined, { workspaceId: "w1", path: "a.txt" });
    expect(mockFileSandbox.readFileInWorkspace).toHaveBeenCalledWith("/root", "a.txt");
    expect(result).toBe("file content");
  });

  it("writeFile calls writeFileInWorkspace and returns undefined", async () => {
    mockFileSandbox.writeFileInWorkspace.mockResolvedValue(undefined);
    register();
    const result = await handler("writeFile")(undefined, { workspaceId: "w1", path: "a.txt", content: "hi" });
    expect(mockFileSandbox.writeFileInWorkspace).toHaveBeenCalledWith("/root", "a.txt", "hi");
    expect(result).toBeUndefined();
  });

  it("editFile throws when applyEdit returns notFound", async () => {
    mockNodeFs.readFile.mockResolvedValue("hello world");
    register();
    await expect(
      handler("editFile")(undefined, { workspaceId: "w1", path: "a.txt", oldText: "zzz", newText: "yyy" }),
    ).rejects.toThrow(/Pattern not found/);
  });

  it("editFile writes newContent when applyEdit returns ok", async () => {
    mockNodeFs.readFile.mockResolvedValue("hello world");
    mockFileSandbox.writeFileInWorkspace.mockResolvedValue(undefined);
    register();
    const result = await handler("editFile")(undefined, {
      workspaceId: "w1",
      path: "a.txt",
      oldText: "hello",
      newText: "goodbye",
    });
    expect(mockFileSandbox.writeFileInWorkspace).toHaveBeenCalledWith("/root", "a.txt", "goodbye world");
    expect(result).toBeUndefined();
  });

  it("searchFiles returns an array", async () => {
    mockNodeFs.readdir.mockResolvedValue([]);
    register();
    const result = await handler("searchFiles")(undefined, { workspaceId: "w1", glob: "**/*.ts" });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });
});
