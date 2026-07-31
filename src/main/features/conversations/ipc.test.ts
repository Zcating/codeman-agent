import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Database as DB } from "better-sqlite3";

const fakeIpcMain = vi.hoisted(() => ({ handle: vi.fn() }));
const fakeRandomUUID = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({ ipcMain: fakeIpcMain }));
vi.mock("node:crypto", () => ({ randomUUID: fakeRandomUUID }));

const dbCalls = vi.hoisted(() => [] as { sql: string; params: unknown[] }[]);
const allImpl = vi.hoisted(() => vi.fn((..._args: unknown[]) => []));
const getImpl = vi.hoisted(() => vi.fn((..._args: unknown[]) => undefined));
const runImpl = vi.hoisted(() => vi.fn((..._args: unknown[]) => undefined));

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

import { registerConversationsIpc } from "./ipc.js";

function handlerFor(channel: string) {
  const call = fakeIpcMain.handle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`handler not registered: ${channel}`);
  }
  return call[1] as (...args: unknown[]) => unknown;
}

describe("registerConversationsIpc", () => {
  it("registers all 10 conversation + message channels", () => {
    registerConversationsIpc({ db: fakeDb });
    const channels = fakeIpcMain.handle.mock.calls.map(([name]) => name);
    expect(channels).toEqual([
      "clearAllHistory",
      "listConversations",
      "getConversation",
      "createConversation",
      "archiveConversation",
      "deleteConversation",
      "renameConversation",
      "listMessages",
      "appendMessage",
      "searchMessages",
    ]);
  });

  it("listConversations without args returns an empty array", () => {
    registerConversationsIpc({ db: fakeDb });
    expect(handlerFor("listConversations")(undefined, undefined)).toEqual([]);
  });

  it("listConversations with includeArchived: true uses the SELECT * FROM conversations path", () => {
    registerConversationsIpc({ db: fakeDb });
    handlerFor("listConversations")(undefined, { includeArchived: true });
    expect(dbCalls).toContainEqual({ sql: "SELECT * FROM conversations", params: [] });
  });

  it("createConversation inserts a row and returns the mapped conversation", () => {
    fakeRandomUUID.mockReturnValue("conv-uuid");
    vi.spyOn(Date, "now").mockReturnValue(1000);
    registerConversationsIpc({ db: fakeDb });
    const result = handlerFor("createConversation")(undefined, {
      title: "hello",
      workspaceId: "w1",
      systemPrompt: "sys",
    });
    expect(dbCalls).toContainEqual({
      sql: "INSERT INTO conversations (id, title, system_prompt, created_at, updated_at, archived_at, workspace_id) VALUES (?, ?, ?, ?, ?, NULL, ?)",
      params: ["conv-uuid", "hello", "sys", 1, 1, "w1"],
    });
    expect(result).toEqual({
      id: "conv-uuid",
      title: "hello",
      systemPrompt: "sys",
      workspaceId: "w1",
      createdAt: 1,
      updatedAt: 1,
      archivedAt: null,
    });
  });

  it("renameConversation runs an UPDATE with the new title", () => {
    registerConversationsIpc({ db: fakeDb });
    handlerFor("renameConversation")(undefined, { id: "c1", title: "renamed" });
    expect(dbCalls).toContainEqual({
      sql: "UPDATE conversations SET title = ? WHERE id = ?",
      params: ["renamed", "c1"],
    });
  });

  it("appendMessage inserts into messages and returns the mapped message", () => {
    fakeRandomUUID.mockReturnValue("msg-uuid");
    vi.spyOn(Date, "now").mockReturnValue(2000);
    registerConversationsIpc({ db: fakeDb });
    const result = handlerFor("appendMessage")(undefined, {
      conversationId: "c1",
      role: "user",
      content: "hi",
    });
    expect(dbCalls).toContainEqual({
      sql: "INSERT INTO messages (id, conversation_id, role, content, thinking, tool_calls, tool_results, model, input_tokens, output_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)",
      params: ["msg-uuid", "c1", "user", "hi", null, null, null, null, 2],
    });
    expect(result).toEqual({
      id: "msg-uuid",
      conversationId: "c1",
      role: "user",
      content: "hi",
      thinking: null,
      toolCalls: null,
      toolResults: null,
      model: null,
      inputTokens: null,
      outputTokens: null,
      createdAt: 2,
    });
  });

  it("searchMessages returns [] when the FTS MATCH query throws", () => {
    allImpl.mockImplementation(() => {
      throw new Error("fts5: syntax error");
    });
    registerConversationsIpc({ db: fakeDb });
    expect(handlerFor("searchMessages")(undefined, { query: "hello" })).toEqual([]);
  });

  it("clearAllHistory executes DELETE FROM conversations", () => {
    registerConversationsIpc({ db: fakeDb });
    handlerFor("clearAllHistory")(undefined, undefined);
    expect(dbCalls).toContainEqual({ sql: "DELETE FROM conversations", params: [] });
  });
});
