/**
 * compaction/ipc.ts
 *
 * ADR-0046 D3: 接线到 data.ts Effect 函数，经 runMain 边界执行。
 * 删 db dep，删 better-sqlite3 import，删 try/catch wrap
 *（Database AppError 映射已在 data.ts 完成，行为等价）。
 */

import { ipcMain } from "electron";

import { runMain } from "../../runtime.js";
import { listCompactionEntries, appendCompactionEntry } from "./data.js";

export function registerCompactionIpc(): void {
  ipcMain.handle(
    "compaction:list",
    async (_e, args: { conversationId?: string }) => {
      return runMain(listCompactionEntries(args.conversationId ?? ""));
    }
  );

  ipcMain.handle(
    "compaction:append",
    async (
      _e,
      args: {
        conversationId?: string;
        summary: string;
        model: string;
        tokensBefore: number;
        kind: "auto" | "manual";
        firstKeptMessageId: string;
      }
    ) => {
      return runMain(appendCompactionEntry(args));
    }
  );
}
