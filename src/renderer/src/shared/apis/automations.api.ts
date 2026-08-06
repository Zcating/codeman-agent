import { Effect, Layer, Context } from "effect";
import { invoke } from "./invoke.api";
import type { AppError } from "@codeman-frontend/shared/lib/errors";
import type {
  AutomationRule,
  AutomationId,
} from "@codeman-frontend/shared/lib/automation-types";
import type { AutomationExecution } from "./invoke.api";

export class AutomationsApi extends Context.Tag("AutomationsApi")<
  AutomationsApi,
  {
    readonly listRules: () => Effect.Effect<readonly AutomationRule[], AppError>;
    readonly createRule: (rule: AutomationRule) => Effect.Effect<AutomationRule, AppError>;
    readonly updateRule: (rule: AutomationRule) => Effect.Effect<AutomationRule, AppError>;
    readonly deleteRule: (id: AutomationId) => Effect.Effect<void, AppError>;
    readonly toggleRule: (id: AutomationId, enabled: boolean) => Effect.Effect<AutomationRule, AppError>;
    readonly runNow: (id: AutomationId) => Effect.Effect<void, AppError>;
    readonly listExecutions: (args: {
      ruleId?: AutomationId;
      limit?: number;
      offset?: number;
    }) => Effect.Effect<readonly AutomationExecution[], AppError>;
    readonly getExecution: (id: string) => Effect.Effect<AutomationExecution, AppError>;
    readonly runMissed: (id: AutomationId) => Effect.Effect<void, AppError>;
  }
>() {}

export const AutomationsApiLive = Layer.succeed(AutomationsApi, {
  listRules: () => invoke<readonly AutomationRule[]>("automationsList"),
  createRule: (rule) => invoke<AutomationRule>("automationsCreate", rule),
  updateRule: (rule) => invoke<AutomationRule>("automationsUpdate", rule),
  deleteRule: (id) => invoke<void>("automationsDelete", { id }),
  toggleRule: (id, enabled) => invoke<AutomationRule>("automationsToggle", { id, enabled }),
  runNow: (id) => invoke<void>("automationsRunNow", { id }),
  listExecutions: (args) =>
    invoke<readonly AutomationExecution[]>("automationsListExecutions", args),
  getExecution: (id) => invoke<AutomationExecution>("automationsGetExecution", { id }),
  runMissed: (id) => invoke<void>("automationsRunMissed", { id }),
});
