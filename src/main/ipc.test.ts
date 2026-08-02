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

vi.mock("./db/mod", () => ({
  getOrInitDatabase: () => ({
    prepare: () => ({ all: () => [], get: () => undefined, run: () => undefined }),
    exec: () => undefined,
    pragma: () => undefined,
  }),
}));

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

vi.mock("./mcp-config", () => ({
  readMcpConfig: vi.fn().mockReturnValue({
    _tag: "Some",
    value: { version: 1, servers: [] },
  }),
  MCP_CONFIG_PATH: "/tmp/.agents/mcp_servers.json",
}));

vi.mock("./features/webfetch/index", () => ({
  fetchSafe: vi.fn(),
}));

const EXPECTED_CHANNELS = [
  "getSettings",
  "updateSettings",
  "deleteProvider",
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
  "listWorkspaces",
  "addWorkspace",
  "renameWorkspace",
  "deleteWorkspace",
  "pickWorkspacePath",
  "readFile",
  "writeFile",
  "editFile",
  "searchFiles",
  "deleteFile",
  "setLoginItem",
  "notify",
  "openExternal",
  "getLogPath",
  "abortRequest",
  "webfetch:fetch",
  "mcp:list-servers",
  "mcp:get-tools",
  "mcp:get-all-tools",
  "mcp:enable",
  "mcp:restart",
  "mcp:call-tool",
  "mcp:open-config-dir",
  "compaction:list",
  "compaction:append",
  "skillsScan",
  "skillsLoad",
  "subAgents:list",
  "subAgents:add",
  "subAgents:update",
  "subAgents:delete",
  "subAgents:setEnabled",
];

describe("ipc.ts barrel", () => {
  beforeEach(() => {
    fakeIpcMain.handle.mockClear();
    fakeWin.webContents.send.mockClear();
  });

  it("registers all 45 expected ipcMain.handle channels", async () => {
    const { registerIpcHandlers } = await import("./ipc.js");
    const { McpManager } = await import("./features/mcp/mcp-manager.js");
    const { registerMcpIpcHandlers } = await import("./features/mcp/mcp-ipc.js");
    const { registerSkillsIpc } = await import("./features/skills/ipc.js");
    registerIpcHandlers({ getMainWindow: () => fakeWin as any });
    registerMcpIpcHandlers(new McpManager());
    registerSkillsIpc();
    const channels = fakeIpcMain.handle.mock.calls.map((c) => c[0]);
    expect(channels).toEqual(expect.arrayContaining(EXPECTED_CHANNELS));
    expect(channels.length).toBe(EXPECTED_CHANNELS.length);
  });

  it("emitStreamChunk forwards event to first window", async () => {
    const { emitStreamChunk } = await import("./ipc.js");
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
    const { emitStreamChunk } = await import("./ipc.js");
    emitStreamChunk({ kind: "x" });
    expect(destroyed.webContents.send).not.toHaveBeenCalled();
    expect(fakeWin.webContents.send).toHaveBeenCalled();
  });
});
