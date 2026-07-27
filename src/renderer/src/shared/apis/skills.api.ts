//! SkillsApi domain (ADR-0031 Wave A3) — extracted from ipc.ts for domain split.
//!
//! Wraps the 2 skills IPC channels: skillsScan, skillsLoad.

import { Effect, Layer, Context } from "effect";
import { invoke } from "./invoke.api";
import type { SkillManifest } from "@codeman-frontend/shared/lib/types";
import type { AppError } from "@codeman-frontend/shared/lib/errors";

// ─── SkillsApi tag ───────────────────────────────────────

// Skills plugin service (ADR-0031 Wave A3) — wraps the 2 skills IPC channels.
export class SkillsApi extends Context.Tag("SkillsApi")<
  SkillsApi,
  {
    readonly scan: () => Effect.Effect<SkillManifest[], AppError>;
    readonly load: (name: string) => Effect.Effect<string, AppError>;
  }
>() {}

// ─── SkillsApi live layer ────────────────────────────────

export const SkillsApiLive = Layer.succeed(SkillsApi, {
  scan: () => invoke<SkillManifest[]>("skillsScan"),
  load: (name: string) => invoke<string>("skillsLoad", { name }),
});
