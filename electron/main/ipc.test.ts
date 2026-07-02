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

const EXPECTED_CHANNELS = [
  // Settings
  "get_settings",
  "update_settings",
  "clear_all_history",
  // Conversations
  "list_conversations",
  "get_conversation",
  "create_conversation",
  "archive_conversation",
  "delete_conversation",
  // Messages
  "list_messages",
  "append_message",
  "search_messages",
  // Workspaces
  "list_workspaces",
  "add_workspace",
  "rename_workspace",
  "delete_workspace",
  "pick_workspace_path",
  // Filesystem
  "read_file",
  "write_file",
  "edit_file",
  "search_files",
  "delete_file",
  // Native shims
  "set_login_item",
  "notify",
  "open_external",
  "get_log_path",
];

describe("T3 — electron/main/ipc.ts", () => {
  beforeEach(() => {
    fakeIpcMain.handle.mockClear();
    fakeWin.webContents.send.mockClear();
  });

  it("registers all 24 expected ipcMain.handle channels", async () => {
    const { registerIpcHandlers } = await import("./ipc");
    registerIpcHandlers({ getMainWindow: () => fakeWin as any });
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
});
