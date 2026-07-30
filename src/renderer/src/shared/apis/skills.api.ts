
import { Effect, Layer, Context } from "effect";
import { invoke } from "./invoke.api";
import type { SkillManifest } from "@codeman-frontend/shared/lib/types";
import type { AppError } from "@codeman-frontend/shared/lib/errors";

export class SkillsApi extends Context.Tag("SkillsApi")<
  SkillsApi,
  {
    readonly scan: () => Effect.Effect<SkillManifest[], AppError>;
    readonly load: (name: string) => Effect.Effect<string, AppError>;
  }
>() {}

export const SkillsApiLive = Layer.succeed(SkillsApi, {
  scan: () => invoke<SkillManifest[]>("skillsScan"),
  load: (name: string) => invoke<string>("skillsLoad", { name }),
});
