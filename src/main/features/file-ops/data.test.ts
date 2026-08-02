/**
 * file-ops/data.test.ts
 *
 * ADR-0046 D3 测试策略：
 * - mock better-sqlite3 原生模块 → 纯 JS FakeDatabase
 * - 真实 SqliteClient Tag 提供 fakeDb client
 * - 预注册查询结果
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRequire } from "node:module";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const require_ = createRequire(import.meta.url);
const Effect = require_("effect").Effect;

const fakeDb = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FakeDatabase } = require("../../db/__fake__.ts") as {
    FakeDatabase: new (filename: string) => import("../../db/__fake__.ts").FakeDatabase;
  };
  const db = new FakeDatabase(":memory:");
  return db;
});

vi.mock("better-sqlite3", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FakeDatabase } = require("../../db/__fake__.ts") as {
    FakeDatabase: new (filename: string) => import("../../db/__fake__.ts").FakeDatabase;
  };
  return { default: FakeDatabase };
});

vi.mock("@effect/sql-sqlite-node/SqliteClient", () => {
  const { createRequire } = require("node:module");
  const require_ = createRequire(import.meta.url);
  const E = require_("effect");
  const Eff = E.Effect;
  const Lay = E.Layer;
  const Ctx = E.Context;

  const sqliteModule = require_("@effect/sql-sqlite-node/SqliteClient");
  const realSqliteTag: any = sqliteModule.SqliteClient;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fakeClient: any = {
    unsafe: (sql: string, params?: unknown[]) => {
      fakeDb.prepareCalls.push({ sql });
      const stmt = fakeDb.prepare(sql);
      return Eff.succeed(
        stmt.reader ? (stmt.all(...(params ?? [])) as unknown[]) : null
      );
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

  const fakeLayer = Lay.succeedContext(
    Ctx.empty().pipe(Ctx.add(realSqliteTag as any, fakeClient))
  );

  return {
    SqliteClient: realSqliteTag,
    SqlClient: sqliteModule.SqlClient,
    layer: vi.fn(() => fakeLayer),
  };
});

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp") },
}));

import { getWorkspaceById } from "./data.js";

import * as SqliteNS from "@effect/sql-sqlite-node/SqliteClient";

const testLayer = SqliteNS.layer({ filename: ":memory:" });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(effect: any): Promise<any> {
  return Effect.runPromise(Effect.provide(effect, testLayer));
}

async function setupTables(): Promise<void> {
  await run(
    Effect.gen(function* () {
      const sql = yield* SqliteNS.SqliteClient;
      yield* sql.unsafe(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, label TEXT NOT NULL DEFAULT 'Workspace', root_path TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)`);
      yield* sql.unsafe(`CREATE TABLE _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`);
    })
  );
}

beforeEach(async () => {
  fakeDb.prepareCalls.length = 0;
  fakeDb.calls.length = 0;
  await setupTables();
});

describe("getWorkspaceById", () => {
  it("returns workspace when found", async () => {
    fakeDb.addQuery(
      "SELECT * FROM workspaces WHERE id = ?",
      [{ id: "ws-1", label: "Test Workspace", root_path: "/test/path", created_at: 1234567890 }]
    );
    const result = await run(getWorkspaceById("ws-1"));
    expect(result.id).toBe("ws-1");
    expect(result.label).toBe("Test Workspace");
    expect(result.root_path).toBe("/test/path");
  });

  it("throws Error with 'Workspace not found: <id>' when not found", async () => {
    fakeDb.addQuery("SELECT * FROM workspaces WHERE id = ?", []);
    await expect(run(getWorkspaceById("nonexistent"))).rejects.toThrow(
      "Workspace not found: nonexistent"
    );
  });
});
