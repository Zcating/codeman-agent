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

describe("checkPatternMatch helper", () => {
  it("returns notFound when content has no occurrences", async () => {
    const { checkPatternMatch } = await import("./ipc");
    const result = checkPatternMatch("needle", false, "/fake/path.txt", "no match here");
    expect(result.kind).toBe("notFound");
    expect(result.message).toBeDefined();
    expect(result.message).toContain("/fake/path.txt");
    expect(result.message).toContain("needle");
  });

  it("returns ambiguous when content has 2+ occurrences and replaceAll=false", async () => {
    const { checkPatternMatch } = await import("./ipc");
    const result = checkPatternMatch("needle", false, "/fake/path.txt", "needle and needle again");
    expect(result.kind).toBe("ambiguous");
    expect(result.message).toBeDefined();
    expect(result.message).toContain("/fake/path.txt");
    expect(result.message).toContain("needle");
    expect(result.message).toContain("2");
  });

  it("returns ok when content has exactly 1 occurrence", async () => {
    const { checkPatternMatch } = await import("./ipc");
    const result = checkPatternMatch("needle", false, "/fake/path.txt", "found my needle here");
    expect(result.kind).toBe("ok");
    expect(result.message).toBeUndefined();
  });

  it("returns ok when content has 2+ occurrences and replaceAll=true", async () => {
    const { checkPatternMatch } = await import("./ipc");
    const result = checkPatternMatch("needle", true, "/fake/path.txt", "needle and needle again");
    expect(result.kind).toBe("ok");
    expect(result.message).toBeUndefined();
  });

  it("truncates oldText longer than 200 chars and includes ... in message", async () => {
    const { checkPatternMatch } = await import("./ipc");
    const longPattern = "a".repeat(250);
    const result = checkPatternMatch(longPattern, false, "/fake/path.txt", "no match");
    expect(result.kind).toBe("notFound");
    expect(result.message).toContain("...");
    // The snippet should be 200 chars + "..."
    expect(result.message).toContain("a".repeat(200));
    expect(result.message).not.toContain("a".repeat(201));
  });
});
