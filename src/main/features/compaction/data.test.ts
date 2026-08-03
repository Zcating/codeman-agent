import { describe, it, expect, beforeEach } from "vitest";
import { Cause, Effect, Exit } from "effect";
import * as SqliteNS from "@effect/sql-sqlite-node/SqliteClient";

import { listCompactionEntries, appendCompactionEntry } from "./data.js";

// 构造 tagged SqlError（与真实驱动 @effect/sql-sqlite-node 抛出的 _tag 一致），
// 使 data.ts 的 Effect.catchTag("SqlError", ...) 分支被真实触发。
const sqlError = (message: string): Error & { _tag: "SqlError" } =>
  Object.assign(new Error(message), { _tag: "SqlError" as const });

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

// 镜像 runtime.ts runMain 边界:runPromiseExit + Cause.squash 解包 typed error
// （Effect.runPromise 会包 FiberFailure,无法直接断言错误形状）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(effect: any): Promise<any> {
  const exit = await Effect.runPromiseExit(
    effect.pipe(Effect.provideService(SqliteNS.SqliteClient, fake.client as unknown as SqliteNS.SqliteClient)),
  );
  if (Exit.isFailure(exit)) {
    throw Cause.squash(exit.cause);
  }
  return exit.value;
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
    fake.failQuery("INSERT INTO compaction_entries (id, conversation_id, summary, model, tokens_before, kind, created_at, first_kept_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", sqlError("SQL error"));
    await expect(run(appendCompactionEntry({
      conversationId: "conv-1",
      summary: "Compressed",
      model: "gpt-4",
      tokensBefore: 5000,
      kind: "auto",
      firstKeptMessageId: "msg-1",
    }))).rejects.toMatchObject({ _tag: "Database", message: "SQL error" });
  });

  it("listCompactionEntries maps SQL errors to Database", async () => {
    fake.failQuery("SELECT * FROM compaction_entries WHERE conversation_id = ? ORDER BY created_at ASC", sqlError("DB error"));
    await expect(run(listCompactionEntries("conv-1"))).rejects.toMatchObject({ _tag: "Database", message: "DB error" });
  });
});
