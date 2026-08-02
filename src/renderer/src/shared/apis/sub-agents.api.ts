import { Effect, Layer, Context } from "effect";
import { invoke } from "./invoke.api";
import type { AppError } from "@codeman-frontend/shared/lib/errors";
import type { SubAgentConfig } from "@codeman-frontend/plugins/multi-agents/lib/sub-agent.types";

export class SubAgentsApi extends Context.Tag("SubAgentsApi")<
  SubAgentsApi,
  {
    readonly list: () => Effect.Effect<readonly SubAgentConfig[], AppError>;
    readonly add: (config: SubAgentConfig) => Effect.Effect<SubAgentConfig, AppError>;
    readonly update: (id: string, patch: Partial<SubAgentConfig>) => Effect.Effect<SubAgentConfig, AppError>;
    readonly delete: (id: string) => Effect.Effect<void, AppError>;
    readonly setEnabled: (id: string, enabled: boolean) => Effect.Effect<SubAgentConfig, AppError>;
  }
>() {}

export const SubAgentsApiLive = Layer.succeed(SubAgentsApi, {
  list: () => invoke<readonly SubAgentConfig[]>("subAgents:list"),
  add: (config) => invoke<SubAgentConfig>("subAgents:add", config),
  update: (id, patch) => invoke<SubAgentConfig>("subAgents:update", { id, patch }),
  delete: (id) => invoke<void>("subAgents:delete", { id }),
  setEnabled: (id, enabled) => invoke<SubAgentConfig>("subAgents:setEnabled", { id, enabled }),
});
