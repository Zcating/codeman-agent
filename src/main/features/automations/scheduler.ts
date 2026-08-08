/**
 * src/main/features/automations/scheduler.ts
 *
 * PR-γ (ADR-0058): AutomationScheduler class → `createAutomationScheduler()`
 * factory 形式。singleton `getInstance()` 移除；改为调用方通过工厂创建实例，
 * 由 index.ts 持有单例（per boot path）。
 *
 * `start()` 改为 Effect-returning，R 通道要求 SqliteClient（listExecutions）
 * + FileSystem.FileSystem（readAutomationsConfig）。
 *
 * 与原 class 实现的差异：
 * - 状态从私有字段改为工厂闭包捕获
 * - 配置 IO 走 readAutomationsConfig（PR-γ 后的 Effect API）
 * - start 改为 Effect；其余保持 Promise / sync 签名（stop / runNow / getRule）
 * - runNow 仍走 Promise 路径（enqueue 是 sync，不需要 FileSystem 服务）
 */
import * as FileSystem from "@effect/platform/FileSystem";
import { Effect } from "effect";
import * as SqliteNS from "@effect/sql-sqlite-node/SqliteClient";
import { AppBackendError } from "../../lib/errors.js";
import { Database } from "../../../renderer/src/shared/lib/errors";
import { readAutomationsConfig } from "./automations-config";
import { insertExecution, listExecutions, updateExecutionCompletion } from "./db";
import { executeAction } from "./executor";
import type {
  AutomationRule,
  AutomationId,
  TriggerKind,
  AutomationSchedule,
} from "../../../shared/lib/automation-types";

// ---------------------------------------------------------------------------
// Schedule computation
// ---------------------------------------------------------------------------

function computeNextDelay(
  schedule: AutomationSchedule,
  _lastCompletedAt: number,
  now: number,
): number {
  switch (schedule.kind) {
    case "interval":
      return schedule.everyMs;
    case "daily":
      return delayUntilDaily(schedule.hour, schedule.minute, now);
    case "weekly":
      return delayUntilWeekly(
        schedule.weekday,
        schedule.hour,
        schedule.minute,
        now,
      );
  }
}

function delayUntilDaily(
  targetHour: number,
  targetMinute: number,
  now: number,
): number {
  const nowDate = new Date(now);
  const todayAtTarget = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate(),
    targetHour,
    targetMinute,
    0,
    0,
  );
  if (todayAtTarget.getTime() <= now) {
    const tomorrowAtTarget = new Date(
      todayAtTarget.getTime() + 24 * 60 * 60 * 1000,
    );
    return tomorrowAtTarget.getTime() - now;
  }
  return todayAtTarget.getTime() - now;
}

function delayUntilWeekly(
  targetWeekday: 0 | 1 | 2 | 3 | 4 | 5 | 6,
  targetHour: number,
  targetMinute: number,
  now: number,
): number {
  const nowDate = new Date(now);
  const todayWeekday = nowDate.getDay();

  let daysUntilTarget: number;
  if (targetWeekday > todayWeekday) {
    daysUntilTarget = targetWeekday - todayWeekday;
  } else if (targetWeekday < todayWeekday) {
    daysUntilTarget = 7 - (todayWeekday - targetWeekday);
  } else {
    const todayAtTarget = new Date(
      nowDate.getFullYear(),
      nowDate.getMonth(),
      nowDate.getDate(),
      targetHour,
      targetMinute,
      0,
      0,
    );
    if (todayAtTarget.getTime() <= now) {
      daysUntilTarget = 7;
    } else {
      daysUntilTarget = 0;
    }
  }

  const targetDate = new Date(
    nowDate.getTime() + daysUntilTarget * 24 * 60 * 60 * 1000,
  );
  const targetDateAtTime = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
    targetHour,
    targetMinute,
    0,
    0,
  );
  return targetDateAtTime.getTime() - now;
}

// ---------------------------------------------------------------------------
// AutomationScheduler factory
// ---------------------------------------------------------------------------

export interface AutomationScheduler {
  /**
   * Start the scheduler: load rules, detect missed runs, register timers.
   * R = SqliteClient + FileSystem.FileSystem（listExecutions + readAutomationsConfig）。
   * E = Database | AppBackendError（db 错误 + 配置读错）。
   */
  readonly start: () => Effect.Effect<
    void,
    Database | AppBackendError,
    SqliteNS.SqliteClient | FileSystem.FileSystem
  >;
  /** Stop the scheduler: clear all timers. */
  readonly stop: () => void;
  /** Trigger immediate execution of a rule (manual run from IPC). */
  readonly runNow: (ruleId: AutomationId, triggerKind: TriggerKind) => Promise<void>;
  /** Internal: getRule for testing purposes. */
  readonly getRule: (ruleId: AutomationId) => AutomationRule | undefined;
}

