import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Database as DB } from "better-sqlite3";

const fakeIpcMain = vi.hoisted(() => ({ handle: vi.fn() }));
const fakeRandomUUID = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({ ipcMain: fakeIpcMain }));
vi.mock("node:crypto", () => ({ randomUUID: fakeRandomUUID }));

const dbCalls = vi.hoisted(() => [] as { sql: string; params: unknown[] }[]);
const allImpl = vi.hoisted(() => vi.fn((..._args: unknown[]) => [] as unknown[]));
const getImpl = vi.hoisted(() => vi.fn((..._args: unknown[]) => undefined as unknown));
const runImpl = vi.hoisted(() => vi.fn((..._args: unknown[]) => undefined as unknown));

class FakeStatement {
  private readonly sql: string;
  constructor(sql: string) {
    this.sql = sql;
  }
  all(...params: unknown[]) {
    dbCalls.push({ sql: this.sql, params });
    return allImpl(...params);
  }
  get(...params: unknown[]) {
    dbCalls.push({ sql: this.sql, params });
    return getImpl(...params);
  }
  run(...params: unknown[]) {
    dbCalls.push({ sql: this.sql, params });
    return runImpl(...params);
  }
}

class FakeDatabase {
  prepare(sql: string) {
    dbCalls.push({ sql, params: [] });
    return new FakeStatement(sql);
  }
  exec(sql: string) {
    dbCalls.push({ sql, params: [] });
    return undefined;
  }
}

const fakeDb = new FakeDatabase() as unknown as DB;

beforeEach(() => {
  fakeIpcMain.handle.mockClear();
  fakeRandomUUID.mockReset().mockReturnValue("00000000-0000-4000-8000-000000000000");
  allImpl.mockReset().mockReturnValue([]);
  getImpl.mockReset().mockReturnValue(undefined);
  runImpl.mockReset().mockReturnValue(undefined);
  dbCalls.length = 0;
});

import { registerCompactionIpc } from "./ipc.js";

function handlerFor(channel: string) {
  const call = fakeIpcMain.handle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`handler not registered: ${channel}`);
  }
  return call[1] as (...args: unknown[]) => unknown;
}

describe("registerCompactionIpc", () => {
  it("registers compaction:list and compaction:append channels", () => {
    registerCompactionIpc({ db: fakeDb });
    const channels = fakeIpcMain.handle.mock.calls.map(([name]) => name);
    expect(channels).toEqual(["compaction:list", "compaction:append"]);
  });

  it("compaction:list returns empty array when no rows", () => {
    registerCompactionIpc({ db: fakeDb });
    const result = handlerFor("compaction:list")(undefined, { conversationId: "conv-no-exist" });
    expect(result).toEqual([]);
  });

  it("compaction:list returns entries ordered by created_at ASC", () => {
    const rows = [
      {
        id: "cmp-2",
        conversation_id: "conv-1",
        summary: "second",
        model: "gpt-4o",
        tokens_before: 2000,
        kind: "auto",
        created_at: 1700000002000,
        first_kept_message_id: "msg-2",
      },
      {
        id: "cmp-1",
        conversation_id: "conv-1",
        summary: "first",
        model: "gpt-4o",
        tokens_before: 1000,
        kind: "auto",
        created_at: 1700000001000,
        first_kept_message_id: "msg-1",
      },
    ];
    allImpl.mockReturnValue(rows);
    registerCompactionIpc({ db: fakeDb });
    const result = handlerFor("compaction:list")(undefined, { conversationId: "conv-1" });
    expect(dbCalls).toContainEqual({
      sql: "SELECT * FROM compaction_entries WHERE conversation_id = ? ORDER BY created_at ASC",
      params: ["conv-1"],
    });
    expect(result).toEqual([
      {
        id: "cmp-2",
        conversationId: "conv-1",
        summary: "second",
        model: "gpt-4o",
        tokensBefore: 2000,
        kind: "auto",
        createdAt: 1700000002000,
        firstKeptMessageId: "msg-2",
      },
      {
        id: "cmp-1",
        conversationId: "conv-1",
        summary: "first",
        model: "gpt-4o",
        tokensBefore: 1000,
        kind: "auto",
        createdAt: 1700000001000,
        firstKeptMessageId: "msg-1",
      },
    ]);
  });

  it("compaction:list returns [] for non-existent conversationId", () => {
    allImpl.mockReturnValue([]);
    registerCompactionIpc({ db: fakeDb });
    const result = handlerFor("compaction:list")(undefined, { conversationId: "conv-none" });
    expect(result).toEqual([]);
  });

  it("compaction:append inserts and returns the entry", async () => {
    fakeRandomUUID.mockReturnValue("cmp-uuid");
    vi.spyOn(Date, "now").mockReturnValue(1700000003000);
    registerCompactionIpc({ db: fakeDb });
    const result = await handlerFor("compaction:append")(undefined, {
      conversationId: "conv-1",
      summary: "A compaction summary",
      model: "gpt-4o",
      tokensBefore: 5000,
      kind: "manual",
      firstKeptMessageId: "msg-100",
    });
    expect(dbCalls).toContainEqual({
      sql: "INSERT INTO compaction_entries (id, conversation_id, summary, model, tokens_before, kind, created_at, first_kept_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      params: ["cmp-uuid", "conv-1", "A compaction summary", "gpt-4o", 5000, "manual", 1700000003000, "msg-100"],
    });
    expect(result).toEqual({
      id: "cmp-uuid",
      conversationId: "conv-1",
      summary: "A compaction summary",
      model: "gpt-4o",
      tokensBefore: 5000,
      kind: "manual",
      createdAt: 1700000003000,
      firstKeptMessageId: "msg-100",
    });
  });

  it("compaction:append with duplicate id throws Database error", async () => {
    fakeRandomUUID.mockReturnValue("cmp-dup");
    vi.spyOn(Date, "now").mockReturnValue(1700000004000);
    // Simulate SQLite CONSTRAINT error (duplicate primary key)
    class FakeSqliteError extends Error {
      code = "SQLITE_CONSTRAINT_PRIMARYKEY";
      constructor() {
        super("UNIQUE constraint failed: compaction_entries.id");
        this.name = "SqliteError";
      }
    }
    runImpl.mockImplementation(() => {
      throw new FakeSqliteError();
    });
    registerCompactionIpc({ db: fakeDb });
    await expect(handlerFor("compaction:append")(undefined, {
      conversationId: "conv-1",
      summary: "Dup",
      model: "gpt-4o",
      tokensBefore: 100,
      kind: "auto",
      firstKeptMessageId: "msg-1",
    })).rejects.toThrow();
  });
});
