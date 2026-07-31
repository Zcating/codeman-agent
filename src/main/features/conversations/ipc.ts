import { ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import type { Database as DB } from "better-sqlite3";
import {
  toConversation,
  toMessage,
  type RawConvRow,
  type RawMsgRow,
} from "../conversations/mappers.js";

export function registerConversationsIpc(deps: { db: DB }): void {
  ipcMain.handle("clearAllHistory", () => {
    deps.db.exec("DELETE FROM conversations");
  });

  ipcMain.handle("listConversations", (_e, args: { includeArchived?: boolean } | null | undefined) => {
    const include = !!(args && typeof args === "object" && args.includeArchived);
    const sql = include ? "SELECT * FROM conversations" : "SELECT * FROM conversations WHERE archived_at IS NULL";
    return (deps.db.prepare(sql).all() as RawConvRow[]).map(toConversation);
  });

  ipcMain.handle("getConversation", (_e, args: { id: string }) => {
    const row = deps.db.prepare("SELECT * FROM conversations WHERE id = ?").get(args.id) as RawConvRow | undefined;
    if (!row) {throw new Error(`Conversation not found: ${args.id}`);}
    return toConversation(row);
  });

  ipcMain.handle("createConversation", (_e, args: { title?: string; workspaceId?: string; systemPrompt?: string | null }) => {
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const title = args.title ?? "";
    const workspaceId = args.workspaceId ?? "";
    const systemPrompt = args.systemPrompt ?? null;
    deps.db
      .prepare(
        "INSERT INTO conversations (id, title, system_prompt, created_at, updated_at, archived_at, workspace_id) VALUES (?, ?, ?, ?, ?, NULL, ?)",
      )
      .run(id, title, systemPrompt, now, now, workspaceId);
    return toConversation({
      id,
      title,
      system_prompt: systemPrompt,
      created_at: now,
      updated_at: now,
      archived_at: null,
      workspace_id: workspaceId,
    });
  });

  ipcMain.handle("archiveConversation", (_e, args: { id: string }) => {
    deps.db.prepare("UPDATE conversations SET archived_at = ? WHERE id = ?").run(Math.floor(Date.now() / 1000), args.id);
  });

  ipcMain.handle("deleteConversation", (_e, args: { id: string }) => {
    deps.db.prepare("DELETE FROM conversations WHERE id = ?").run(args.id);
  });

  ipcMain.handle("renameConversation", (_e, args: { id: string; title: string }) => {
    deps.db.prepare("UPDATE conversations SET title = ? WHERE id = ?").run(args.title, args.id);
  });

  ipcMain.handle("listMessages", (_e, args: { conversationId?: string }) => {
    const convId = args.conversationId;
    if (!convId) {return [];}
    const rows = deps.db
      .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
      .all(convId) as RawMsgRow[];
    return rows.map(toMessage);
  });

  ipcMain.handle("appendMessage", (_e, args: {
    conversationId?: string;
    role: string;
    content: string;
    thinking?: string | null;
    toolCalls?: string;
    toolResults?: string;
    model?: string | null;
  }) => {
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const convId = args.conversationId ?? "";
    const thinking = args.thinking ?? null;
    const toolCalls = args.toolCalls ?? null;
    const toolResults = args.toolResults ?? null;
    deps.db
      .prepare(
        "INSERT INTO messages (id, conversation_id, role, content, thinking, tool_calls, tool_results, model, input_tokens, output_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)",
      )
      .run(id, convId, args.role, args.content, thinking, toolCalls, toolResults, args.model ?? null, now);
    return toMessage({
      id,
      conversation_id: convId,
      role: args.role,
      content: args.content,
      thinking,
      tool_calls: toolCalls,
      tool_results: toolResults,
      model: args.model ?? null,
      input_tokens: null,
      output_tokens: null,
      created_at: now,
    });
  });

  ipcMain.handle("searchMessages", (_e, args: { query: string; limit?: number }) => {
    const limit = args.limit ?? 20;
    try {
      const rows = deps.db
        .prepare(
          "SELECT m.* FROM messages m JOIN messages_fts f ON m.rowid = f.rowid WHERE messages_fts MATCH ? ORDER BY rank LIMIT ?",
        )
        .all(args.query, limit) as RawMsgRow[];
      return rows.map(toMessage);
    } catch {
      return [];
    }
  });
}