export const createAutomationScheduler = (): AutomationScheduler => {
  const timers = new Map<AutomationId, NodeJS.Timeout>();
  const queues = new Map<
    AutomationId,
    Array<() => Promise<void>>
  >();
  const running = new Set<AutomationId>();
  const ruleCache = new Map<AutomationId, AutomationRule>();
  const lastCompletedAt = new Map<AutomationId, number>();

  const getPeriodMs = (schedule: AutomationSchedule): number => {
    switch (schedule.kind) {
      case "interval":
        return schedule.everyMs;
      case "daily":
        return 24 * 60 * 60 * 1000;
      case "weekly":
        return 7 * 24 * 60 * 60 * 1000;
    }
  };

  const scheduleNext = (
    ruleId: AutomationId,
    schedule: AutomationSchedule,
    now: number,
  ): void => {
    const existing = timers.get(ruleId);
    if (existing) {
      clearTimeout(existing);
    }

    const delay = computeNextDelay(schedule, now, now);
    const timer = setTimeout(() => {
      timers.delete(ruleId);
      enqueue(ruleId, "scheduled");
    }, delay);
    timers.set(ruleId, timer);
  };

  const executeRule = async (
    ruleId: AutomationId,
    triggerKind: TriggerKind,
  ): Promise<void> => {
    const rule = ruleCache.get(ruleId);
    if (!rule) {
      return;
    }

    const executionId = crypto.randomUUID();
    const startedAt = Date.now();

    await Effect.runPromise(
      insertExecution({
        id: executionId,
        rule_id: ruleId,
        status: "running",
        trigger_kind: triggerKind,
        started_at: startedAt,
        completed_at: null,
        duration_ms: null,
        final_text: null,
        exit_code: null,
        stderr: null,
        error: null,
        metadata_json: null,
      }),
    );

    const result = await Effect.runPromise(
      executeAction(rule, triggerKind, executionId),
    );

    const completedAt = Date.now();
    const durationMs = completedAt - startedAt;

    const dbStatus = result.status === "error" ? "failure" : result.status;
    await Effect.runPromise(
      updateExecutionCompletion(executionId, {
        status: dbStatus,
        completed_at: completedAt,
        duration_ms: durationMs,
        final_text: result.finalText ?? undefined,
        exit_code: result.exitCode ?? undefined,
        stderr: result.stderr ?? undefined,
        error: result.error ?? undefined,
      }),
    );

    if (result.status === "success" || result.status === "failure") {
      lastCompletedAt.set(ruleId, completedAt);
    }

    const updatedRule = ruleCache.get(ruleId);
    if (updatedRule?.enabled) {
      scheduleNext(ruleId, updatedRule.schedule, completedAt);
    }
  };

  const processQueue = async (ruleId: AutomationId): Promise<void> => {
    const queue = queues.get(ruleId);
    if (!queue || queue.length === 0) {
      running.delete(ruleId);
      return;
    }

    running.add(ruleId);
    const task = queue.shift()!;

    try {
      await task();
    } catch (e) {
      console.error(`[scheduler] rule ${ruleId} execution failed:`, e);
    }

    if (queues.has(ruleId) && queues.get(ruleId)!.length > 0) {
      processQueue(ruleId);
    } else {
      running.delete(ruleId);
      queues.delete(ruleId);
    }
  };

  const enqueue = (ruleId: AutomationId, triggerKind: TriggerKind): void => {
    const task = async () => {
      await executeRule(ruleId, triggerKind);
    };

    if (!queues.has(ruleId)) {
      queues.set(ruleId, []);
    }
    queues.get(ruleId)!.push(task);

    if (!running.has(ruleId)) {
      processQueue(ruleId);
    }
  };

  return {
    start: () =>
      Effect.gen(function* () {
        const config = yield* readAutomationsConfig();
        const now = Date.now();

        for (const rule of config.rules) {
          ruleCache.set(rule.id, rule);
          if (!rule.enabled) {
            continue;
          }

          const lastExec = yield* listExecutions({
            ruleId: rule.id,
            limit: 1,
          }).pipe(Effect.catchAll(() => Effect.succeed([])));
          let lastCompleted = 0;
          if (lastExec.length > 0) {
            const exec = lastExec[0];
            if (exec.completed_at != null) {
              lastCompleted = exec.completed_at;
              lastCompletedAt.set(rule.id, lastCompleted);
            }
          }

          const period = getPeriodMs(rule.schedule);
          if (lastCompleted > 0 && now > lastCompleted + period) {
            enqueue(rule.id, "missed-replay");
          }

          scheduleNext(rule.id, rule.schedule, now);
        }
      }),

    stop: () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
      queues.clear();
      running.clear();
    },

    runNow: async (ruleId, triggerKind) => {
      if (!ruleCache.has(ruleId)) {
        throw new Error(
          `AutomationScheduler.runNow: unknown rule ${ruleId}`,
        );
      }
      enqueue(ruleId, triggerKind);
    },

    getRule: (ruleId) => ruleCache.get(ruleId),
  };
};