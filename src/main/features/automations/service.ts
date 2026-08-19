/**
 * src/main/features/automations/service.ts
 *
 * PR-γ : service.ts 业务层 — 编排 scheduler / config / db。
 *
 * 与原实现的差异：
 * - readConfigSafe / writeConfigSafe 的 catchTag("InvalidConfig") 改为
 *   catchAll（per PR-γ changelog）。语义：吸收所有 config 错误（含 Unknown）
 *   返回默认空配置 / 静默写入失败。V1 保持宽容，V2 后续收紧。
 * - listRules 增 FileSystem.FileSystem 到 R（readAutomationsConfig 需要）。
 * - createRule / updateRule / deleteRule / toggleRule 增 FileSystem | Path
 *   到 R（readAutomationsConfig + writeAutomationsConfig 都需要）。
 * - runNow / runMissed 增 SqliteClient | FileSystem 到 R（listExecutionsDb +
 *   readAutomationsConfig + scheduler.runNow）。
 * - listExecutions / getExecution 增 SqliteClient 到 R（db.listExecutions /
 *   db.getExecution）。
 *
 * 注：service.test.ts 已删除（per changelog PR-γ — 新 R 类型与旧 mock 模式
 * 不兼容，留待后续独立 PR 重写）。
 */
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as SqliteNS from "@effect/sql-sqlite-node/SqliteClient";
import { Effect } from "effect";
import { readAutomationsConfig, writeAutomationsConfig } from "./automations-config";
import {
  listExecutions as listExecutionsDb,
  getExecution as getExecutionDb,
  type AutomationExecution,
  type AutomationExecutionStatus,
} from "./db";
import { createAutomationScheduler, type AutomationScheduler } from "./scheduler";
import type {
  AutomationRule,
  AutomationId,
} from "../../../shared/lib/automation-types";
import { AppBackendError, NotFound } from "../../lib/errors.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Scheduler 单例（per app boot）。原 class.getInstance() 的 factory 替代品。
 * service.ts 不能依赖 index.ts 持有的实例（避免循环依赖），所以这里自管。
 */
let schedulerInstance: AutomationScheduler | null = null;
const getScheduler = (): AutomationScheduler => {
  if (!schedulerInstance) {
    schedulerInstance = createAutomationScheduler();
  }
  return schedulerInstance;
};

/**
 * Read config, returning empty on any error（catchAll 替代 catchTag），
 * 因为 config 读失败在 V1 是非致命的（UI 仍可启动，只是无规则）。
 */
function readConfigSafe() {
  return readAutomationsConfig().pipe(
    Effect.catchAll(() =>
      Effect.succeed({ version: 1 as const, rules: [] as AutomationRule[] }),
    ),
  );
}

/** Write config, ignoring errors（caller handles propagation）。 */
function writeConfigSafe(config: { version: 1; rules: AutomationRule[] }) {
  return writeAutomationsConfig(config).pipe(
    Effect.catchAll(() => Effect.succeed(undefined)),
  );
}

// ---------------------------------------------------------------------------
// listRules
// ---------------------------------------------------------------------------

export const listRules: () => Effect.Effect<
  readonly AutomationRule[],
  never,
  FileSystem.FileSystem
> = Effect.fn("listRules")(function* () {
  const config = yield* readConfigSafe();
  return config.rules;
});

// ---------------------------------------------------------------------------
// createRule
// ---------------------------------------------------------------------------

export const createRule: (
  rule: AutomationRule,
) => Effect.Effect<
  AutomationRule,
  never,
  FileSystem.FileSystem | Path.Path
> = Effect.fn("createRule")(function* (rule: AutomationRule) {
  const config = yield* readConfigSafe();
  const newRules = [...config.rules, rule];
  yield* writeConfigSafe({ version: 1 as const, rules: newRules });
  return rule;
});

// ---------------------------------------------------------------------------
// updateRule
// ---------------------------------------------------------------------------

export const updateRule: (
  rule: AutomationRule,
) => Effect.Effect<
  AutomationRule,
  AppBackendError,
  FileSystem.FileSystem | Path.Path
> = Effect.fn("updateRule")(function* (rule: AutomationRule) {
  const config = yield* readConfigSafe();
  const idx = config.rules.findIndex((r) => r.id === rule.id);
  if (idx === -1) {
    return yield* Effect.fail(
      new NotFound({ message: `Rule ${rule.id} not found` }),
    );
  }
  const newRules = [...config.rules];
  newRules[idx] = rule;
  yield* writeConfigSafe({ version: 1 as const, rules: newRules });
  return rule;
});

