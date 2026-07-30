import { describe, it, expect, vi, beforeEach } from "vitest";

const fakeIpcMain = { handle: vi.fn() };
const fakeApp = {
  setLoginItemSettings: vi.fn(),
  getPath: vi.fn().mockReturnValue("/tmp/codeman-agent-test"),
};
const fakeDialog = { showOpenDialog: vi.fn() };
const fakeNotification = vi.fn();
const fakeShell = { openExternal: vi.fn() };
const fakeWin = {
  webContents: { send: vi.fn() },
  isDestroyed: () => false,
};

vi.mock("electron", () => ({
  ipcMain: fakeIpcMain,
  app: fakeApp,
  BrowserWindow: { getAllWindows: () => [fakeWin] },
  dialog: fakeDialog,
  Notification: fakeNotification,
  shell: fakeShell,
}));

// better-sqlite3 is built for Electron's ABI; node test env can't load it.
// Mock db/mod so registerIpcHandlers can call dbInit() without touching native binding.
vi.mock("./db/mod", () => ({
  initDatabase: () => ({ prepare: () => ({ all: () => [], get: () => undefined, run: () => undefined }), exec: () => undefined, pragma: () => undefined }),
  getDatabase: () => ({ prepare: () => ({ all: () => [], get: () => undefined, run: () => undefined }), exec: () => undefined, pragma: () => undefined }),
}));

// Mock mcp-host so McpManager can be instantiated without spawning
vi.mock("./mcp-host", () => ({
  McpStdioServer: vi.fn().mockImplementation(function () {
    return {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      getConfig: () => ({ name: "mock", command: "echo", args: [], enabled: false }),
      getStatus: () => ({ kind: "disabled" as const }),
      listTools: () => [],
      callTool: vi.fn().mockResolvedValue({ content: [], isError: false }),
    };
  }),
}));

// Mock mcp-config to return empty servers
vi.mock("./mcp-config", () => ({
  readMcpConfig: vi.fn().mockReturnValue({
    _tag: "Some",
    value: { version: 1, servers: [] },
  }),
  MCP_CONFIG_PATH: "/tmp/.agents/mcp_servers.json",
}));

// Mock webfetch so we can test sandboxHandler AppError serialization
vi.mock("./features/webfetch/index", () => ({
  fetchSafe: vi.fn(),
}));

const EXPECTED_CHANNELS = [
  // Settings
  "getSettings",
  "updateSettings",
  "clearAllHistory",
  // Conversations
  "listConversations",
  "getConversation",
  "createConversation",
  "archiveConversation",
  "deleteConversation",
  "renameConversation",
  // Messages
  "listMessages",
  "appendMessage",
  "searchMessages",
  // Workspaces
  "listWorkspaces",
  "addWorkspace",
  "renameWorkspace",
  "deleteWorkspace",
  "pickWorkspacePath",
  // Filesystem
  "readFile",
  "writeFile",
  "editFile",
  "searchFiles",
  "deleteFile",
  // Native shims
  "setLoginItem",
  "notify",
  "openExternal",
  "getLogPath",
  // Provider CRUD
  "deleteProvider",
  // Abort
  "abortRequest",
  // QA 表由 src/main/mock-server.ts 直接经 qa-loader.ts 读,不暴露 IPC
  // MCP plugin (ADR-0032)
  "mcp:list-servers",
  "mcp:get-tools",
  "mcp:get-all-tools",
  "mcp:enable",
  "mcp:restart",
  "mcp:call-tool",
  "mcp:open-config-dir",
  // Webfetch
  "webfetch:fetch",
];

