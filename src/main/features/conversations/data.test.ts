/**
 * conversations/data.test.ts
 *
 * ADR-0046 D3 测试策略：
 * - mock better-sqlite3 原生模块 → 纯 JS FakeDatabase
 * - 真实 @effect/sql-sqlite-node/SqliteClient 可加载（不 crash）
 * - 真实 SqliteClient Tag 提供 fakeDb client
 * - 每个测试预注册 SELECT 查询的返回结果（INSERT 数据通过 fakeDb 查询返回）
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRequire } from "node:module";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const require_ = createRequire(import.meta.url);
const Effect = require_("effect").Effect;

// ---------------------------------------------------------------------------
// FakeDatabase (shared via vi.hoisted)
// ---------------------------------------------------------------------------

const fakeDb = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FakeDatabase } = require("../../db/__fake__.ts") as {
    FakeDatabase: new (filename: string) => import("../../db/__fake__.ts").FakeDatabase;
  };
  const db = new FakeDatabase(":memory:");
  return db;
});

// ---------------------------------------------------------------------------
// Mock better-sqlite3 → pure JS FakeDatabase
// ---------------------------------------------------------------------------

vi.mock("better-sqlite3", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FakeDatabase } = require("../../db/__fake__.ts") as {
    FakeDatabase: new (filename: string) => import("../../db/__fake__.ts").FakeDatabase;
  };
  return { default: FakeDatabase };
});

// ---------------------------------------------------------------------------
// Mock @effect/sql-sqlite-node/SqliteClient
// ---------------------------------------------------------------------------

vi.mock("@effect/sql-sqlite-node/SqliteClient", () => {
  const { createRequire } = require("node:module");
  const require_ = createRequire(import.meta.url);
  const E = require_("effect");
  const Eff = E.Effect;
  const Lay = E.Layer;
  const Ctx = E.Context;

  // Load the real module to get the actual Context tag
  const sqliteModule = require_("@effect/sql-sqlite-node/SqliteClient");
  const realSqliteTag: any = sqliteModule.SqliteClient;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fakeClient: any = {
    unsafe: (sql: string, params?: unknown[]) => {
      fakeDb.prepareCalls.push({ sql });
      const stmt = fakeDb.prepare(sql);
      // Real sql.unsafe() returns Effect<rows>
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
  listConversations,
  getConversation,
  createConversation,
  archiveConversation,
  deleteConversation,
  renameConversation,
  listMessages,
  appendMessage,
  clearAllHistory,
} from "./data.js";

import * as SqliteNS from "@effect/sql-sqlite-node/SqliteClient";

const testLayer = SqliteNS.layer({ filename: ":memory:" });

/** 执行带 :memory: SqliteClient 的 Effect */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(effect: any): Promise<any> {
  return Effect.runPromise(Effect.provide(effect, testLayer));
}

