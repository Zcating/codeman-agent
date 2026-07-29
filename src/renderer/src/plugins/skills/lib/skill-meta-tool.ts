// Skills meta-tool — `_load_skill` AgentTool (ADR-0031 D4)。
//
// 注入到 runtime tools[] 数组的特殊 meta-tool。前缀下划线暗示 meta 性质:
// LLM 主动调用以拉取 Skill 全文 body。
//
// 与现有 tool result 路径同语义 — body 走 tool_result message 流 (不进 system prompt
// 永久拼), 避免永久累积撑爆 context window。

import { Effect, Exit, Schema } from "effect";
import { toToolParameters } from "@codeman-frontend/shared/lib/tool-schema";
import type { Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { SkillsApi, SkillsApiLive } from "@codeman-frontend/shared/apis";
import { AppError } from "@codeman-frontend/shared/lib/errors";

const LoadSkillParamsSchema = Schema.Struct({
  skillName: Schema.String,
});

const loadSkillParams = toToolParameters(LoadSkillParamsSchema);

const loadSkill = Effect.fnUntraced(
  function* (typedArgs: Static<typeof loadSkillParams>) {
    const svc = yield* SkillsApi;
    return yield* svc.load(typedArgs.skillName);
  },
  Effect.provide(SkillsApiLive),
);

export const loadSkillTool: AgentTool<typeof loadSkillParams, string | AppError> = {
  label: "_load_skill",
  name: "_load_skill",
  description:
    "Load the full instructions of a previously-listed skill into the conversation context. " +
    "Call this when a user's request matches a skill's purpose. The skill body is returned " +
    "as a tool result and is NOT permanently added to the system prompt — re-call if needed " +
    "after a context restart.",
  parameters: loadSkillParams,
  execute: async (_toolCallId, args) => {
    const typedArgs = args as Static<typeof loadSkillParams>;
    const exit = await Effect.runPromiseExit(loadSkill(typedArgs));
    if (Exit.isFailure(exit)) {
      const cause = exit.cause;
      const err: AppError =
        cause._tag === "Fail"
          ? (cause.error as AppError)
          : ({ _tag: "Unknown", message: String(cause) } as AppError);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error (${err._tag}): ${"message" in err ? err.message : JSON.stringify(err)}`,
          },
        ],
        details: err,
      };
    }
    return {
      content: [{ type: "text" as const, text: exit.value }],
      details: exit.value,
    };
  },
};