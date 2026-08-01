import { app, Notification, shell, ipcMain } from "electron";

export function registerSystemIpc(): void {
  ipcMain.handle("setLoginItem", (_e, args: { enabled?: boolean } | null | undefined) => {
    app.setLoginItemSettings({ openAtLogin: !!(args && args.enabled) });
  });

  ipcMain.handle("notify", (_e, args: { title?: string; body?: string } | null | undefined) => {
    const title = args?.title ?? "";
    const body = args?.body ?? "";
    new Notification({ title, body }).show();
  });

  ipcMain.handle("openExternal", (_e, args: { url?: string } | null | undefined) => {
    const url = args?.url ?? "";
    return shell.openExternal(url);
  });

  ipcMain.handle("getLogPath", async () => {
    const { default: log } = await import("electron-log");
    return log.transports.file.getFile()?.path ?? null;
  });
}
