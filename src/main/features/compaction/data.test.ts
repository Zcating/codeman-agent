/**
 * compaction/data.test.ts
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

import {
  listCompactionEntries,
  appendCompactionEntry,
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
      yield* sql.unsafe(`CREATE TABLE compaction_entries (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, summary TEXT NOT NULL, model TEXT NOT NULL, tokens_before INTEGER NOT NULL, kind TEXT NOT NULL, created_at INTEGER NOT NULL, first_kept_message_id TEXT NOT NULL)`);
      yield* sql.unsafe(`CREATE TABLE _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`);
    })
  );
}

beforeEach(async () => {
  fakeDb.prepareCalls.length = 0;
  fakeDb.calls.length = 0;
  await setupTables();
});

describe("listCompactionEntries", () => {
  it("returns empty array for unknown conversation", async () => {
    fakeDb.addQuery(
      "SELECT * FROM compaction_entries WHERE conversation_id = ? ORDER BY created_at ASC",
      []
    );
    const result = await run(listCompactionEntries("conv-1"));
    expect(result).toEqual([]);
  });

  it("returns entries ordered by created_at ASC", async () => {
    fakeDb.addQuery(
      "SELECT * FROM compaction_entries WHERE conversation_id = ? ORDER BY created_at ASC",
      [
        { id: "e-1", conversation_id: "conv-1", summary: "first", model: "gpt-4", tokens_before: 100, kind: "auto", created_at: 1000, first_kept_message_id: "m1" },
        { id: "e-2", conversation_id: "conv-1", summary: "second", model: "gpt-4", tokens_before: 200, kind: "manual", created_at: 2000, first_kept_message_id: "m2" },
      ]
    );
    const result = await run(listCompactionEntries("conv-1"));
    expect(result.length).toBe(2);
    expect(result[0]!.summary).toBe("first");
    expect(result[1]!.summary).toBe("second");
  });
});

describe("appendCompactionEntry", () => {
  it("inserts entry and returns it", async () => {
    fakeDb.addMutation(
      "INSERT INTO compaction_entries (id, conversation_id, summary, model, tokens_before, kind, created_at, first_kept_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const result = await run(
      appendCompactionEntry({
        conversationId: "conv-1",
        summary: "Compressed summary",
        model: "gpt-4",
        tokensBefore: 5000,
        kind: "auto",
        firstKeptMessageId: "msg-123",
      })
    );
    expect(result.summary).toBe("Compressed summary");
    expect(result.conversationId).toBe("conv-1");
    expect(result.kind).toBe("auto");
    expect(result.id).toBeTruthy();
  });

  it("defaults conversationId to empty string", async () => {
    fakeDb.addMutation(
      "INSERT INTO compaction_entries (id, conversation_id, summary, model, tokens_before, kind, created_at, first_kept_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const result = await run(
      appendCompactionEntry({
        summary: "Summary",
        model: "gpt-4",
        tokensBefore: 100,
        kind: "manual",
        firstKeptMessageId: "m1",
      })
    );
    expect(result.conversationId).toBe("");
  });
});
