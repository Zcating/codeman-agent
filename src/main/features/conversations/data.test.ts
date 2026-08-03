import { describe, it, expect, beforeEach } from "vitest";
import { Effect } from "effect";
import * as SqliteNS from "@effect/sql-sqlite-node/SqliteClient";

import {
  listConversations,
  getConversation,
  createConversation,
  archiveConversation,
  deleteConversation,
  renameConversation,
  listMessages,
  appendMessage,
  searchMessagesSafe,
  clearAllHistory,
} from "./data.js";

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

beforeEach(() => { fake.calls.length = 0; fake.addQuery("SELECT * FROM conversations WHERE archived_at IS NULL", []); });

describe("conversations data access", () => {
  it("listConversations maps rows to Conversation shape (active only)", async () => {
    fake.addQuery("SELECT * FROM conversations WHERE archived_at IS NULL", [
      { id: "conv-1", title: "Test", system_prompt: null, created_at: 1000, updated_at: 1000, archived_at: null, workspace_id: "" },
    ]);
    const result = await run(listConversations(false));
    expect(result).toEqual([{ id: "conv-1", title: "Test", systemPrompt: null, workspaceId: "", createdAt: 1000, updatedAt: 1000, archivedAt: null }]);
  });

  it("listConversations returns all when includeArchived=true", async () => {
    fake.addQuery("SELECT * FROM conversations", [
      { id: "conv-1", title: "active", system_prompt: null, created_at: 1000, updated_at: 1000, archived_at: null, workspace_id: "" },
      { id: "conv-2", title: "archived", system_prompt: null, created_at: 1000, updated_at: 1000, archived_at: 2000, workspace_id: "" },
    ]);
    const result = await run(listConversations(true));
    expect(result.length).toBe(2);
  });

  it("listConversations returns [] when empty", async () => {
    fake.addQuery("SELECT * FROM conversations WHERE archived_at IS NULL", []);
    expect(await run(listConversations(false))).toEqual([]);
  });

  it("getConversation throws Error when not found", async () => {
    fake.addQuery("SELECT * FROM conversations WHERE id = ?", []);
    await expect(run(getConversation("nonexistent"))).rejects.toThrow("Conversation not found: nonexistent");
  });

  it("getConversation returns mapped conversation", async () => {
    fake.addQuery("SELECT * FROM conversations WHERE id = ?", [
      { id: "conv-1", title: "Test", system_prompt: "sys", created_at: 1000, updated_at: 1000, archived_at: null, workspace_id: "ws1" },
    ]);
    const result = await run(getConversation("conv-1"));
    expect(result).toEqual({ id: "conv-1", title: "Test", systemPrompt: "sys", workspaceId: "ws1", createdAt: 1000, updatedAt: 1000, archivedAt: null });
  });

  it("createConversation inserts and returns mapped conversation", async () => {
    const result = await run(createConversation({ title: "Hello", workspaceId: "ws1", systemPrompt: "sys" }));
    expect(result.title).toBe("Hello");
    expect(result.workspaceId).toBe("ws1");
    expect(result.systemPrompt).toBe("sys");
    expect(fake.calls[0].sql).toBe("INSERT INTO conversations (id, title, system_prompt, created_at, updated_at, archived_at, workspace_id) VALUES (?, ?, ?, ?, ?, NULL, ?)");
  });

  it("createConversation defaults empty fields", async () => {
    const result = await run(createConversation({}));
    expect(result.title).toBe("");
    expect(result.workspaceId).toBe("");
    expect(result.systemPrompt).toBe(null);
  });

  it("archiveConversation runs UPDATE", async () => {
    await run(archiveConversation("conv-1"));
    expect(fake.calls[0].sql).toBe("UPDATE conversations SET archived_at = ? WHERE id = ?");
  });

  it("deleteConversation runs DELETE", async () => {
    await run(deleteConversation("conv-1"));
    expect(fake.calls[0].sql).toBe("DELETE FROM conversations WHERE id = ?");
    expect(fake.calls[0].params).toEqual(["conv-1"]);
  });

  it("renameConversation runs UPDATE", async () => {
    await run(renameConversation("conv-1", "new title"));
    expect(fake.calls[0].sql).toBe("UPDATE conversations SET title = ? WHERE id = ?");
    expect(fake.calls[0].params).toEqual(["new title", "conv-1"]);
  });

  it("listMessages returns [] when conversationId empty", async () => {
    const result = await run(listMessages(""));
    expect(result).toEqual([]);
  });

  it("listMessages returns mapped messages", async () => {
    fake.addQuery("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC", [
      { id: "msg-1", conversation_id: "conv-1", role: "user", content: "hi", thinking: null, tool_calls: null, tool_results: null, model: null, input_tokens: null, output_tokens: null, created_at: 1000 },
    ]);
    const result = await run(listMessages("conv-1"));
    expect(result.length).toBe(1);
    expect(result[0].content).toBe("hi");
    expect(result[0].role).toBe("user");
  });

  it("appendMessage inserts and returns mapped message", async () => {
    const result = await run(appendMessage({ conversationId: "conv-1", role: "user", content: "hello" }));
    expect(result.content).toBe("hello");
    expect(result.role).toBe("user");
    expect(fake.calls[0].sql).toBe("INSERT INTO messages (id, conversation_id, role, content, thinking, tool_calls, tool_results, model, input_tokens, output_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)");
  });

  it("searchMessages returns [] on FTS failure", async () => {
    fake.failQuery("SELECT m.* FROM messages m JOIN messages_fts f ON m.rowid = f.rowid WHERE messages_fts MATCH ? ORDER BY rank LIMIT ?", new Error("FTS error"));
    const result = await run(searchMessagesSafe("hello"));
    expect(result).toEqual([]);
  });

  it("clearAllHistory runs DELETE", async () => {
    await run(clearAllHistory());
    expect(fake.calls[0].sql).toBe("DELETE FROM conversations");
  });
});
