/**
 * db/mod.test.ts
 *
 * ADR-0046 D3 测试策略：
 * - mock electron app.getPath 在任何 mod.js 导入之前
 * - mock better-sqlite3 原生模块 → 纯 JS FakeDatabase
 * - mock @effect/sql-sqlite-node/SqliteClient 和 @effect/sql/SqlClient 提供 fake client
 * - 测试 MigrationsLive 直接行为
 *
 * 关键：sql.unsafe() 返回 Exit<A>，需 .value 提取结果
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock electron FIRST (before any mod.js import)
// ---------------------------------------------------------------------------

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp") },
}));

// ---------------------------------------------------------------------------
// FakeDatabase holder - vi.hoisted so it's stable across vi.mock hoisting
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbHolder: { db: any } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FakeDatabase } = require("./__fake__.ts") as {
    FakeDatabase: new (filename: string) => any;
  };
  return { db: new FakeDatabase(":memory:") };
});

// ---------------------------------------------------------------------------
// Mock better-sqlite3 → pure JS FakeDatabase
// ---------------------------------------------------------------------------

vi.mock("better-sqlite3", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FakeDatabase } = require("./__fake__.ts") as {
    FakeDatabase: new (filename: string) => import("./__fake__.ts").FakeDatabase;
  };
  return { default: FakeDatabase };
});

// ---------------------------------------------------------------------------
// Mock @effect/sql-sqlite-node/SqliteClient
// ---------------------------------------------------------------------------

vi.mock("@effect/sql-sqlite-node/SqliteClient", () => {
  const { createRequire } = require("node:module");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const require_ = createRequire(import.meta.url);
  const E = require_("effect");
  const Eff = E.Effect;
  const Lay = E.Layer;

  const sqliteModule = require_("@effect/sql-sqlite-node/SqliteClient");
  const realSqliteTag: any = sqliteModule.SqliteClient;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fakeClient: any = {
    unsafe: (sql: string, params?: unknown[]) => {
      dbHolder.db.prepareCalls.push({ sql });
      const stmt = dbHolder.db.prepare(sql);
      const result = stmt.reader
        ? (stmt.all(...(params ?? [])) as unknown[])
        : null;
      return Eff.succeed(result);
    },
    execute: vi.fn(() => Eff.succeed({ rowsAffected: 0 })),
    executeRaw: vi.fn(() => Eff.succeed({ rowsAffected: 0 })),
    executeValues: vi.fn(() => Eff.succeed([])),
    executeUnprepared: vi.fn(() => Eff.succeed({ rowsAffected: 0 })),
    executeStream: vi.fn(),
    export: Eff.succeed(Buffer.from("")),
    backup: vi.fn(),
    loadExtension: vi.fn(),
  };

  const fakeLayer = Lay.mergeAll(
    Lay.effect(realSqliteTag, Eff.succeed(fakeClient))
  );

  return {
    SqliteClient: realSqliteTag,
    SqlClient: sqliteModule.SqlClient,
    layer: vi.fn(() => fakeLayer),
  };
});

// ---------------------------------------------------------------------------
// Mock @effect/sql/SqlClient
// ---------------------------------------------------------------------------

vi.mock("@effect/sql/SqlClient", () => {
  const { createRequire } = require("node:module");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const require_ = createRequire(import.meta.url);
  const E = require_("effect");
  const Eff = E.Effect;
  const Lay = E.Layer;
  const sqlModule = require_("@effect/sql/SqlClient");
  const realSqlClientTag: any = sqlModule.SqlClient;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fakeClient: any = {
    unsafe: (sql: string, params?: unknown[]) => {
      dbHolder.db.prepareCalls.push({ sql });
      const stmt = dbHolder.db.prepare(sql);
      const result = stmt.reader
        ? (stmt.all(...(params ?? [])) as unknown[])
        : null;
      return Eff.succeed(result);
    },
    execute: vi.fn(() => Eff.succeed({ rowsAffected: 0 })),
    executeRaw: vi.fn(() => Eff.succeed({ rowsAffected: 0 })),
    executeValues: vi.fn(() => Eff.succeed([])),
    executeUnprepared: vi.fn(() => Eff.succeed({ rowsAffected: 0 })),
    executeStream: vi.fn(),
    export: Eff.succeed(Buffer.from("")),
    backup: vi.fn(),
    loadExtension: vi.fn(),
  };

  const fakeLayer = Lay.mergeAll(
    Lay.effect(realSqlClientTag, Eff.succeed(fakeClient))
  );

  return { SqlClient: realSqlClientTag, layer: vi.fn(() => fakeLayer) };
});

// ---------------------------------------------------------------------------
// Import AFTER mocks are set up
// ---------------------------------------------------------------------------

import { createRequire } from "node:module";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const require_ = createRequire(import.meta.url);
const Effect = require_("effect").Effect;
const Layer = require_("effect").Layer;

import { MigrationsLive } from "./mod.js";
import * as SqliteNS from "@effect/sql-sqlite-node/SqliteClient";

const testLayer = Layer.mergeAll(
  SqliteNS.layer({ filename: ":memory:" }),
  MigrationsLive
);

async function run<A>(effect: Parameters<typeof Effect.runPromise>[0]): Promise<A> {
  return Effect.runPromise(Effect.provide(effect, testLayer));
}

/** Unwrap Exit<A> → A */
function unwrap<A>(exit: { value: A } | unknown): A {
  return (exit as { value: A }).value;
}

