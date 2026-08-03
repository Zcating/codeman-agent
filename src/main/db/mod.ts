
/**
 * db/mod.ts - Effect Layer 版 db singleton
 *
 * SqliteLive: better-sqlite3 连接，提供 SqlClient + SqliteClient
 * MigrationsLive: 应用 .sql 迁移文件
 * DbLive = Layer.mergeAll(SqliteLive, MigrationsLive)
 */

import { join, dirname } from "node:path";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { app } from "electron";
import { Effect, Layer } from "effect";
import * as SqliteNS from "@effect/sql-sqlite-node/SqliteClient";

function dbPath(): string {
  return join(app.getPath("userData"), "codeman-agent.db");
}

/**
 * 解析 migrations 目录路径（dev / 打包后均兼容）。
 * ESM 下使用 import.meta.url，dev 时指向 src/main/db/migrations，
 * 打包后指向 dist-electron/main/db/migrations。
 */
function migrationsDir(): string {
  // 尝试 ESM 方式（打包后）
  let base: string;
  try {
    base = dirname(fileURLToPath(import.meta.url));
  } catch {
    // fallback 到 __dirname（dev 环境）
    base = dirname("");
  }
  const distPath = join(base, "db", "migrations");
  if (existsSync(distPath)) {
    return distPath;
  }
  // dev 路径：项目根/src/main/db/migrations
  return join(base, "..", "..", "src", "main", "db", "migrations");
}

// ---------------------------------------------------------------------------
// SqliteLive
// ---------------------------------------------------------------------------

/**
 * Sqlite Live Layer。
 * - journal_mode = WAL 由包内建启用
 * - foreign_keys = ON 由 MigrationsLive 显式开启
 */
export const SqliteLive = SqliteNS.layer({
  filename: dbPath(),
});

// ---------------------------------------------------------------------------
// MigrationsLive
// ---------------------------------------------------------------------------

/**
 * 应用 db/migrations/*.sql。
 * 语义复刻原有 applyMigrations：
 * - 建 _migrations 表（name TEXT PRIMARY KEY, applied_at INTEGER）
 * - 按文件名升序逐个执行未应用迁移
 * - 幂等：已应用的跳过
 *
 * Note: 使用 SqliteClient 而非 SqlClient — 两者在 @effect/sql-sqlite-node
 * 中指向同一个底层客户端，但 SqliteClient 是更稳定的 API surface。
 */
export const applyMigrationsEffect = Effect.gen(function* () {
  const sql = yield* SqliteNS.SqliteClient;

  // 建 _migrations 表（若不存在）
  yield* sql.unsafe(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);

  // 读取 migrations 目录
  const dir = migrationsDir();
  if (!existsSync(dir)) {
    return;
  }
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  // 读取已应用迁移
  const appliedRows = (yield* sql.unsafe("SELECT name FROM _migrations")) as Array<{ name: string }>;
  const applied = new Set(appliedRows.map((r) => r.name));

  for (const f of files) {
    if (applied.has(f)) {
      continue;
    }
    const sqlText = readFileSync(join(dir, f), "utf-8");
    // 执行迁移 SQL
    yield* sql.unsafe(sqlText).pipe(
      Effect.as(void 0)
    );
    // 记录迁移
    yield* sql.unsafe(
      "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)"
    ).pipe(
      Effect.as(void 0)
    );
  }
}).pipe(Effect.flatMap(() => Effect.void));

/**
 * MigrationsLive：在 SqliteLive 之后运行，执行迁移 + 开启 foreign_keys。
 * 由 DbLive = Layer.provide(Layer.mergeAll(SqliteLive, MigrationsLive), SqliteLive) 提供 SqliteClient。
 */
export const MigrationsLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const sql = yield* SqliteNS.SqliteClient;
    yield* sql.unsafe("PRAGMA foreign_keys = ON");
    yield* applyMigrationsEffect;
  })
);

/**
 * DbLive = Layer.provide(Layer.mergeAll(SqliteLive, MigrationsLive), SqliteLive)。
 * Layer.provide 将 SqliteLive 注入合并层上下文，使 MigrationsLive 能访问 SqliteClient。
 */
export const DbLive = Layer.provide(
  Layer.mergeAll(SqliteLive, MigrationsLive),
  SqliteLive
);
