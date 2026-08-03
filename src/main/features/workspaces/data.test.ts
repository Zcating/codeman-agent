import { describe, it, expect, beforeEach } from "vitest";
import { Effect, Layer } from "effect";
import * as SqliteNS from "@effect/sql-sqlite-node/SqliteClient";

import { listWorkspaces, addWorkspace, renameWorkspace, deleteWorkspace } from "./data.js";

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

const sqliteLayer = Layer.effect(SqliteNS.SqliteClient, Effect.succeed(fake.client as any));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(effect: any): Promise<any> {
  return Effect.runPromise(Effect.provide(effect, sqliteLayer));
}

beforeEach(() => { fake.calls.length = 0; });

describe("workspaces data access", () => {
  it("listWorkspaces maps rows to Workspace shape", async () => {
    fake.addQuery("SELECT * FROM workspaces ORDER BY created_at DESC", [
      { id: "ws-1", label: "Docs", root_path: "C:/docs", created_at: 1000 },
    ]);
    expect(await run(listWorkspaces())).toEqual([
      { id: "ws-1", label: "Docs", rootPath: "C:/docs", createdAt: 1000 },
    ]);
    expect(fake.calls[0]).toEqual({
      sql: "SELECT * FROM workspaces ORDER BY created_at DESC",
      params: [],
    });
  });

  it("listWorkspaces returns [] when empty", async () => {
    fake.addQuery("SELECT * FROM workspaces ORDER BY created_at DESC", []);
    expect(await run(listWorkspaces())).toEqual([]);
  });

  it("addWorkspace inserts and returns mapped workspace", async () => {
    const ws = await run(addWorkspace({ label: "Docs", rootPath: "C:/docs" }));
    expect(ws.id).toBeTruthy();
    expect(ws.label).toBe("Docs");
    expect(ws.rootPath).toBe("C:/docs");
    expect(fake.calls[0].sql).toBe("INSERT INTO workspaces (id, label, root_path, created_at) VALUES (?, ?, ?, ?)");
  });

  it("addWorkspace defaults label/rootPath", async () => {
    const ws = await run(addWorkspace({}));
    expect(ws.label).toBe("Workspace");
    expect(ws.rootPath).toBe("");
  });

  it("addWorkspace wraps SQL errors with prefix", async () => {
    fake.failQuery("INSERT INTO workspaces (id, label, root_path, created_at) VALUES (?, ?, ?, ?)", new Error("boom"));
    await expect(run(addWorkspace({}))).rejects.toThrow("addWorkspace failed: boom");
  });

  it("renameWorkspace runs UPDATE with label and id", async () => {
    await run(renameWorkspace("ws-1", "new"));
    expect(fake.calls[0].sql).toBe("UPDATE workspaces SET label = ? WHERE id = ?");
    expect(fake.calls[0].params).toEqual(["new", "ws-1"]);
  });

  it("deleteWorkspace runs DELETE", async () => {
    await run(deleteWorkspace("ws-1"));
    expect(fake.calls[0].sql).toBe("DELETE FROM workspaces WHERE id = ?");
    expect(fake.calls[0].params).toEqual(["ws-1"]);
  });
});
