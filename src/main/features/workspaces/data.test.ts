/**
 * workspaces/data.test.ts
 *
 * ADR-0046 D3 测试策略：
 * - mock better-sqlite3 原生模块 → 纯 JS FakeDatabase
 * - 真实 SqliteClient Tag 提供 fakeDb client
 * - 每个测试预注册 SELECT 查询的返回结果
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

import {
  listWorkspaces,
  addWorkspace,
  renameWorkspace,
  deleteWorkspace,
} from "./data.js";

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

describe("listWorkspaces", () => {
  it("returns empty array when no workspaces", async () => {
    fakeDb.addQuery("SELECT * FROM workspaces ORDER BY created_at DESC", []);
    const result = await run(listWorkspaces());
    expect(result).toEqual([]);
  });

  it("returns workspaces ordered by created_at DESC", async () => {
    fakeDb.addQuery("SELECT * FROM workspaces ORDER BY created_at DESC", [
      { id: "ws-2", label: "second", root_path: "", created_at: 2000 },
      { id: "ws-1", label: "first", root_path: "", created_at: 1000 },
    ]);
    const result = await run(listWorkspaces());
    expect(result.length).toBe(2);
    expect(result[0]!.label).toBe("second");
    expect(result[1]!.label).toBe("first");
  });
});

describe("addWorkspace", () => {
  it("creates and returns mapped workspace", async () => {
    fakeDb.addMutation("INSERT INTO workspaces (id, label, root_path, created_at) VALUES (?, ?, ?, ?)");
    const result = await run(
      addWorkspace({ label: "Docs", rootPath: "C:/docs" })
    );
    expect(result.label).toBe("Docs");
    expect(result.rootPath).toBe("C:/docs");
    expect(result.id).toBeTruthy();
  });

  it("defaults label to 'Workspace' and rootPath to ''", async () => {
    fakeDb.addMutation("INSERT INTO workspaces (id, label, root_path, created_at) VALUES (?, ?, ?, ?)");
    const result = await run(addWorkspace({}));
    expect(result.label).toBe("Workspace");
    expect(result.rootPath).toBe("");
  });
});

describe("renameWorkspace", () => {
  it("renames a workspace", async () => {
    fakeDb.addQuery("SELECT * FROM workspaces ORDER BY created_at DESC", [
      { id: "ws-1", label: "new name", root_path: "", created_at: 1000 },
    ]);
    fakeDb.addMutation("UPDATE workspaces SET label = ? WHERE id = ?");
    await run(renameWorkspace("ws-1", "new name"));
    const result = await run(listWorkspaces());
    expect(result[0]!.label).toBe("new name");
  });
});

describe("deleteWorkspace", () => {
  it("deletes a workspace", async () => {
    fakeDb.addQuery("SELECT * FROM workspaces ORDER BY created_at DESC", []);
    fakeDb.addMutation("DELETE FROM workspaces WHERE id = ?");
    await run(deleteWorkspace("ws-1"));
    const result = await run(listWorkspaces());
    expect(result).toEqual([]);
  });
});
