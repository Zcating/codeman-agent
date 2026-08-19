import { Effect } from "effect";
import Database from "better-sqlite3";
import { Database as DatabaseError } from "../../../renderer/src/shared/lib/errors";
import type { TriggerKind } from "../../../shared/lib/automation-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AutomationExecutionStatus =
  | "pending"
  | "running"
  | "success"
  | "failure"
  | "timeout"
  | "skipped"
  | "missed";

export interface AutomationExecution {
  readonly id: string;
  readonly rule_id: string;
  readonly status: AutomationExecutionStatus;
  readonly trigger_kind: TriggerKind;
  readonly started_at: number;
  readonly completed_at: number | null;
  readonly duration_ms: number | null;
  readonly final_text: string | null;
  readonly exit_code: number | null;
  readonly stderr: string | null;
  readonly error: string | null;
  readonly metadata_json: string | null;
}

// ---------------------------------------------------------------------------
// Prepared statements (module-level singleton per process)
// ---------------------------------------------------------------------------

let _db: Database.Database | null = null;

export function setDatabase(db: Database.Database): void {
  _db = db;
}

function getDb(): Database.Database {
  if (!_db) {
    throw new Error("automation_executions DAO: database not initialized. Call setDatabase() first.");
  }
  return _db;
}

// ---------------------------------------------------------------------------
// insertExecution
// ---------------------------------------------------------------------------

export const insertExecution = (input: AutomationExecution): Effect.Effect<void, DatabaseError> =>
  Effect.try({
    try: () => {
      const db = getDb();
      const stmt = db.prepare(`
        INSERT INTO automation_executions (
          id, rule_id, status, trigger_kind, started_at,
          completed_at, duration_ms, final_text, exit_code, stderr, error, metadata_json
        ) VALUES (
          @id, @rule_id, @status, @trigger_kind, @started_at,
          @completed_at, @duration_ms, @final_text, @exit_code, @stderr, @error, @metadata_json
        )
      `);
      stmt.run({
        id: input.id,
        rule_id: input.rule_id,
        status: input.status,
        trigger_kind: input.trigger_kind,
        started_at: input.started_at,
        completed_at: input.completed_at,
        duration_ms: input.duration_ms,
        final_text: input.final_text,
        exit_code: input.exit_code,
        stderr: input.stderr,
        error: input.error,
        metadata_json: input.metadata_json,
      });
    },
    catch: (e) =>
      new DatabaseError({
        message: `insertExecution failed: ${String(e)}`,
        cause: String(e),
      }),
  });

// ---------------------------------------------------------------------------
// updateExecutionCompletion
// ---------------------------------------------------------------------------

export const updateExecutionCompletion = (
  id: string,
  fields: {
    readonly status: AutomationExecutionStatus;
    readonly completed_at: number;
    readonly duration_ms: number;
    readonly final_text?: string;
    readonly exit_code?: number;
    readonly stderr?: string;
    readonly error?: string;
  },
): Effect.Effect<void, DatabaseError> =>
  Effect.try({
    try: () => {
      const db = getDb();
      const sets: string[] = ["status = @status", "completed_at = @completed_at", "duration_ms = @duration_ms"];
      const params: Record<string, unknown> = {
        id,
        status: fields.status,
        completed_at: fields.completed_at,
        duration_ms: fields.duration_ms,
      };
      if (fields.final_text !== undefined) {
        sets.push("final_text = @final_text");
        params.final_text = fields.final_text;
      }
      if (fields.exit_code !== undefined) {
        sets.push("exit_code = @exit_code");
        params.exit_code = fields.exit_code;
      }
      if (fields.stderr !== undefined) {
        sets.push("stderr = @stderr");
        params.stderr = fields.stderr;
      }
      if (fields.error !== undefined) {
        sets.push("error = @error");
        params.error = fields.error;
      }
      const sql = `UPDATE automation_executions SET ${sets.join(", ")} WHERE id = @id`;
      const stmt = db.prepare(sql);
      stmt.run(params);
    },
    catch: (e) =>
      new DatabaseError({
        message: `updateExecutionCompletion failed: ${String(e)}`,
        cause: String(e),
      }),
  });

// ---------------------------------------------------------------------------
// listExecutions
// ---------------------------------------------------------------------------

export const listExecutions = (filter: {
  readonly ruleId?: string;
  readonly status?: AutomationExecutionStatus;
  readonly limit?: number;
  readonly offset?: number;
}): Effect.Effect<AutomationExecution[], DatabaseError> =>
  Effect.try({
    try: () => {
      const db = getDb();
      const conditions: string[] = [];
      const params: Record<string, unknown> = {};

      if (filter.ruleId !== undefined) {
        conditions.push("rule_id = @ruleId");
        params.ruleId = filter.ruleId;
      }
      if (filter.status !== undefined) {
        conditions.push("status = @status");
        params.status = filter.status;
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = filter.limit !== undefined ? filter.limit : 100;
      const offset = filter.offset !== undefined ? filter.offset : 0;
      params.limit = limit;
      params.offset = offset;

      const sql = `SELECT * FROM automation_executions ${where} ORDER BY started_at DESC LIMIT @limit OFFSET @offset`;
      const stmt = db.prepare(sql);
      return stmt.all(params) as AutomationExecution[];
    },
    catch: (e) =>
      new DatabaseError({
        message: `listExecutions failed: ${String(e)}`,
        cause: String(e),
      }),
  });

// ---------------------------------------------------------------------------
// getExecution
// ---------------------------------------------------------------------------

export const getExecution = (id: string): Effect.Effect<AutomationExecution | null, DatabaseError> =>
  Effect.try({
    try: () => {
      const db = getDb();
      const stmt = db.prepare("SELECT * FROM automation_executions WHERE id = ?");
      const row = stmt.get(id) as AutomationExecution | undefined;
      return row ?? null;
    },
    catch: (e) =>
      new DatabaseError({
        message: `getExecution failed: ${String(e)}`,
        cause: String(e),
      }),
  });
