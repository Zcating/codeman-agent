// ADR-0053 TC — scheduler.ts (Main 端)
import { Effect } from "effect";
import { readAutomationsConfig } from "./automations-config";
import { insertExecution, updateExecutionCompletion, listExecutions } from "./db";
import { executeAction } from "./executor";
import type { AutomationRule, AutomationId, TriggerKind, AutomationSchedule } from "../../../shared/lib/automation-types";

// ---------------------------------------------------------------------------
// Schedule computation (copied from TA's schedule.ts for main-side use)
// ---------------------------------------------------------------------------

function computeNextDelay(schedule: AutomationSchedule, _lastCompletedAt: number, now: number): number {
  switch (schedule.kind) {
    case "interval":
      return schedule.everyMs;
    case "daily":
      return delayUntilDaily(schedule.hour, schedule.minute, now);
    case "weekly":
      return delayUntilWeekly(schedule.weekday, schedule.hour, schedule.minute, now);
  }
}

function delayUntilDaily(targetHour: number, targetMinute: number, now: number): number {
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
    const tomorrowAtTarget = new Date(todayAtTarget.getTime() + 24 * 60 * 60 * 1000);
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

  const targetDate = new Date(nowDate.getTime() + daysUntilTarget * 24 * 60 * 60 * 1000);
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
// AutomationScheduler singleton
// ---------------------------------------------------------------------------

export class AutomationScheduler {
  private static _instance: AutomationScheduler | null = null;

  private timers: Map<AutomationId, NodeJS.Timeout> = new Map();
  private queues: Map<AutomationId, Array<() => Promise<void>>> = new Map();
  private running: Set<AutomationId> = new Set();
  private ruleCache: Map<AutomationId, AutomationRule> = new Map();
  private lastCompletedAt: Map<AutomationId, number> = new Map();

  private constructor() {}

  static getInstance(): AutomationScheduler {
    if (!AutomationScheduler._instance) {
      AutomationScheduler._instance = new AutomationScheduler();
    }
    return AutomationScheduler._instance;
  }

  /**
   * Start the scheduler: load rules, detect missed runs, register timers.
   */
  async start(): Promise<void> {
    const config = await Effect.runPromise(readAutomationsConfig());
    const now = Date.now();

    for (const rule of config.rules) {
      this.ruleCache.set(rule.id, rule);
      if (!rule.enabled) continue;

      // Detect missed runs: check last completed execution
      const lastExec = await Effect.runPromiseExit(
        listExecutions({ ruleId: rule.id, limit: 1 }),
      );
      let lastCompleted = 0;
      if (lastExec._tag === "Success" && lastExec.value.length > 0) {
        const exec = lastExec.value[0];
        if (exec.completed_at != null) {
          lastCompleted = exec.completed_at;
          this.lastCompletedAt.set(rule.id, lastCompleted);
        }
      }

      // Missed-run detection: if now > lastCompleted + period (strict 1× period per ADR-0053 T16)
      const period = this.getPeriodMs(rule.schedule);
      if (lastCompleted > 0 && now > lastCompleted + period) {
        // Missed replay — enqueue without updating lastCompleted
        this.enqueue(rule.id, "missed-replay");
      }

      this.scheduleNext(rule.id, rule.schedule, now);
    }
  }

  /**
   * Stop the scheduler: clear all timers.
   */
  stop(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.queues.clear();
    this.running.clear();
  }

  /**
   * Trigger immediate execution of a rule (manual run from IPC).
   */
  async runNow(ruleId: AutomationId, triggerKind: TriggerKind): Promise<void> {
    if (!this.ruleCache.has(ruleId)) {
      throw new Error(`AutomationScheduler.runNow: unknown rule ${ruleId}`);
    }
    this.enqueue(ruleId, triggerKind);
  }

  /**
   * Enqueue a rule execution (FIFO per rule, parallel across rules).
   */
  private enqueue(ruleId: AutomationId, triggerKind: TriggerKind): void {
    const task = async () => {
      await this.executeRule(ruleId, triggerKind);
    };

    if (!this.queues.has(ruleId)) {
      this.queues.set(ruleId, []);
    }
    this.queues.get(ruleId)!.push(task);

    // If not currently running, kick off processing
    if (!this.running.has(ruleId)) {
      this.processQueue(ruleId);
    }
  }

  /**
   * Process the FIFO queue for a rule.
   */
  private async processQueue(ruleId: AutomationId): Promise<void> {
    const queue = this.queues.get(ruleId);
    if (!queue || queue.length === 0) {
      this.running.delete(ruleId);
      return;
    }

    this.running.add(ruleId);
    const task = queue.shift()!;

    try {
      await task();
    } catch (e) {
      console.error(`[scheduler] rule ${ruleId} execution failed:`, e);
    }

    // Process next in queue
    if (this.queues.has(ruleId) && this.queues.get(ruleId)!.length > 0) {
      this.processQueue(ruleId);
    } else {
      this.running.delete(ruleId);
      this.queues.delete(ruleId);
    }
  }

  /**
   * Execute a single rule.
   */
  private async executeRule(ruleId: AutomationId, triggerKind: TriggerKind): Promise<void> {
    const rule = this.ruleCache.get(ruleId);
    if (!rule) return;

    const executionId = crypto.randomUUID();
    const startedAt = Date.now();

    // Insert pending execution record
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

    // Execute the action
    const result = await Effect.runPromise(
      executeAction(rule, triggerKind, executionId),
    );

    const completedAt = Date.now();
    const durationMs = completedAt - startedAt;

    // Update execution record
    // Map ExecutionOutcome status to AutomationExecutionStatus
    // "error" in ExecutionOutcome maps to "failure" in DB
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

    // Update last completed timestamp for missed-run detection
    if (result.status === "success" || result.status === "failure") {
      this.lastCompletedAt.set(ruleId, completedAt);
    }

    // Schedule next run if still enabled
    const updatedRule = this.ruleCache.get(ruleId);
    if (updatedRule?.enabled) {
      this.scheduleNext(ruleId, updatedRule.schedule, completedAt);
    }
  }

  /**
   * Schedule the next timer for a rule.
   */
  private scheduleNext(ruleId: AutomationId, schedule: AutomationSchedule, now: number): void {
    // Clear existing timer if any
    const existing = this.timers.get(ruleId);
    if (existing) clearTimeout(existing);

    const delay = computeNextDelay(schedule, now, now);
    const timer = setTimeout(() => {
      this.timers.delete(ruleId);
      this.enqueue(ruleId, "scheduled");
    }, delay);

    this.timers.set(ruleId, timer);
  }

  /**
   * Get the period in ms for a schedule (for missed-run detection).
   */
  private getPeriodMs(schedule: AutomationSchedule): number {
    switch (schedule.kind) {
      case "interval":
        return schedule.everyMs;
      case "daily":
        return 24 * 60 * 60 * 1000;
      case "weekly":
        return 7 * 24 * 60 * 60 * 1000;
    }
  }

  /**
   * Internal: getRule for testing purposes.
   */
  getRule(ruleId: AutomationId): AutomationRule | undefined {
    return this.ruleCache.get(ruleId);
  }
}
