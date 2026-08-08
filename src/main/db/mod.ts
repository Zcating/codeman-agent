/**
 * db/mod.ts - Effect Layer 版 db singleton
 *
 * SqliteLive: better-sqlite3 连接，提供 SqlClient + SqliteClient
 * MigrationsLive: 应用 .sql 迁移文件
 * DbLive = Layer.mergeAll(SqliteLive, MigrationsLive)
 *
 * PR-δ (ADR-0058): applyMigrationsEffect 内部 fs 调用改经 FileSystem service。
 * MigrationsLive 用 Layer.provide(NodeFileSystemLive) 注入 FileSystem，
 * R 收敛为 never，MigrationsLive 顶层不再泄漏 FileSystem 依赖。
 *
 * migrationsDir() 仍 sync（boot path, pre-runtime，无 service context），
 * fileURLToPath 保留 node:url import，existsSync 保留用于 boot path 探针
 * （见 ADR-0058 PR-δ C2）。
 */
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { app } from "electron";
import { Effect, Layer } from "effect";
import { FileSystem } from "@effect/platform";
import * as SqliteNS from "@effect/sql-sqlite-node/SqliteClient";
import { NodeFileSystemLive } from "../lib/file-system-node.js";

function dbPath(): string {
  return join(app.getPath("userData"), "codeman-agent.db");
}

/**
 * 解析 migrations 目录路径（dev / 打包后均兼容）。
 * ESM 下使用 import.meta.url，dev 时指向 src/main/db/migrations，
 * 打包后指向 dist-electron/main/db/migrations。
 *
 * 保留为 sync 函数：boot path 在 runtime 建立前调用，无 service context。
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
 * PR-δ: fs 调用走 FileSystem.FileSystem service。migrationsDir() 仍 sync
 * （boot path 探针，无 service context），existsSync 保留用于"目录是否存在"
 * 一次性检查。readdir / readFile 改为 yield* service 调用。
 *
 * Note: 使用 SqliteClient 而非 SqlClient — 两者在 @effect/sql-sqlite-node
 * 中指向同一个底层客户端，但 SqliteClient 是更稳定的 API surface。
 */
export const applyMigrationsEffect = Effect.gen(function* () {
  const sql = yield* SqliteNS.SqliteClient;
  const fs = yield* FileSystem.FileSystem;

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
  const files = (yield* fs.readDirectory(dir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  // 读取已应用迁移
  const appliedRows = (yield* sql.unsafe("SELECT name FROM _migrations")) as Array<{ name: string }>;
  const applied = new Set(appliedRows.map((r) => r.name));

  for (const f of files) {
    if (applied.has(f)) {
      continue;
    }
    const sqlText = yield* fs.readFileString(join(dir, f));
    // 执行迁移 SQL（按语句拆分：better-sqlite3 prepare 仅接受单语句）
    for (const stmt of splitSqlStatements(sqlText)) {
      yield* sql.unsafe(stmt).pipe(Effect.as(void 0));
    }
    // 记录迁移
    yield* sql.unsafe(
      "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)",
      [f, Date.now()]
    ).pipe(Effect.as(void 0));
  }
}).pipe(Effect.flatMap(() => Effect.void));

/**
 * 将 .sql 迁移文件按语句拆分（better-sqlite3 的 prepare 仅接受单语句）。
 * 处理: 单引号字符串（'' 转义）、-- 行注释；分号仅作语句分隔符。
 */
export function splitSqlStatements(sqlText: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inString = false;
  let i = 0;
  while (i < sqlText.length) {
    const ch = sqlText[i];
    const next = sqlText[i + 1];
    if (inString) {
      current += ch;
      if (ch === "'") {
        if (next === "'") {
          current += next;
          i++;
        } else {
          inString = false;
        }
      }
      i++;
      continue;
    }
    if (ch === "-" && next === "-") {
      // 跳过行注释
      while (i < sqlText.length && sqlText[i] !== "\n") {
        i++;
      }
      continue;
    }
    if (ch === "'") {
      inString = true;
      current += ch;
      i++;
      continue;
    }
    if (ch === ";") {
      const stmt = current.trim();
      if (stmt.length > 0) {
        statements.push(stmt);
      }
      current = "";
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  const tail = current.trim();
  if (tail.length > 0) {
    statements.push(tail);
  }
  return statements;
}

/**
 * MigrationsLive：在 SqliteLive 之后运行，执行迁移 + 开启 foreign_keys。
 *
 * PR-δ: applyMigrationsEffect 需要 FileSystem.FileSystem（读 migrations
 * 目录 + 读 .sql 文件）。MigrationsLive.pipe(Layer.provide(NodeFileSystemLive))
 * 把 FileSystem 注入内部 effect，R 收敛为 never。这样 DbLive 顶层 R 也保持
 * never，MainLive 不需为 MigrationsLive 额外提供 FileSystem。
 */
export const MigrationsLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const sql = yield* SqliteNS.SqliteClient;
    yield* sql.unsafe("PRAGMA foreign_keys = ON");
    yield* applyMigrationsEffect;
  }),
).pipe(Layer.provide(NodeFileSystemLive));

/**
 * DbLive = Layer.provide(Layer.mergeAll(SqliteLive, MigrationsLive), SqliteLive)。
 * Layer.provide 将 SqliteLive 注入合并层上下文，使 MigrationsLive 能访问 SqliteClient。
 * FileSystem 已由 MigrationsLive.pipe(Layer.provide(NodeFileSystemLive)) 内部注入，
 * DbLive 顶层 R 保持 never。
 */
export const DbLive = Layer.provide(
  Layer.mergeAll(SqliteLive, MigrationsLive),
  SqliteLive,
);