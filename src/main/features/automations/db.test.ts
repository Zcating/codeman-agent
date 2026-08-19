import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Effect } from "effect";

// Mock better-sqlite3 BEFORE importing db to prevent native module loading
// (ABI mismatch: Electron-compiled better-sqlite3 vs system Node ABI).
vi.mock("better-sqlite3", () => {
  // In-memory store shared across prepared statements within a test
  const store = new Map<string, Record<string, unknown>>();

  const makeStmt = () => ({
    run: vi.fn((params?: Record<string, unknown>) => {
      if (params?.id) store.set(params.id as string, { ...params });
    }),
    all: vi.fn((params?: Record<string, unknown>) => {
      let rows = Array.from(store.values());
      // Filter by ruleId if present
      if (params?.ruleId !== undefined) {
        rows = rows.filter((r) => r.rule_id === params.ruleId);
      }
      // Filter by status if present
      if (params?.status !== undefined) {
        rows = rows.filter((r) => r.status === params.status);
      }
      // Sort by started_at DESC (simplified: numeric sort)
      rows.sort((a, b) => (b.started_at as number) - (a.started_at as number));
      // Apply offset
      const offset = (params?.offset as number) ?? 0;
      rows = rows.slice(offset);
      // Apply limit
      const limit = (params?.limit as number) ?? 100;
      rows = rows.slice(0, limit);
      return rows;
    }),
    get: vi.fn((id: string) => store.get(id) ?? undefined),
  });

  class FakeDatabase {
    prepare = vi.fn(() => makeStmt());
    exec = vi.fn();
    close = vi.fn();
    transaction = vi.fn((fn: () => void) => fn());

    constructor() {
      // Reset store when new Database(":memory:") is called in beforeEach
      store.clear();
    }
  }

  return { default: FakeDatabase };
});

import Database from "better-sqlite3";
import { insertExecution, updateExecutionCompletion, listExecutions, getExecution, setDatabase } from "./db";
import type { AutomationExecution, AutomationExecutionStatus } from "./db";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  // Create the table manually for in-memory test
  db.exec(`
    CREATE TABLE automation_executions (
      id TEXT PRIMARY KEY,
      rule_id TEXT NOT NULL,
      status TEXT NOT NULL,
      trigger_kind TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      duration_ms INTEGER,
      final_text TEXT,
      exit_code INTEGER,
      stderr TEXT,
      error TEXT,
      metadata_json TEXT
    );
    CREATE INDEX idx_automation_executions_rule_started ON automation_executions (rule_id, started_at DESC);
    CREATE INDEX idx_automation_executions_status ON automation_executions (status, started_at DESC);
  `);
  setDatabase(db);
});

afterEach(() => {
  db.close();
});

