import { BrowserWindow } from "electron";

import { CancelMap } from "./features/webfetch/cancel-map.js";
import { registerWebfetchIpc } from "./features/webfetch/ipc.js";
import { registerAutomationIpc } from "./features/automations/ipc.js";

const cancelMap = new CancelMap();

export function registerIpcHandlers(_deps: {
  getMainWindow: () => BrowserWindow | null;
}): void {
  registerWebfetchIpc({ cancelMap });
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
