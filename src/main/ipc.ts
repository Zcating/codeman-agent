import { BrowserWindow } from "electron";

import { registerAutomationIpc } from "./features/automations/ipc.js";

export function registerIpcHandlers(_deps: {
  getMainWindow: () => BrowserWindow | null;
}): void {
  registerAutomationIpc();
}

export function emitStreamChunk(evt: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("stream-chunk", evt);
      return;
    }
  }
}
