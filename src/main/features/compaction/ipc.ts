import { ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import type { Database as DB } from "better-sqlite3";
import { toCompactionEntry, fromCompactionEntry, type CompactionEntry } from "./mappers.js";

export function registerCompactionIpc(deps: { db: DB }): void {
  ipcMain.handle("compaction:list", (_e, args: { conversationId?: string }) => {
    const convId = args.conversationId;
    if (!convId) {return [];}
    const rows = deps.db.prepare(
      "SELECT * FROM compaction_entries WHERE conversation_id = ? ORDER BY created_at ASC",
    ).all(convId) as Parameters<typeof toCompactionEntry>[0][];
    return rows.map(toCompactionEntry);
  });

  ipcMain.handle("compaction:append", async (_e, args: {
    conversationId?: string;
    summary: string;
    model: string;
    tokensBefore: number;
    kind: "auto" | "manual";
    firstKeptMessageId: string;
  }) => {
    const id = randomUUID();
    const now = Date.now();
    const convId = args?.conversationId ?? "";
    const entry: CompactionEntry = {
      id,
      conversationId: convId,
      summary: args.summary,
      model: args.model,
      tokensBefore: args.tokensBefore,
      kind: args.kind,
      createdAt: now,
      firstKeptMessageId: args.firstKeptMessageId,
    };
    try {
      deps.db.prepare(
        "INSERT INTO compaction_entries (id, conversation_id, summary, model, tokens_before, kind, created_at, first_kept_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(...fromCompactionEntry(entry));
    } catch (e: unknown) {
      if (e && typeof e === "object" && "code" in e) {
        throw new Error(JSON.stringify({ kind: "Database", message: String(e) }));
      }
      throw e;
    }
    return entry;
  });
}
