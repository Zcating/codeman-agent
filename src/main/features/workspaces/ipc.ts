import { ipcMain, dialog } from "electron";
import { randomUUID } from "node:crypto";
import type { Database as DB } from "better-sqlite3";
import { toWorkspace, type RawWorkspace } from "../workspaces/mappers.js";

export function registerWorkspacesIpc(deps: { db: DB }): void {
  ipcMain.handle("listWorkspaces", () => {
    const rows = deps.db
      .prepare("SELECT * FROM workspaces ORDER BY created_at DESC")
      .all() as RawWorkspace[];
    return rows.map(toWorkspace);
  });

  ipcMain.handle("addWorkspace", (_e, args: { label?: string; rootPath?: string }) => {
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const label = args.label ?? "Workspace";
    const rootPath = args.rootPath ?? "";
    try {
      deps.db
        .prepare("INSERT INTO workspaces (id, label, root_path, created_at) VALUES (?, ?, ?, ?)")
        .run(id, label, rootPath, now);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`addWorkspace failed: ${msg}`);
    }
    return toWorkspace({ id, label, root_path: rootPath, created_at: now });
  });

  ipcMain.handle("renameWorkspace", (_e, args: { id: string; label: string }) => {
    deps.db.prepare("UPDATE workspaces SET label = ? WHERE id = ?").run(args.label, args.id);
  });

  ipcMain.handle("deleteWorkspace", (_e, args: { id: string }) => {
    deps.db.prepare("DELETE FROM workspaces WHERE id = ?").run(args.id);
  });

  ipcMain.handle("pickWorkspacePath", async () => {
    const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    return r.canceled ? null : r.filePaths[0] ?? null;
  });
}