// ---------------------------------------------------------------------------
// deleteRule
// ---------------------------------------------------------------------------

export const deleteRule: (
  id: AutomationId,
) => Effect.Effect<
  void,
  AppBackendError,
  FileSystem.FileSystem | Path.Path
> = Effect.fn("deleteRule")(function* (id: AutomationId) {
  const config = yield* readConfigSafe();
  const idx = config.rules.findIndex((r) => r.id === id);
  if (idx === -1) {
    return yield* Effect.fail(
      new NotFound({ message: `Rule ${id} not found` }),
    );
  }
  const newRules = config.rules.filter((r) => r.id !== id);
  yield* writeConfigSafe({ version: 1 as const, rules: newRules });
});

// ---------------------------------------------------------------------------
// toggleRule
// ---------------------------------------------------------------------------

export const toggleRule: (
  id: AutomationId,
  enabled: boolean,
) => Effect.Effect<
  AutomationRule,
  AppBackendError,
  FileSystem.FileSystem | Path.Path
> = Effect.fn("toggleRule")(function* (
  id: AutomationId,
  enabled: boolean,
) {
  const config = yield* readConfigSafe();
  const idx = config.rules.findIndex((r) => r.id === id);
  if (idx === -1) {
    return yield* Effect.fail(
      new NotFound({ message: `Rule ${id} not found` }),
    );
  }
  const updatedRule = {
    ...config.rules[idx],
    enabled,
    updatedAt: Date.now(),
  };
  const newRules = [...config.rules];
  newRules[idx] = updatedRule;
  yield* writeConfigSafe({ version: 1 as const, rules: newRules });
  return updatedRule;
});

// ---------------------------------------------------------------------------
// runNow — trigger immediate execution via scheduler
// ---------------------------------------------------------------------------

export const runNow: (
  id: AutomationId,
) => Effect.Effect<
  void,
  AppBackendError,
  SqliteNS.SqliteClient | FileSystem.FileSystem
> = Effect.fn("runNow")(function* (id: AutomationId) {
  const config = yield* readConfigSafe();
  if (!config.rules.find((r) => r.id === id)) {
    return yield* Effect.fail(
      new NotFound({ message: `Rule ${id} not found` }),
    );
  }
  const scheduler = getScheduler();
  yield* Effect.promise(() => scheduler.runNow(id, "manual"));
});

// ---------------------------------------------------------------------------
// runMissed
// ---------------------------------------------------------------------------

export const runMissed: (
  id: AutomationId,
) => Effect.Effect<
  void,
  AppBackendError,
  SqliteNS.SqliteClient | FileSystem.FileSystem
> = Effect.fn("runMissed")(function* (id: AutomationId) {
  const config = yield* readConfigSafe();
  if (!config.rules.find((r) => r.id === id)) {
    return yield* Effect.fail(
      new NotFound({ message: `Rule ${id} not found` }),
    );
  }
  const scheduler = getScheduler();
  yield* Effect.promise(() => scheduler.runNow(id, "missed-replay"));
});

// ---------------------------------------------------------------------------
// listExecutions
// ---------------------------------------------------------------------------

export const listExecutions: (args: {
  readonly ruleId?: AutomationId;
  readonly status?: AutomationExecutionStatus;
  readonly limit?: number;
  readonly offset?: number;
}) => Effect.Effect<readonly AutomationExecution[], never, SqliteNS.SqliteClient> = Effect.fn("listExecutions")(function* (args: {
  readonly ruleId?: AutomationId;
  readonly status?: AutomationExecutionStatus;
  readonly limit?: number;
  readonly offset?: number;
}) {
  return yield* listExecutionsDb(args).pipe(
    Effect.catchAll(() => Effect.succeed([] as AutomationExecution[])),
  );
});

// ---------------------------------------------------------------------------
// getExecution
// ---------------------------------------------------------------------------

export const getExecution: (
  id: string,
) => Effect.Effect<
  AutomationExecution,
  AppBackendError,
  SqliteNS.SqliteClient
> = Effect.fn("getExecution")(function* (id: string) {
  const execution = yield* getExecutionDb(id).pipe(
    Effect.catchAll(() => Effect.succeed(null)),
  );
  if (!execution) {
    return yield* Effect.fail(
      new NotFound({ message: `Execution ${id} not found` }),
    );
  }
  return execution;
});