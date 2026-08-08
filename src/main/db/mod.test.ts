/**
 * db/mod.test.ts
 *
 * ADR-0046 D3 测试策略：
 * - 使用 provideService 注入 fake SqliteClient
 * - 直接测试 applyMigrationsEffect（不通过 Layer.launch，避免 scoped timeout）
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Effect, Layer } from "effect";
import * as SqliteNS from "@effect/sql-sqlite-node/SqliteClient";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp") },
}));

import { applyMigrationsEffect, splitSqlStatements } from "./mod.js";
import { NodeFileSystemLive } from "../lib/file-system-node.js";

const fake = (() => {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const rowsBySql = new Map<string, unknown[]>();
  const failBySql = new Map<string, Error>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = {
    unsafe(sql: string, params?: readonly unknown[]): Effect.Effect<unknown[], Error, never> {
      calls.push({ sql, params: params ?? [] });
      const fail = failBySql.get(sql);
      if (fail) { return Effect.fail(fail); }
      return Effect.succeed(rowsBySql.get(sql) ?? []);
    },
  } as any;
  return {
    client,
    calls,
    addQuery(sql: string, rows: unknown[]) { rowsBySql.set(sql, rows); },
    failQuery(sql: string, err: Error) { failBySql.set(sql, err); },
    reset() { calls.length = 0; rowsBySql.clear(); failBySql.clear(); },
  };
})();

// Run applyMigrationsEffect directly (includes CREATE TABLE and migrations).
// PR-δ: applyMigrationsEffect now requires FileSystem.FileSystem in R,
// so we provide NodeFileSystemLive alongside the fake SqliteClient.
const TestLayer = Layer.mergeAll(
  Layer.succeed(SqliteNS.SqliteClient, fake.client as unknown as SqliteNS.SqliteClient),
  NodeFileSystemLive,
);

async function runMigrations(): Promise<void> {
  await Effect.runPromise(
    applyMigrationsEffect.pipe(Effect.provide(TestLayer)),
  );
}

beforeEach(() => { fake.reset(); });

describe("splitSqlStatements", () => {
  it("splits multi-statement SQL into individual statements", () => {
    const statements = splitSqlStatements(
      "CREATE TABLE a (id TEXT);\n\nCREATE INDEX idx ON a(id);\nCREATE VIRTUAL TABLE f USING fts5(content);"
    );
    expect(statements.length).toBe(3);
    expect(statements[0]).toBe("CREATE TABLE a (id TEXT)");
    expect(statements[1]).toBe("CREATE INDEX idx ON a(id)");
    expect(statements[2]).toBe("CREATE VIRTUAL TABLE f USING fts5(content)");
  });

  it("keeps semicolons inside string literals intact", () => {
    const statements = splitSqlStatements(
      "INSERT INTO t (v) VALUES ('a;b');\nSELECT * FROM t;"
    );
    expect(statements.length).toBe(2);
    expect(statements[0]).toBe("INSERT INTO t (v) VALUES ('a;b')");
  });

  it("strips -- line comments", () => {
    const statements = splitSqlStatements(
      "-- header comment\nCREATE TABLE a (id TEXT);\n-- trailing\n"
    );
    expect(statements).toEqual(["CREATE TABLE a (id TEXT)"]);
  });

  it("matches the real 0001_initial.sql statement count (4)", () => {
    const sql = [
      "CREATE TABLE conversations (id TEXT PRIMARY KEY, title TEXT NOT NULL);",
      "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE);",
      "CREATE INDEX idx_messages_conv_created ON messages(conversation_id, created_at);",
      "CREATE VIRTUAL TABLE messages_fts USING fts5(content, content='messages', content_rowid='rowid');",
    ];
    expect(splitSqlStatements(sql.join("\n\n")).length).toBe(4);
  });
});

describe("applyMigrationsEffect", () => {
  it("creates _migrations table", async () => {
    fake.addQuery("SELECT name FROM _migrations", []);
    await runMigrations();
    expect(fake.calls.some(c => c.sql.includes("CREATE TABLE IF NOT EXISTS _migrations"))).toBe(true);
  });

  it("is idempotent: does not INSERT when migrations already applied", async () => {
    // Pre-register all migrations as already applied
    fake.addQuery("SELECT name FROM _migrations", [
      { name: "0001_initial.sql" },
      { name: "0002_conversation_workspace.sql" },
      { name: "0003_workspaces.sql" },
      { name: "0004_messages_thinking.sql" },
      { name: "0005_compaction_entries.sql" },
    ]);
    await runMigrations();
    // INSERT INTO _migrations should NOT be called when all are already applied
    const insertCalls = fake.calls.filter(c => c.sql.includes("INSERT INTO _migrations"));
    expect(insertCalls.length).toBe(0);
  });
});
