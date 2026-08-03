/**
 * db/mod.test.ts
 *
 * ADR-0046 D3 测试策略：
 * - 使用 provideService 注入 fake SqliteClient
 * - 直接测试 applyMigrationsEffect（不通过 Layer.launch，避免 scoped timeout）
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Effect } from "effect";
import * as SqliteNS from "@effect/sql-sqlite-node/SqliteClient";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp") },
}));

import { applyMigrationsEffect } from "./mod.js";

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

// Run applyMigrationsEffect directly (includes CREATE TABLE and migrations)
async function runMigrations(): Promise<void> {
  await Effect.runPromise(
    applyMigrationsEffect.pipe(
      Effect.provideService(SqliteNS.SqliteClient, fake.client as unknown as SqliteNS.SqliteClient),
    ),
  );
}

beforeEach(() => { fake.reset(); });

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
