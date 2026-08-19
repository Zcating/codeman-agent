/**
 * conversations/data.ts
 *
 * 域数据访问层：所有函数返回 Effect<A, E, SqliteClient>。
 * SQL 字符串逐字保留（经 sql.unsafe），mapper 继续用现有 mappers.ts。
 */

import { randomUUID } from "node:crypto";

import { Effect } from "effect";
import { SqliteClient } from "@effect/sql-sqlite-node/SqliteClient";

import { Database } from "../../../renderer/src/shared/lib/errors.js";

/**
 * PR-δ  C3: randomUUID 包装为 Effect.sync，统一 id 生成走 Effect 通道。
 * scrape-registry.ts / cq-data-store.ts 保留 sync 调用（D7）。
 */
const makeId = Effect.sync(() => randomUUID());
import {
  toConversation,
  toMessage,
  type Conversation,
  type Message,
  type RawConvRow,
  type RawMsgRow,
} from "./mappers.js";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** 映射原始行 → 域对象。*/
function mapConv(row: RawConvRow): Conversation {
  return toConversation(row);
}
function mapMsg(row: RawMsgRow): Message {
  return toMessage(row);
}

// ---------------------------------------------------------------------------
// listConversations
// ---------------------------------------------------------------------------

/**
 * 列出对话。
 * @param includeArchived 是否包含已归档（默认 false）
 */
export const listConversations = Effect.fn("listConversations")(function* (
  includeArchived: boolean,
) {
  const sql = yield* SqliteClient;
  const sqlText = includeArchived
    ? "SELECT * FROM conversations"
    : "SELECT * FROM conversations WHERE archived_at IS NULL";
  const rows = (yield* sql.unsafe(sqlText).pipe(
    Effect.catchTag("SqlError", (e) =>
      Effect.fail(new Database({ message: e.message, cause: String(e.cause) }))
    )
  )) as RawConvRow[];
  return rows.map(mapConv);
});

// ---------------------------------------------------------------------------
// getConversation
// ---------------------------------------------------------------------------

/**
 * 获取单个对话，not-found 抛 plain Error（与原有语义一致）。
 */
export const getConversation = Effect.fn("getConversation")(function* (id: string) {
  const sql = yield* SqliteClient;
  const rows = (yield* sql
    .unsafe("SELECT * FROM conversations WHERE id = ?", [id])
    .pipe(
      Effect.catchTag("SqlError", (e) =>
        Effect.fail(new Database({ message: e.message, cause: String(e.cause) }))
      )
    )) as RawConvRow[];
  if (rows.length === 0) {
    return yield* Effect.fail(new Error(`Conversation not found: ${id}`));
  }
  return mapConv(rows[0]!);
});

// ---------------------------------------------------------------------------
// createConversation
// ---------------------------------------------------------------------------

export interface CreateConversationInput {
  title?: string;
  workspaceId?: string;
  systemPrompt?: string | null;
}

/**
 * 创建对话。
 * 返回映射后的域对象（与原有 toConversation 行为一致）。
 */
export const createConversation = Effect.fn("createConversation")(function* (
  input: CreateConversationInput,
) {
  const sql = yield* SqliteClient;
  const id = yield* makeId;
  const now = Math.floor(Date.now() / 1000);
  const title = input.title ?? "";
  const workspaceId = input.workspaceId ?? "";
  const systemPrompt = input.systemPrompt ?? null;

  yield* sql
    .unsafe(
      "INSERT INTO conversations (id, title, system_prompt, created_at, updated_at, archived_at, workspace_id) VALUES (?, ?, ?, ?, ?, NULL, ?)",
      [id, title, systemPrompt, now, now, workspaceId]
    )
    .pipe(
      Effect.catchTag("SqlError", (e) =>
        Effect.fail(new Database({ message: e.message, cause: String(e.cause) }))
      )
    );

  return mapConv({
    id,
    title,
    system_prompt: systemPrompt,
    created_at: now,
    updated_at: now,
    archived_at: null,
    workspace_id: workspaceId,
  });
});

// ---------------------------------------------------------------------------
// archiveConversation
// ---------------------------------------------------------------------------

export const archiveConversation = Effect.fn("archiveConversation")(function* (id: string) {
  const sql = yield* SqliteClient;
  yield* sql
    .unsafe(
      "UPDATE conversations SET archived_at = ? WHERE id = ?",
      [Math.floor(Date.now() / 1000), id]
    )
    .pipe(
      Effect.catchTag("SqlError", (e) =>
        Effect.fail(new Database({ message: e.message, cause: String(e.cause) }))
      )
    );
});

// ---------------------------------------------------------------------------
// deleteConversation
// ---------------------------------------------------------------------------

export const deleteConversation = Effect.fn("deleteConversation")(function* (id: string) {
  const sql = yield* SqliteClient;
  yield* sql.unsafe("DELETE FROM conversations WHERE id = ?", [id]).pipe(
    Effect.catchTag("SqlError", (e) =>
      Effect.fail(new Database({ message: e.message, cause: String(e.cause) }))
    )
  );
});

