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
];

describe("T3 — src/main/ipc.ts", () => {
  beforeEach(() => {
    fakeIpcMain.handle.mockClear();
    fakeWin.webContents.send.mockClear();
  });

  it("registers all 34 expected ipcMain.handle channels (qa:get_table removed — handled by mock-server)", async () => {
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
});
