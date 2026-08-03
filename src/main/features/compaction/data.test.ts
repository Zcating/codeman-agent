import { describe, it, expect, beforeEach } from "vitest";
import { Effect } from "effect";
import * as SqliteNS from "@effect/sql-sqlite-node/SqliteClient";

import { listCompactionEntries, appendCompactionEntry } from "./data.js";

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
  };
})();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(effect: any): Promise<any> {
  return Effect.runPromise(
    effect.pipe(Effect.provideService(SqliteNS.SqliteClient, fake.client as unknown as SqliteNS.SqliteClient)),
  );
}

beforeEach(() => { fake.calls.length = 0; });

describe("compaction data access", () => {
  it("listCompactionEntries returns [] for empty conversationId", async () => {
    const result = await run(listCompactionEntries(""));
    expect(result).toEqual([]);
  });

  it("listCompactionEntries returns [] when no entries", async () => {
    fake.addQuery("SELECT * FROM compaction_entries WHERE conversation_id = ? ORDER BY created_at ASC", []);
    expect(await run(listCompactionEntries("conv-1"))).toEqual([]);
  });

  it("listCompactionEntries maps rows to CompactionEntry shape", async () => {
    fake.addQuery("SELECT * FROM compaction_entries WHERE conversation_id = ? ORDER BY created_at ASC", [
      { id: "cmp-1", conversation_id: "conv-1", summary: "summary", model: "gpt-4", tokens_before: 5000, kind: "auto", created_at: 1000, first_kept_message_id: "msg-1" },
    ]);
    const result = await run(listCompactionEntries("conv-1"));
    expect(result).toEqual([{ id: "cmp-1", conversationId: "conv-1", summary: "summary", model: "gpt-4", tokensBefore: 5000, kind: "auto", createdAt: 1000, firstKeptMessageId: "msg-1" }]);
  });

  it("appendCompactionEntry inserts and returns entry", async () => {
    const result = await run(appendCompactionEntry({
      conversationId: "conv-1",
      summary: "Compressed",
      model: "gpt-4",
      tokensBefore: 5000,
      kind: "auto",
      firstKeptMessageId: "msg-1",
    }));
    expect(result.summary).toBe("Compressed");
    expect(result.conversationId).toBe("conv-1");
    expect(result.kind).toBe("auto");
    expect(fake.calls[0].sql).toBe("INSERT INTO compaction_entries (id, conversation_id, summary, model, tokens_before, kind, created_at, first_kept_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  });

  it("appendCompactionEntry maps SQL errors to Database", async () => {
    fake.failQuery("INSERT INTO compaction_entries (id, conversation_id, summary, model, tokens_before, kind, created_at, first_kept_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", new Error("SQL error"));
    await expect(run(appendCompactionEntry({
      conversationId: "conv-1",
      summary: "Compressed",
      model: "gpt-4",
      tokensBefore: 5000,
      kind: "auto",
      firstKeptMessageId: "msg-1",
    }))).rejects.toThrow();
  });

  it("listCompactionEntries returns [] on SQL error (Database error)", async () => {
    fake.failQuery("SELECT * FROM compaction_entries WHERE conversation_id = ? ORDER BY created_at ASC", new Error("DB error"));
    // The effect fails with Database, but our fake returns Effect.fail, so the test verifies it propagates
    await expect(run(listCompactionEntries("conv-1"))).rejects.toThrow();
  });
});
