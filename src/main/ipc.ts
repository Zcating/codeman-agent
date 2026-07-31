import { app, BrowserWindow } from "electron";
import { join } from "node:path";

import { getOrInitDatabase } from "./db/mod.js";
import { registerConversationsIpc } from "./features/conversations/ipc.js";
import { registerFileOpsIpc } from "./features/file-ops/ipc.js";
import { registerSettingsIpc } from "./features/settings/ipc.js";
import { SettingsState } from "./features/settings/state.js";
import { registerSystemIpc } from "./features/system/ipc.js";
import { CancelMap } from "./features/webfetch/cancel-map.js";
import { registerWebfetchIpc } from "./features/webfetch/ipc.js";
import { registerWorkspacesIpc } from "./features/workspaces/ipc.js";

const settingsState = new SettingsState(join(app.getPath("userData"), "settings.json"));
const cancelMap = new CancelMap();

export function registerIpcHandlers(_deps: {
  getMainWindow: () => BrowserWindow | null;
}): void {
  const db = getOrInitDatabase();
  settingsState.load();

  registerSettingsIpc({ settings: settingsState });
  registerConversationsIpc({ db });
  registerWorkspacesIpc({ db });
  registerFileOpsIpc({ db });
  registerSystemIpc();
  registerWebfetchIpc({ cancelMap });
}

export function emitStreamChunk(evt: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("stream-chunk", evt);
      return;
    }
  }
}
