import { Effect, Layer, Context } from "effect";
import { invoke } from "./invoke.api";
import type { AppError } from "@codeman-frontend/shared/lib/errors";
import type { SubAgentConfig } from "@codeman-frontend/shared/lib/sub-agent-schema";

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
  list: () => invoke<readonly SubAgentConfig[]>("subAgentsList"),
  add: (config) => invoke<SubAgentConfig>("subAgentsAdd", config),
  update: (id, patch) => invoke<SubAgentConfig>("subAgentsUpdate", { id, patch }),
  delete: (id) => invoke<void>("subAgentsDelete", { id }),
  setEnabled: (id, enabled) => invoke<SubAgentConfig>("subAgentsSetEnabled", { id, enabled }),
});