// ---------------------------------------------------------------------------
// renameConversation
// ---------------------------------------------------------------------------

export const renameConversation = Effect.fn("renameConversation")(function* (
  id: string,
  title: string,
) {
  const sql = yield* SqliteClient;
  yield* sql
    .unsafe("UPDATE conversations SET title = ? WHERE id = ?", [
      title,
      id,
    ])
    .pipe(
      Effect.catchTag("SqlError", (e) =>
        Effect.fail(new Database({ message: e.message, cause: String(e.cause) }))
      )
    );
});

// ---------------------------------------------------------------------------
// listMessages
// ---------------------------------------------------------------------------

/**
 * 列出某对话的所有消息。
 * @param conversationId 对话 ID，为空则返回 []
 */
export const listMessages = Effect.fn("listMessages")(function* (conversationId: string) {
  if (!conversationId) {
    return yield* Effect.succeed([]);
  }
  const sql = yield* SqliteClient;
  const rows = (yield* sql
    .unsafe(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
      [conversationId]
    )
    .pipe(
      Effect.catchTag("SqlError", (e) =>
        Effect.fail(new Database({ message: e.message, cause: String(e.cause) }))
      )
    )) as RawMsgRow[];
  return rows.map(mapMsg);
});

// ---------------------------------------------------------------------------
// appendMessage
// ---------------------------------------------------------------------------

export interface AppendMessageInput {
  conversationId?: string;
  role: string;
  content: string;
  thinking?: string | null;
  toolCalls?: string | null;
  toolResults?: string | null;
  model?: string | null;
}

/**
 * 追加消息到对话。
 */
export const appendMessage = Effect.fn("appendMessage")(function* (input: AppendMessageInput) {
  const sql = yield* SqliteClient;
  const id = yield* makeId;
  const now = Math.floor(Date.now() / 1000);
  const convId = input.conversationId ?? "";
  const thinking = input.thinking ?? null;
  const toolCalls = input.toolCalls ?? null;
  const toolResults = input.toolResults ?? null;

  yield* sql
    .unsafe(
      "INSERT INTO messages (id, conversation_id, role, content, thinking, tool_calls, tool_results, model, input_tokens, output_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)",
      [
        id,
        convId,
        input.role,
        input.content,
        thinking,
        toolCalls,
        toolResults,
        input.model ?? null,
        now,
      ]
    )
    .pipe(
      Effect.catchTag("SqlError", (e) =>
        Effect.fail(new Database({ message: e.message, cause: String(e.cause) }))
      )
    );

  return mapMsg({
    id,
    conversation_id: convId,
    role: input.role,
    content: input.content,
    thinking,
    tool_calls: toolCalls,
    tool_results: toolResults,
    model: input.model ?? null,
    input_tokens: null,
    output_tokens: null,
    created_at: now,
  });
});

// ---------------------------------------------------------------------------
// searchMessages
// ---------------------------------------------------------------------------

/**
 * FTS 全文搜索。
 * FTS 语法错误时返回 []（try/catch 语义与原有 ipc.ts 一致）。
 */
export const searchMessages = Effect.fn("searchMessages")(function* (
  query: string,
  limit: number = 20,
) {
  const sql = yield* SqliteClient;
  const rows = (yield* sql
    .unsafe(
      "SELECT m.* FROM messages m JOIN messages_fts f ON m.rowid = f.rowid WHERE messages_fts MATCH ? ORDER BY rank LIMIT ?",
      [query, limit]
    )
    .pipe(
      Effect.catchTag("SqlError", (e) =>
        Effect.fail(new Database({ message: e.message, cause: String(e.cause) }))
      )
    )) as RawMsgRow[];
  return rows.map(mapMsg);
});

/**
 * 带 try/catch 的 FTS 搜索版本：FTS 失败时返回 []。
 */
export const searchMessagesSafe = Effect.fn("searchMessagesSafe")(function* (
  query: string,
  limit: number = 20,
) {
  const sql = yield* SqliteClient;
  const rows = (yield* sql
    .unsafe(
      "SELECT m.* FROM messages m JOIN messages_fts f ON m.rowid = f.rowid WHERE messages_fts MATCH ? ORDER BY rank LIMIT ?",
      [query, limit]
    )
    .pipe(Effect.catchAll(() => Effect.succeed([])))) as RawMsgRow[];
  return rows.map(mapMsg);
});

// ---------------------------------------------------------------------------
// clearAllHistory
// ---------------------------------------------------------------------------

/**
 * 清空所有对话（DELETE FROM conversations）。
 */
export const clearAllHistory = Effect.fn("clearAllHistory")(function* () {
  const sql = yield* SqliteClient;
  yield* sql.unsafe("DELETE FROM conversations").pipe(
    Effect.catchTag("SqlError", (e) =>
      Effect.fail(new Database({ message: e.message, cause: String(e.cause) }))
    )
  );
});