describe("automation_executions DAO", () => {
  it("insertExecution and getExecution roundtrip", async () => {
    const execution: AutomationExecution = {
      id: "0191a123-4567-7890-abcd-ef0123456789",
      rule_id: "rule-001",
      status: "pending",
      trigger_kind: "scheduled",
      started_at: 1_725_558_000_000,
      completed_at: null,
      duration_ms: null,
      final_text: null,
      exit_code: null,
      stderr: null,
      error: null,
      metadata_json: null,
    };

    const result = await Effect.runPromiseExit(insertExecution(execution));
    expect(result._tag).toBe("Success");

    const fetched = await Effect.runPromiseExit(getExecution(execution.id));
    expect(fetched._tag).toBe("Success");
    if (fetched._tag === "Success") {
      expect(fetched.value).toMatchObject({
        id: execution.id,
        rule_id: execution.rule_id,
        status: execution.status,
        trigger_kind: execution.trigger_kind,
      });
    }
  });

  it("listExecutions returns all records with no filter", async () => {
    const exec1: AutomationExecution = {
      id: "0191a000-0001-7890-abcd-ef0123456789",
      rule_id: "rule-001",
      status: "success",
      trigger_kind: "scheduled",
      started_at: 1_725_558_000_001,
      completed_at: 1_725_558_000_100,
      duration_ms: 99,
      final_text: "done",
      exit_code: 0,
      stderr: null,
      error: null,
      metadata_json: null,
    };
    const exec2: AutomationExecution = {
      id: "0191a000-0002-7890-abcd-ef0123456789",
      rule_id: "rule-002",
      status: "failure",
      trigger_kind: "manual",
      started_at: 1_725_558_000_002,
      completed_at: 1_725_558_000_200,
      duration_ms: 198,
      final_text: null,
      exit_code: 1,
      stderr: "error output",
      error: null,
      metadata_json: null,
    };

    await Effect.runPromiseExit(insertExecution(exec1));
    await Effect.runPromiseExit(insertExecution(exec2));

    const listResult = await Effect.runPromiseExit(listExecutions({}));
    expect(listResult._tag).toBe("Success");
    if (listResult._tag === "Success") {
      expect(listResult.value).toHaveLength(2);
    }
  });

  it("listExecutions filters by ruleId", async () => {
    const exec1: AutomationExecution = {
      id: "0191a000-0003-7890-abcd-ef0123456789",
      rule_id: "rule-001",
      status: "success",
      trigger_kind: "scheduled",
      started_at: 1_725_558_000_003,
      completed_at: 1_725_558_000_100,
      duration_ms: 97,
      final_text: null,
      exit_code: 0,
      stderr: null,
      error: null,
      metadata_json: null,
    };
    const exec2: AutomationExecution = {
      id: "0191a000-0004-7890-abcd-ef0123456789",
      rule_id: "rule-002",
      status: "success",
      trigger_kind: "scheduled",
      started_at: 1_725_558_000_004,
      completed_at: 1_725_558_000_200,
      duration_ms: 196,
      final_text: null,
      exit_code: 0,
      stderr: null,
      error: null,
      metadata_json: null,
    };

    await Effect.runPromiseExit(insertExecution(exec1));
    await Effect.runPromiseExit(insertExecution(exec2));

    const listResult = await Effect.runPromiseExit(listExecutions({ ruleId: "rule-001" }));
    expect(listResult._tag).toBe("Success");
    if (listResult._tag === "Success") {
      expect(listResult.value).toHaveLength(1);
      expect(listResult.value[0].rule_id).toBe("rule-001");
    }
  });

  it("listExecutions filters by status", async () => {
    const exec1: AutomationExecution = {
      id: "0191a000-0005-7890-abcd-ef0123456789",
      rule_id: "rule-001",
      status: "running",
      trigger_kind: "scheduled",
      started_at: 1_725_558_000_005,
      completed_at: null,
      duration_ms: null,
      final_text: null,
      exit_code: null,
      stderr: null,
      error: null,
      metadata_json: null,
    };
    const exec2: AutomationExecution = {
      id: "0191a000-0006-7890-abcd-ef0123456789",
      rule_id: "rule-001",
      status: "success",
      trigger_kind: "scheduled",
      started_at: 1_725_558_000_006,
      completed_at: 1_725_558_000_200,
      duration_ms: 194,
      final_text: null,
      exit_code: 0,
      stderr: null,
      error: null,
      metadata_json: null,
    };

    await Effect.runPromiseExit(insertExecution(exec1));
    await Effect.runPromiseExit(insertExecution(exec2));

    const listResult = await Effect.runPromiseExit(
      listExecutions({ status: "running" as AutomationExecutionStatus }),
    );
    expect(listResult._tag).toBe("Success");
    if (listResult._tag === "Success") {
      expect(listResult.value).toHaveLength(1);
      expect(listResult.value[0].status).toBe("running");
    }
  });

  it("updateExecutionCompletion updates all completion fields", async () => {
    const exec: AutomationExecution = {
      id: "0191a000-0007-7890-abcd-ef0123456789",
      rule_id: "rule-001",
      status: "running",
      trigger_kind: "scheduled",
      started_at: 1_725_558_000_007,
      completed_at: null,
      duration_ms: null,
      final_text: null,
      exit_code: null,
      stderr: null,
      error: null,
      metadata_json: null,
    };

    await Effect.runPromiseExit(insertExecution(exec));

    const updateResult = await Effect.runPromiseExit(
      updateExecutionCompletion("0191a000-0007-7890-abcd-ef0123456789", {
        status: "success",
        completed_at: 1_725_558_000_500,
        duration_ms: 493,
        final_text: "All good",
        exit_code: 0,
      }),
    );
    expect(updateResult._tag).toBe("Success");

    const getResult = await Effect.runPromiseExit(getExecution("0191a000-0007-7890-abcd-ef0123456789"));
    expect(getResult._tag).toBe("Success");
    if (getResult._tag === "Success" && getResult.value !== null) {
      expect(getResult.value.status).toBe("success");
      expect(getResult.value.completed_at).toBe(1_725_558_000_500);
      expect(getResult.value.duration_ms).toBe(493);
      expect(getResult.value.final_text).toBe("All good");
      expect(getResult.value.exit_code).toBe(0);
    }
  });

  it("getExecution returns null for nonexistent id", async () => {
    const result = await Effect.runPromiseExit(getExecution("nonexistent-id"));
    expect(result._tag).toBe("Success");
    if (result._tag === "Success") {
      expect(result.value).toBeNull();
    }
  });

  it("listExecutions respects limit and offset", async () => {
    for (let i = 0; i < 5; i++) {
      const exec: AutomationExecution = {
        id: `0191a000-${String(i).padStart(4, "0")}-7890-abcd-ef0123456789`,
        rule_id: "rule-001",
        status: "success",
        trigger_kind: "scheduled",
        started_at: 1_725_558_000_000 + i,
        completed_at: 1_725_558_000_000 + i + 10,
        duration_ms: 10,
        final_text: null,
        exit_code: 0,
        stderr: null,
        error: null,
        metadata_json: null,
      };
      await Effect.runPromiseExit(insertExecution(exec));
    }

    const limitResult = await Effect.runPromiseExit(listExecutions({ limit: 3 }));
    expect(limitResult._tag).toBe("Success");
    if (limitResult._tag === "Success") {
      expect(limitResult.value).toHaveLength(3);
    }

    const offsetResult = await Effect.runPromiseExit(listExecutions({ limit: 3, offset: 2 }));
    expect(offsetResult._tag).toBe("Success");
    if (offsetResult._tag === "Success") {
      expect(offsetResult.value).toHaveLength(3);
    }
  });
});
