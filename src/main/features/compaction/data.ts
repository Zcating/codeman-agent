/**
 * compaction/data.ts
 *
 * 域数据访问层：所有函数返回 Effect<A, E, SqliteClient>。
 * SQL 错误映射为 Database AppError。
 */

import { Effect } from "effect";
import { SqliteClient } from "@effect/sql-sqlite-node/SqliteClient";

import { Database } from "../../../renderer/src/shared/lib/errors.js";
import {
  toCompactionEntry,
  fromCompactionEntry,
  type CompactionEntry,
} from "./mappers.js";

// ---------------------------------------------------------------------------
// listCompactionEntries
// ---------------------------------------------------------------------------

/**
 * 列出某对话的压缩记录，按创建时间升序。
 * @param conversationId 对话 ID，为空则返回 []
 */
export const listCompactionEntries = Effect.fn("listCompactionEntries")(function* (
  conversationId: string,
) {
  if (!conversationId) {
    return yield* Effect.succeed([]);
  }
  const sql = yield* SqliteClient;
  const rows = (yield* sql
    .unsafe(
      "SELECT * FROM compaction_entries WHERE conversation_id = ? ORDER BY created_at ASC",
      [conversationId]
    )
    .pipe(
      Effect.catchTag("SqlError", (e) =>
        Effect.fail(new Database({ message: e.message, cause: String(e.cause) }))
      )
    )) as Array<{
    id: string;
    conversation_id: string;
    summary: string;
    model: string;
    tokens_before: number;
    kind: string;
    created_at: number;
    first_kept_message_id: string;
  }>;
  return rows.map(toCompactionEntry);
});

// ---------------------------------------------------------------------------
// appendCompactionEntry
// ---------------------------------------------------------------------------

export interface AppendCompactionEntryInput {
  conversationId?: string;
  summary: string;
  model: string;
  tokensBefore: number;
  kind: "auto" | "manual";
  firstKeptMessageId: string;
}

/**
 * 追加压缩记录。
 * SQL 错误映射为 Database AppError（保留既有 wrap 语义）。
 */
export const appendCompactionEntry = Effect.fn("appendCompactionEntry")(function* (
  input: AppendCompactionEntryInput,
) {
  const sql = yield* SqliteClient;
  const id = crypto.randomUUID();
  const now = Date.now();
  const convId = input.conversationId ?? "";

  const entry: CompactionEntry = {
    id,
    conversationId: convId,
    summary: input.summary,
    model: input.model,
    tokensBefore: input.tokensBefore,
    kind: input.kind,
    createdAt: now,
    firstKeptMessageId: input.firstKeptMessageId,
  };

  yield* sql
    .unsafe(
      "INSERT INTO compaction_entries (id, conversation_id, summary, model, tokens_before, kind, created_at, first_kept_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      fromCompactionEntry(entry)
    )
    .pipe(
      Effect.catchTag("SqlError", (e) =>
        Effect.fail(
          new Database({
            message: e.message,
            cause: String(e.cause),
          })
        )
      )
    );

  return entry;
});
