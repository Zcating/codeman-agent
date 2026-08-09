/**
 * file-ops/data.ts
 *
 * file-ops 域数据访问层。
 * 仅 getWorkspaceById 一个函数（file-ops/ipc.ts 内部使用）。
 */

import { Effect } from "effect";
import { SqliteClient } from "@effect/sql-sqlite-node/SqliteClient";

import { Database } from "../../../renderer/src/shared/lib/errors.js";
import type { RawWorkspace } from "../workspaces/mappers.js";

// ---------------------------------------------------------------------------
// getWorkspaceById
// ---------------------------------------------------------------------------

/**
 * 根据 ID 查询工作空间。
 * not-found 时抛 plain Error（`Workspace not found: ${id}`），保留既有语义。
 */
export const getWorkspaceById = Effect.fn("getWorkspaceById")(function* (id: string) {
  const sql = yield* SqliteClient;
  const rows = (yield* sql
    .unsafe("SELECT * FROM workspaces WHERE id = ?", [id])
    .pipe(
      Effect.catchTag("SqlError", (e) =>
        Effect.fail(new Database({ message: e.message, cause: String(e.cause) }))
      )
    )) as RawWorkspace[];
  if (rows.length === 0) {
    return yield* Effect.fail(new Error(`Workspace not found: ${id}`));
  }
  return rows[0]!;
});
