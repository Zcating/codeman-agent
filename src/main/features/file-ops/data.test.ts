import { describe, it, expect, beforeEach } from "vitest";
import { Effect } from "effect";
import * as SqliteNS from "@effect/sql-sqlite-node/SqliteClient";

import { getWorkspaceById } from "./data.js";

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

describe("file-ops data access", () => {
  it("getWorkspaceById returns workspace when found", async () => {
    fake.addQuery("SELECT * FROM workspaces WHERE id = ?", [
      { id: "ws-1", label: "Test", root_path: "/test/path", created_at: 1234567890 },
    ]);
    const result = await run(getWorkspaceById("ws-1"));
    expect(result.id).toBe("ws-1");
    expect(result.label).toBe("Test");
    expect(result.root_path).toBe("/test/path");
  });

  it("getWorkspaceById throws Error with message when not found", async () => {
    fake.addQuery("SELECT * FROM workspaces WHERE id = ?", []);
    await expect(run(getWorkspaceById("nonexistent"))).rejects.toThrow("Workspace not found: nonexistent");
  });
});