/** 建表夹具 */
async function setupTables(): Promise<void> {
  await run(
    Effect.gen(function* () {
      const sql = yield* SqliteNS.SqliteClient;
      yield* sql.unsafe(`CREATE TABLE conversations (id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', system_prompt TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, archived_at INTEGER, workspace_id TEXT NOT NULL DEFAULT '')`);
      yield* sql.unsafe(`CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, thinking TEXT, tool_calls TEXT, tool_results TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER, created_at INTEGER NOT NULL)`);
      yield* sql.unsafe(`CREATE VIRTUAL TABLE messages_fts USING fts5(content, content=messages, content_rowid=rowid)`);
      yield* sql.unsafe(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, label TEXT NOT NULL DEFAULT 'Workspace', root_path TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)`);
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

// ---------------------------------------------------------------------------
// listConversations
// ---------------------------------------------------------------------------

describe("listConversations", () => {
  it("returns empty array when no conversations", async () => {
    // Pre-register empty result for the SELECT
    fakeDb.addQuery(
      "SELECT * FROM conversations WHERE archived_at IS NULL",
      []
    );
    const result = await run(listConversations(false));
    expect(result).toEqual([]);
  });

  it("returns only non-archived by default", async () => {
    // Pre-register the SELECT results for this test
    fakeDb.addQuery(
      "SELECT * FROM conversations WHERE archived_at IS NULL",
      [
        {
          id: "conv-1",
          title: "active",
          system_prompt: null,
          created_at: 1234567890,
          updated_at: 1234567890,
          archived_at: null,
          workspace_id: "",
        },
      ]
    );
    fakeDb.addQuery(
      "SELECT * FROM conversations",
      [
        {
          id: "conv-1",
          title: "active",
          system_prompt: null,
          created_at: 1234567890,
          updated_at: 1234567890,
          archived_at: null,
          workspace_id: "",
        },
        {
          id: "conv-2",
          title: "archived",
          system_prompt: null,
          created_at: 1234567890,
          updated_at: 1234567890,
          archived_at: 1234567900,
          workspace_id: "w1",
        },
      ]
    );
    const all = await run(listConversations(true));
    const active = await run(listConversations(false));
    expect(all.length).toBe(2);
    expect(active.length).toBe(1);
    expect(active[0]!.title).toBe("active");
  });
});

// ---------------------------------------------------------------------------
// getConversation
// ---------------------------------------------------------------------------

describe("getConversation", () => {
  it("throws Error when not found", async () => {
    fakeDb.addQuery(
      "SELECT * FROM conversations WHERE id = ?",
      []
    );
    await expect(run(getConversation("nonexistent"))).rejects.toThrow(
      "Conversation not found: nonexistent"
    );
  });

  it("returns mapped conversation", async () => {
    const row = {
      id: "conv-1",
      title: "test",
      system_prompt: null,
      created_at: 1234567890,
      updated_at: 1234567890,
      archived_at: null,
      workspace_id: "",
    };
    fakeDb.addQuery("SELECT * FROM conversations WHERE id = ?", [row]);
    const result = await run(getConversation("conv-1"));
    expect(result.id).toBe("conv-1");
    expect(result.title).toBe("test");
  });
});

// ---------------------------------------------------------------------------
// createConversation
// ---------------------------------------------------------------------------

describe("createConversation", () => {
  it("creates and returns mapped conversation", async () => {
    // Pre-register the INSERT result
    fakeDb.addMutation(
      "INSERT INTO conversations (id, title, system_prompt, created_at, updated_at, archived_at, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    // Pre-register the SELECT after insert
    const row = {
      id: "new-uuid",
      title: "Hello",
      system_prompt: "You are helpful",
      created_at: 1234567890,
      updated_at: 1234567890,
      archived_at: null,
      workspace_id: "ws1",
    };
    fakeDb.addQuery("SELECT * FROM conversations WHERE id = ?", [row]);
    const result = await run(
      createConversation({
        title: "Hello",
        workspaceId: "ws1",
        systemPrompt: "You are helpful",
      })
    );
    expect(result.title).toBe("Hello");
    expect(result.workspaceId).toBe("ws1");
    expect(result.systemPrompt).toBe("You are helpful");
    expect(result.archivedAt).toBe(null);
  });

  it("defaults empty fields", async () => {
    fakeDb.addMutation(
      "INSERT INTO conversations (id, title, system_prompt, created_at, updated_at, archived_at, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    const row = {
      id: "new-uuid",
      title: "",
      system_prompt: null,
      created_at: 1234567890,
      updated_at: 1234567890,
      archived_at: null,
      workspace_id: "",
    };
    fakeDb.addQuery("SELECT * FROM conversations WHERE id = ?", [row]);
    const result = await run(createConversation({}));
    expect(result.title).toBe("");
    expect(result.workspaceId).toBe("");
    expect(result.systemPrompt).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// archiveConversation
// ---------------------------------------------------------------------------

describe("archiveConversation", () => {
  it("archives a conversation", async () => {
    fakeDb.addQuery("SELECT * FROM conversations WHERE id = ?", [
      {
        id: "conv-1",
        title: "to archive",
        system_prompt: null,
        created_at: 1234567890,
        updated_at: 1234567890,
        archived_at: null,
        workspace_id: "",
      },
    ]);
    fakeDb.addMutation(
      "UPDATE conversations SET archived_at = ? WHERE id = ?"
    );
    fakeDb.addQuery("SELECT * FROM conversations WHERE id = ?", [
      {
        id: "conv-1",
        title: "to archive",
        system_prompt: null,
        created_at: 1234567890,
        updated_at: 1234567890,
        archived_at: 1234567900,
        workspace_id: "",
      },
    ]);
    const conv = { id: "conv-1", title: "to archive" };
    await run(archiveConversation(conv.id));
    const result = await run(getConversation(conv.id));
    expect(result.archivedAt).not.toBe(null);
  });
});

// ---------------------------------------------------------------------------
// deleteConversation
// ---------------------------------------------------------------------------

describe("deleteConversation", () => {
  it("deletes a conversation", async () => {
    fakeDb.addQuery("SELECT * FROM conversations WHERE id = ?", [
      {
        id: "conv-1",
        title: "to delete",
        system_prompt: null,
        created_at: 1234567890,
        updated_at: 1234567890,
        archived_at: null,
        workspace_id: "",
      },
    ]);
    fakeDb.addMutation("DELETE FROM conversations WHERE id = ?");
    // After delete, SELECT returns empty
    fakeDb.addQuery("SELECT * FROM conversations WHERE id = ?", []);
    const conv = { id: "conv-1", title: "to delete" };
    await run(deleteConversation(conv.id));
    await expect(run(getConversation(conv.id))).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// renameConversation
// ---------------------------------------------------------------------------

describe("renameConversation", () => {
  it("renames a conversation", async () => {
    fakeDb.addQuery("SELECT * FROM conversations WHERE id = ?", [
      {
        id: "conv-1",
        title: "old name",
        system_prompt: null,
        created_at: 1234567890,
        updated_at: 1234567890,
        archived_at: null,
        workspace_id: "",
      },
    ]);
    fakeDb.addMutation(
      "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?"
    );
    fakeDb.addQuery("SELECT * FROM conversations WHERE id = ?", [
      {
        id: "conv-1",
        title: "new name",
        system_prompt: null,
        created_at: 1234567890,
        updated_at: 1234567890,
        archived_at: null,
        workspace_id: "",
      },
    ]);
    await run(renameConversation("conv-1", "new name"));
    const result = await run(getConversation("conv-1"));
    expect(result.title).toBe("new name");
  });
});

// ---------------------------------------------------------------------------
// listMessages
// ---------------------------------------------------------------------------

describe("listMessages", () => {
  it("returns empty array when no messages", async () => {
    fakeDb.addQuery(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at",
      []
    );
    const result = await run(listMessages("nonexistent"));
    expect(result).toEqual([]);
  });

  it("returns messages for conversation", async () => {
    fakeDb.addQuery(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
      [
        {
          id: "msg-1",
          conversation_id: "conv-1",
          role: "user",
          content: "hello",
          thinking: null,
          tool_calls: null,
          tool_results: null,
          model: null,
          input_tokens: null,
          output_tokens: null,
          created_at: 1234567890,
        },
      ]
    );
    const messages = await run(listMessages("conv-1"));
    expect(messages.length).toBe(1);
    expect(messages[0]!.content).toBe("hello");
  });
});

// ---------------------------------------------------------------------------
// appendMessage
// ---------------------------------------------------------------------------

describe("appendMessage", () => {
  it("appends and returns mapped message", async () => {
    fakeDb.addMutation(
      "INSERT INTO messages (id, conversation_id, role, content, thinking, tool_calls, tool_results, model, input_tokens, output_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)"
    );
    const row = {
      id: "new-uuid",
      conversation_id: "conv-1",
      role: "user",
      content: "hello",
      thinking: null,
      tool_calls: null,
      tool_results: null,
      model: null,
      input_tokens: null,
      output_tokens: null,
      created_at: 1234567890,
    };
    fakeDb.addQuery("SELECT * FROM messages WHERE id = ?", [row]);
    const msg = await run(
      appendMessage({
        conversationId: "conv-1",
        role: "user",
        content: "hello",
      })
    );
    expect(msg.content).toBe("hello");
    expect(msg.role).toBe("user");
  });
});

// ---------------------------------------------------------------------------
// clearAllHistory
// ---------------------------------------------------------------------------

describe("clearAllHistory", () => {
  it("deletes all conversations", async () => {
    fakeDb.addMutation("DELETE FROM conversations");
    fakeDb.addQuery(
      "SELECT * FROM conversations WHERE archived_at IS NULL",
      []
    );
    await run(clearAllHistory());
    const result = await run(listConversations(false));
    expect(result).toEqual([]);
  });
});
