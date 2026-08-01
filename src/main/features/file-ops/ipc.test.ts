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

describe("applyEdit helper", () => {
  it("returns notFound when content has no occurrences", async () => {
    const { applyEdit } = await import("./ipc.js");
    const result = applyEdit("no match here", "needle", "hay", false, "/fake/path.txt");
    expect(result.kind).toBe("notFound");
    if (result.kind === "notFound") {
      expect(result.message).toContain("/fake/path.txt");
      expect(result.message).toContain("needle");
    }
  });

  it("returns ambiguous when content has 2+ occurrences and replaceAll=false", async () => {
    const { applyEdit } = await import("./ipc.js");
    const result = applyEdit("needle and needle again", "needle", "hay", false, "/fake/path.txt");
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.message).toContain("/fake/path.txt");
      expect(result.message).toContain("needle");
      expect(result.message).toContain("2");
    }
  });

  it("returns ok when content has exactly 1 occurrence", async () => {
    const { applyEdit } = await import("./ipc.js");
    const result = applyEdit("found my needle here", "needle", "hay", false, "/fake/path.txt");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.newContent).toBe("found my hay here");
    }
  });

  it("returns ok when content has 2+ occurrences and replaceAll=true", async () => {
    const { applyEdit } = await import("./ipc.js");
    const result = applyEdit("needle and needle again", "needle", "hay", true, "/fake/path.txt");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.newContent).toBe("hay and hay again");
    }
  });

  it("truncates oldText longer than 200 chars and includes ... in message", async () => {
    const { applyEdit } = await import("./ipc.js");
    const longPattern = "a".repeat(250);
    const result = applyEdit("no match", longPattern, "hay", false, "/fake/path.txt");
    expect(result.kind).toBe("notFound");
    if (result.kind === "notFound") {
      expect(result.message).toContain("...");
      expect(result.message).toContain("a".repeat(200));
      expect(result.message).not.toContain("a".repeat(201));
    }
  });

  it("matches LF-only oldText against CRLF content and preserves CRLF on rewrite", async () => {
    const { applyEdit } = await import("./ipc.js");
    const content = "line1\r\nline2\r\nline3";
    const result = applyEdit(content, "line1\nline2", "REPLACED", false, "/fake/path.txt");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.newContent).toBe("REPLACED\r\nline3");
    }
  });

  it("matches CRLF oldText against CRLF content (no regression on existing happy path)", async () => {
    const { applyEdit } = await import("./ipc.js");
    const content = "line1\r\nline2\r\nline3";
    const result = applyEdit(content, "line1\r\nline2", "REPLACED", false, "/fake/path.txt");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.newContent).toBe("REPLACED\r\nline3");
    }
  });

  it("preserves LF when content is LF and oldText is LF (no EOL drift on happy path)", async () => {
    const { applyEdit } = await import("./ipc.js");
    const content = "line1\nline2\nline3";
    const result = applyEdit(content, "line1\nline2", "REPLACED", false, "/fake/path.txt");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.newContent).toBe("REPLACED\nline3");
    }
  });

  it("replaceAll=true replaces all CRLF occurrences when LLM emits LF", async () => {
    const { applyEdit } = await import("./ipc.js");
    const content = "foo\r\nbar\r\nfoo\r\nbar";
    const result = applyEdit(content, "foo\nbar", "FOOBAR", true, "/fake/path.txt");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.newContent).toBe("FOOBAR\r\nFOOBAR");
    }
  });

  it("notFound on CRLF content when oldText does not exist (real miss, not EOL mismatch)", async () => {
    const { applyEdit } = await import("./ipc.js");
    const content = "line1\r\nline2\r\nline3";
    const result = applyEdit(content, "nonexistent", "REPLACED", false, "/fake/path.txt");
    expect(result.kind).toBe("notFound");
    if (result.kind === "notFound") {
      expect(result.message).toContain("nonexistent");
    }
  });

  it("ambiguous on CRLF content when oldText matches multiple times", async () => {
    const { applyEdit } = await import("./ipc.js");
    const content = "needle\r\nneedle\r\nneedle";
    const result = applyEdit(content, "needle", "REPLACED", false, "/fake/path.txt");
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.message).toContain("3");
    }
  });
});
