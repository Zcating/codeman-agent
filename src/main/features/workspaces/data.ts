/**
 * workspaces/data.ts
 *
 * 域数据访问层：所有函数返回 Effect<A, E, SqliteClient>。
 * SQL 字符串逐字保留（经 sql.unsafe），mapper 继续用现有 mappers.ts。
 */

import { randomUUID } from "node:crypto";

import { Effect } from "effect";
import { SqliteClient } from "@effect/sql-sqlite-node/SqliteClient";

import { Database } from "../../../renderer/src/shared/lib/errors.js";
import { toWorkspace } from "./mappers.js";

/**
 * PR-δ (ADR-0058) C3: randomUUID 包装为 Effect.sync，统一 id 生成走 Effect 通道。
 */
const makeId = Effect.sync(() => randomUUID());

// ---------------------------------------------------------------------------
// listWorkspaces
// ---------------------------------------------------------------------------

/**
 * 列出所有工作空间，按创建时间倒序。
 */
export const listWorkspaces = Effect.fn("listWorkspaces")(function* () {
  const sql = yield* SqliteClient;
  const rows = (yield* sql
    .unsafe("SELECT * FROM workspaces ORDER BY created_at DESC")
    .pipe(
      Effect.catchTag("SqlError", (e) =>
        Effect.fail(new Database({ message: e.message, cause: String(e.cause) }))
      )
    )) as Array<{ id: string; label: string; root_path: string; created_at: number }>;
  return rows.map(toWorkspace);
});

// ---------------------------------------------------------------------------
// addWorkspace
// ---------------------------------------------------------------------------

export interface AddWorkspaceInput {
  label?: string;
  rootPath?: string;
}

/**
 * 添加工作空间。
 * SQL 错误时抛 plain Error（`addWorkspace failed: ${msg}`），保留既有 wrap 语义。
 */
export const addWorkspace = Effect.fn("addWorkspace")(function* (input: AddWorkspaceInput) {
  const sql = yield* SqliteClient;
  const id = yield* makeId;
  const now = Math.floor(Date.now() / 1000);
  const label = input.label ?? "Workspace";
  const rootPath = input.rootPath ?? "";

  yield* sql
    .unsafe(
      "INSERT INTO workspaces (id, label, root_path, created_at) VALUES (?, ?, ?, ?)",
      [id, label, rootPath, now]
    )
    .pipe(
      Effect.catchAll((cause: unknown) =>
        Effect.fail(
          new Error(
            `addWorkspace failed: ${cause instanceof Error ? cause.message : String(cause)}`
          )
        )
      )
    );

  return toWorkspace({ id, label, root_path: rootPath, created_at: now });
});

// ---------------------------------------------------------------------------
// renameWorkspace
// ---------------------------------------------------------------------------

export const renameWorkspace = Effect.fn("renameWorkspace")(function* (id: string, label: string) {
  const sql = yield* SqliteClient;
  yield* sql
    .unsafe("UPDATE workspaces SET label = ? WHERE id = ?", [
      label,
      id,
    ])
    .pipe(
      Effect.catchTag("SqlError", (e) =>
        Effect.fail(new Database({ message: e.message, cause: String(e.cause) }))
      )
    );
});

// ---------------------------------------------------------------------------
// deleteWorkspace
// ---------------------------------------------------------------------------

export const deleteWorkspace = Effect.fn("deleteWorkspace")(function* (id: string) {
  const sql = yield* SqliteClient;
  yield* sql
    .unsafe("DELETE FROM workspaces WHERE id = ?", [id])
    .pipe(
      Effect.catchTag("SqlError", (e) =>
        Effect.fail(new Database({ message: e.message, cause: String(e.cause) }))
      )
    );
});
