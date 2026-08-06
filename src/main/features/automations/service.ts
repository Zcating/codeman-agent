// ADR-0053 TC — service.ts (Main 端)
// Business layer: orchestrates scheduler, config, and db for IPC handlers
import { Effect } from "effect";
import { readAutomationsConfig, writeAutomationsConfig } from "./automations-config";
import {
  listExecutions as listExecutionsDb,
  getExecution as getExecutionDb,
  type AutomationExecution,
  type AutomationExecutionStatus,
} from "./db";
import { AutomationScheduler } from "./scheduler";
import type {
  AutomationRule,
  AutomationId,
} from "../../../shared/lib/automation-types";
import { NotFound } from "../../../renderer/src/shared/lib/errors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read config, returning empty on error (config errors are non-fatal for reads) */
function readConfigSafe() {
  return readAutomationsConfig().pipe(
    Effect.catchTag("InvalidConfig", () =>
      Effect.succeed({ version: 1 as const, rules: [] as AutomationRule[] }),
    ),
  );
}

/** Write config, ignoring errors (caller handles propagation) */
function writeConfigSafe(config: { version: 1; rules: AutomationRule[] }) {
  return writeAutomationsConfig(config).pipe(
    Effect.catchAll(() => Effect.succeed(undefined)),
  );
}

// ---------------------------------------------------------------------------
// listRules
// ---------------------------------------------------------------------------

export const listRules = (): Effect.Effect<readonly AutomationRule[], never> =>
  Effect.gen(function* () {
    const config = yield* readConfigSafe();
    return config.rules;
  });

// ---------------------------------------------------------------------------
// createRule
// ---------------------------------------------------------------------------

export const createRule = (rule: AutomationRule): Effect.Effect<AutomationRule, never> =>
  Effect.gen(function* () {
    const config = yield* readConfigSafe();
    const newRules = [...config.rules, rule];
    yield* writeConfigSafe({ version: 1 as const, rules: newRules });
    return rule;
  });

// ---------------------------------------------------------------------------
// updateRule
// ---------------------------------------------------------------------------

export const updateRule = (
  rule: AutomationRule,
): Effect.Effect<AutomationRule, NotFound> =>
  Effect.gen(function* () {
    const config = yield* readConfigSafe();
    const idx = config.rules.findIndex((r) => r.id === rule.id);
    if (idx === -1) {
      return yield* Effect.fail(new NotFound({ message: `Rule ${rule.id} not found` }));
    }
    const newRules = [...config.rules];
    newRules[idx] = rule;
    yield* writeConfigSafe({ version: 1 as const, rules: newRules });
    return rule;
  });

// ---------------------------------------------------------------------------
// deleteRule
// ---------------------------------------------------------------------------

export const deleteRule = (id: AutomationId): Effect.Effect<void, NotFound> =>
  Effect.gen(function* () {
    const config = yield* readConfigSafe();
    const idx = config.rules.findIndex((r) => r.id === id);
    if (idx === -1) {
      return yield* Effect.fail(new NotFound({ message: `Rule ${id} not found` }));
    }
    const newRules = config.rules.filter((r) => r.id !== id);
    yield* writeConfigSafe({ version: 1 as const, rules: newRules });
  });

// ---------------------------------------------------------------------------
// toggleRule
// ---------------------------------------------------------------------------

export const toggleRule = (
  id: AutomationId,
  enabled: boolean,
): Effect.Effect<AutomationRule, NotFound> =>
  Effect.gen(function* () {
    const config = yield* readConfigSafe();
    const idx = config.rules.findIndex((r) => r.id === id);
    if (idx === -1) {
      return yield* Effect.fail(new NotFound({ message: `Rule ${id} not found` }));
    }
    const updatedRule = { ...config.rules[idx], enabled, updatedAt: Date.now() };
    const newRules = [...config.rules];
    newRules[idx] = updatedRule;
    yield* writeConfigSafe({ version: 1 as const, rules: newRules });
    return updatedRule;
  });

// ---------------------------------------------------------------------------
// runNow — trigger immediate execution via scheduler
// ---------------------------------------------------------------------------

export const runNow = (id: AutomationId): Effect.Effect<void, NotFound> =>
  Effect.gen(function* () {
    const config = yield* readConfigSafe();
    if (!config.rules.find((r) => r.id === id)) {
      return yield* Effect.fail(new NotFound({ message: `Rule ${id} not found` }));
    }
    const scheduler = AutomationScheduler.getInstance();
    yield* Effect.promise(() => scheduler.runNow(id, "manual"));
  });

// ---------------------------------------------------------------------------
// runMissed — trigger missed-replay execution via scheduler
// ---------------------------------------------------------------------------

export const runMissed = (id: AutomationId): Effect.Effect<void, NotFound> =>
  Effect.gen(function* () {
    const config = yield* readConfigSafe();
    if (!config.rules.find((r) => r.id === id)) {
      return yield* Effect.fail(new NotFound({ message: `Rule ${id} not found` }));
    }
    const scheduler = AutomationScheduler.getInstance();
    yield* Effect.promise(() => scheduler.runNow(id, "missed-replay"));
  });

// ---------------------------------------------------------------------------
// listExecutions
// ---------------------------------------------------------------------------

export const listExecutions = (args: {
  readonly ruleId?: AutomationId;
  readonly status?: AutomationExecutionStatus;
  readonly limit?: number;
  readonly offset?: number;
}): Effect.Effect<readonly AutomationExecution[], never> =>
  Effect.gen(function* () {
    return yield* listExecutionsDb(args).pipe(
      Effect.catchAll(() => Effect.succeed([] as AutomationExecution[])),
    );
  });

// ---------------------------------------------------------------------------
// getExecution
// ---------------------------------------------------------------------------

export const getExecution = (
  id: string,
): Effect.Effect<AutomationExecution, NotFound> =>
  Effect.gen(function* () {
    const execution = yield* getExecutionDb(id).pipe(
      Effect.catchAll(() => Effect.succeed(null)),
    );
    if (!execution) {
      return yield* Effect.fail(new NotFound({ message: `Execution ${id} not found` }));
    }
    return execution;
  });
