/**
 * workspaces/ipc.ts
 *
 * 删 db dep，删 better-sqlite3 import，删 try/catch wrap
 *（错误映射已在 data.ts 完成，行为等价）。
 */

import { ipcMain, dialog } from "electron";

import { runMain } from "../../runtime.js";
import {
  listWorkspaces,
  addWorkspace,
  renameWorkspace,
  deleteWorkspace,
} from "./data.js";

export function registerWorkspacesIpc(): void {
  ipcMain.handle("listWorkspaces", async () => {
    return runMain(listWorkspaces());
  });

  ipcMain.handle(
    "addWorkspace",
    async (_e, args: { label?: string; rootPath?: string }) => {
      return runMain(addWorkspace(args));
    }
  );

  ipcMain.handle(
    "renameWorkspace",
    async (_e, args: { id: string; label: string }) => {
      return runMain(renameWorkspace(args.id, args.label));
    }
  );

  ipcMain.handle("deleteWorkspace", async (_e, args: { id: string }) => {
    return runMain(deleteWorkspace(args.id));
  });

  ipcMain.handle("pickWorkspacePath", async () => {
    const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    return r.canceled ? null : r.filePaths[0] ?? null;
  });
}