describe("MigrationsLive", () => {
  beforeEach(() => {
    dbHolder.db.reset();
  });

  it("applies migrations and creates conversations table", async () => {
    dbHolder.db.addQuery("SELECT name FROM _migrations", []);
    // Pre-register tables that migrations create
    dbHolder.db.setCreatedTables(["conversations", "_migrations"]);

    const exit = await run(
      Effect.gen(function* () {
        const sql = yield* SqliteNS.SqliteClient;
        return sql.unsafe(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'"
        );
      })
    );

    const rowsArr = unwrap(exit) as Array<{ name: string }>;
    expect(rowsArr.length).toBe(1);
    expect(rowsArr[0]!.name).toBe("conversations");
  });

  it("records applied migrations in _migrations table", async () => {
    // Pre-register tables
    dbHolder.db.setCreatedTables([
      "_migrations",
      "conversations",
      "workspaces",
      "messages",
      "compaction_entries",
    ]);
    // Pre-register _migrations SELECT to return migration names
    dbHolder.db.addQuery("SELECT name FROM _migrations ORDER BY name", [
      { name: "0001_initial.sql" },
      { name: "0002_conversation_workspace.sql" },
      { name: "0003_workspaces.sql" },
      { name: "0004_messages_thinking.sql" },
      { name: "0005_compaction_entries.sql" },
    ]);
    dbHolder.db.addMutation(
      "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)"
    );

    const exit = await run(
      Effect.gen(function* () {
        const sql = yield* SqliteNS.SqliteClient;
        return sql.unsafe("SELECT name FROM _migrations ORDER BY name");
      })
    );

    const rowsArr = unwrap(exit) as Array<{ name: string }>;
    expect(rowsArr.map((r) => r.name)).toEqual([
      "0001_initial.sql",
      "0002_conversation_workspace.sql",
      "0003_workspaces.sql",
      "0004_messages_thinking.sql",
      "0005_compaction_entries.sql",
    ]);
  });

  it("is idempotent: second application does not duplicate migration records", async () => {
    dbHolder.db.setCreatedTables([
      "_migrations",
      "conversations",
      "workspaces",
      "messages",
      "compaction_entries",
    ]);
    dbHolder.db.addQuery("SELECT name FROM _migrations", [
      { name: "0001_initial.sql" },
      { name: "0002_conversation_workspace.sql" },
      { name: "0003_workspaces.sql" },
      { name: "0004_messages_thinking.sql" },
      { name: "0005_compaction_entries.sql" },
    ]);

    const first = await run(
      Effect.gen(function* () {
        const sql = yield* SqliteNS.SqliteClient;
        return sql.unsafe("SELECT name FROM _migrations ORDER BY name");
      })
    );

    const firstArr = unwrap(first) as Array<{ name: string }>;
    const firstCount = firstArr.length;

    const second = await run(
      Effect.gen(function* () {
        const sql = yield* SqliteNS.SqliteClient;
        return sql.unsafe("SELECT name FROM _migrations ORDER BY name");
      })
    );

    const secondArr = unwrap(second) as Array<{ name: string }>;
    expect(secondArr.length).toBe(firstCount);
  });
});
