// T3 — electron/main/ipc.ts: register 24 ipcMain.handle channels + emitStreamChunk.
// Handler bodies are minimal stubs — T4a/T4b will wire real logic (settings/db/file-sandbox).

import { ipcMain, app, BrowserWindow, dialog, Notification, shell } from "electron";

const HANDLER_STUB = (): never => {
  throw { kind: "NotImplemented" as const, message: "wired in T4a/T4b" };
};

export function registerIpcHandlers(deps: {
  getMainWindow: () => BrowserWindow | null;
}): void {
  // Settings
  ipcMain.handle("get_settings", () => HANDLER_STUB());
  ipcMain.handle("update_settings", () => HANDLER_STUB());
  ipcMain.handle("clear_all_history", () => HANDLER_STUB());

  // Conversations
  ipcMain.handle("list_conversations", () => HANDLER_STUB());
  ipcMain.handle("get_conversation", () => HANDLER_STUB());
  ipcMain.handle("create_conversation", () => HANDLER_STUB());
  ipcMain.handle("archive_conversation", () => HANDLER_STUB());
  ipcMain.handle("delete_conversation", () => HANDLER_STUB());

  // Messages
  ipcMain.handle("list_messages", () => HANDLER_STUB());
  ipcMain.handle("append_message", () => HANDLER_STUB());
  ipcMain.handle("search_messages", () => HANDLER_STUB());

  // Workspaces
  ipcMain.handle("list_workspaces", () => HANDLER_STUB());
  ipcMain.handle("add_workspace", () => HANDLER_STUB());
  ipcMain.handle("rename_workspace", () => HANDLER_STUB());
  ipcMain.handle("delete_workspace", () => HANDLER_STUB());
  ipcMain.handle("pick_workspace_path", async () => {
    const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    return r.canceled ? null : r.filePaths[0];
  });

  // Filesystem
  ipcMain.handle("read_file", () => HANDLER_STUB());
  ipcMain.handle("write_file", () => HANDLER_STUB());
  ipcMain.handle("edit_file", () => HANDLER_STUB());
  ipcMain.handle("search_files", () => HANDLER_STUB());
  ipcMain.handle("delete_file", () => HANDLER_STUB());

  // Native shims
  ipcMain.handle("set_login_item", (_e, args) => {
    app.setLoginItemSettings({ openAtLogin: !!args?.enabled });
  });
  ipcMain.handle("notify", (_e, args) => {
    new Notification({ title: args?.title, body: args?.body }).show();
  });
  ipcMain.handle("open_external", (_e, args) => shell.openExternal(args?.url));
  ipcMain.handle("get_log_path", async () => {
    // Lazy-import to avoid eager electron-log init in non-Electron test env.
    const { default: log } = await import("electron-log");
    return log.transports.file.getFile()?.path;
  });

  // Suppress unused-parameter warning for deps (used by future T4+ code that
  // needs the main window reference for streaming).
  void deps;
}

/**
 * Forward a raw RuntimeEvent from main-process pi-mono subscription
 * to the renderer's preload-exposed onStreamChunk handler.
 * Per V3 consensus 1.1: main process owns the subscription lifecycle;
 * no intermediate queue. Sends to the first non-destroyed BrowserWindow
 * (single-window app, but resilient to mid-render destruction).
 */
export function emitStreamChunk(evt: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("stream-chunk", evt);
      return;
    }
  }
}