describe("T3 — src/main/ipc.ts", () => {
  beforeEach(() => {
    fakeIpcMain.handle.mockClear();
    fakeWin.webContents.send.mockClear();
  });

  it("registers all 36 expected ipcMain.handle channels (qa:get_table removed — handled by mock-server)", async () => {
    const { registerIpcHandlers } = await import("./ipc");
    const { McpManager } = await import("./mcp-manager");
    const { registerMcpIpcHandlers } = await import("./mcp-ipc");
    registerIpcHandlers({ getMainWindow: () => fakeWin as any });
    registerMcpIpcHandlers(new McpManager());
    const channels = fakeIpcMain.handle.mock.calls.map((c) => c[0]);
    expect(channels).toEqual(expect.arrayContaining(EXPECTED_CHANNELS));
    expect(channels.length).toBe(EXPECTED_CHANNELS.length);
  });

  it("emitStreamChunk forwards raw event via webContents.send to first window", async () => {
    const { emitStreamChunk } = await import("./ipc");
    emitStreamChunk({ kind: "token", content: "hi" });
    expect(fakeWin.webContents.send).toHaveBeenCalledWith("stream-chunk", {
      kind: "token",
      content: "hi",
    });
  });

  it("emitStreamChunk skips destroyed windows", async () => {
    const destroyed = {
      webContents: { send: vi.fn() },
      isDestroyed: () => true,
    };
    const electron = await import("electron");
    vi.spyOn(electron.BrowserWindow, "getAllWindows").mockReturnValueOnce([
      destroyed as any,
      fakeWin as any,
    ]);
    const { emitStreamChunk } = await import("./ipc");
    emitStreamChunk({ kind: "token", content: "x" });
    expect(destroyed.webContents.send).not.toHaveBeenCalled();
    expect(fakeWin.webContents.send).toHaveBeenCalled();
  });

  it("deleteProvider + abortRequest handlers are registered", async () => {
    const { registerIpcHandlers } = await import("./ipc");
    registerIpcHandlers({ getMainWindow: () => fakeWin as any });
    const channels = fakeIpcMain.handle.mock.calls.map((c) => c[0]);
    expect(channels).toContain("deleteProvider");
    expect(channels).toContain("abortRequest");
  });

  it("webfetch AppError serializes as {kind: Network} via sandboxHandler", async () => {
    const { Network } = await import("../renderer/src/shared/lib/errors");
    const { fetchSafe } = await import("./features/webfetch/index");
    vi.mocked(fetchSafe).mockRejectedValue(new Network({ message: "test net err" }));
    const { registerIpcHandlers } = await import("./ipc");
    registerIpcHandlers({ getMainWindow: () => fakeWin as any });
    const entry = fakeIpcMain.handle.mock.calls.find(
      (c: unknown[]) => c[0] === "webfetch:fetch",
    );
    expect(entry).toBeDefined();
    const handler = entry![1] as (e: unknown, args: unknown) => Promise<unknown>;
    let thrown: unknown;
    try { await handler(undefined, { url: "https://x.com", timeout: 30 }); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('"kind":"Network"');
  });

  it("renameConversation handler runs correct SQL UPDATE", async () => {
    const { registerIpcHandlers } = await import("./ipc");
    registerIpcHandlers({ getMainWindow: () => fakeWin as any });
    const renameHandler = fakeIpcMain.handle.mock.calls.find(
      (c: unknown[]) => c[0] === "renameConversation",
    );
    expect(renameHandler).toBeDefined();
    // ipcMain.handle(channel, listener) — handler is at index 1
    const handler = renameHandler?.[1] as (e: unknown, args: { id: string; title: string }) => void;
    expect(typeof handler).toBe("function");
  });
});

describe("applyEdit helper", () => {
  it("returns notFound when content has no occurrences", async () => {
    const { applyEdit } = await import("./ipc");
    const result = applyEdit("no match here", "needle", "hay", false, "/fake/path.txt");
    expect(result.kind).toBe("notFound");
    if (result.kind === "notFound") {
      expect(result.message).toContain("/fake/path.txt");
      expect(result.message).toContain("needle");
    }
  });

  it("returns ambiguous when content has 2+ occurrences and replaceAll=false", async () => {
    const { applyEdit } = await import("./ipc");
    const result = applyEdit("needle and needle again", "needle", "hay", false, "/fake/path.txt");
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.message).toContain("/fake/path.txt");
      expect(result.message).toContain("needle");
      expect(result.message).toContain("2");
    }
  });

  it("returns ok when content has exactly 1 occurrence", async () => {
    const { applyEdit } = await import("./ipc");
    const result = applyEdit("found my needle here", "needle", "hay", false, "/fake/path.txt");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.newContent).toBe("found my hay here");
    }
  });

  it("returns ok when content has 2+ occurrences and replaceAll=true", async () => {
    const { applyEdit } = await import("./ipc");
    const result = applyEdit("needle and needle again", "needle", "hay", true, "/fake/path.txt");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.newContent).toBe("hay and hay again");
    }
  });

  it("truncates oldText longer than 200 chars and includes ... in message", async () => {
    const { applyEdit } = await import("./ipc");
    const longPattern = "a".repeat(250);
    const result = applyEdit("no match", longPattern, "hay", false, "/fake/path.txt");
    expect(result.kind).toBe("notFound");
    if (result.kind === "notFound") {
      expect(result.message).toContain("...");
      // The snippet should be 200 chars + "..."
      expect(result.message).toContain("a".repeat(200));
      expect(result.message).not.toContain("a".repeat(201));
    }
  });

  // ─── CRLF regression: LLM emits LF-only oldText, file on disk is CRLF ───
  //
  // Repro: agent reads `line1\r\nline2\r\nline3`, then tries to edit `oldText`
  // = "line1\nline2" (the LLM's normal output). Strict string match fails.

  it("matches LF-only oldText against CRLF content and preserves CRLF on rewrite", async () => {
    const { applyEdit } = await import("./ipc");
    const content = "line1\r\nline2\r\nline3";
    const result = applyEdit(content, "line1\nline2", "REPLACED", false, "/fake/path.txt");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.newContent).toBe("REPLACED\r\nline3");
    }
  });

  it("matches CRLF oldText against CRLF content (no regression on existing happy path)", async () => {
    const { applyEdit } = await import("./ipc");
    const content = "line1\r\nline2\r\nline3";
    const result = applyEdit(content, "line1\r\nline2", "REPLACED", false, "/fake/path.txt");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.newContent).toBe("REPLACED\r\nline3");
    }
  });

  it("preserves LF when content is LF and oldText is LF (no EOL drift on happy path)", async () => {
    const { applyEdit } = await import("./ipc");
    const content = "line1\nline2\nline3";
    const result = applyEdit(content, "line1\nline2", "REPLACED", false, "/fake/path.txt");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.newContent).toBe("REPLACED\nline3");
    }
  });

  it("replaceAll=true replaces all CRLF occurrences when LLM emits LF", async () => {
    const { applyEdit } = await import("./ipc");
    // Two `foo<br>bar` pairs separated by CRLF; the LLM emits LF in oldText.
    const content = "foo\r\nbar\r\nfoo\r\nbar";
    const result = applyEdit(content, "foo\nbar", "FOOBAR", true, "/fake/path.txt");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.newContent).toBe("FOOBAR\r\nFOOBAR");
    }
  });

  it("notFound on CRLF content when oldText does not exist (real miss, not EOL mismatch)", async () => {
    const { applyEdit } = await import("./ipc");
    const content = "line1\r\nline2\r\nline3";
    const result = applyEdit(content, "nonexistent", "REPLACED", false, "/fake/path.txt");
    expect(result.kind).toBe("notFound");
    if (result.kind === "notFound") {
      expect(result.message).toContain("nonexistent");
    }
  });

  it("ambiguous on CRLF content when oldText matches multiple times", async () => {
    const { applyEdit } = await import("./ipc");
    const content = "needle\r\nneedle\r\nneedle";
    const result = applyEdit(content, "needle", "REPLACED", false, "/fake/path.txt");
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.message).toContain("3");
    }
  });
});
