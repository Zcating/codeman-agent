import { Effect, Exit } from "effect";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { McpApi, McpApiLive } from "@codeman-frontend/shared/apis";
import type { McpToolEntry } from "@codeman-frontend/shared/lib/types";
import { AppError } from "@codeman-frontend/shared/lib/errors";
import type { TSchema } from "@sinclair/typebox";

export function buildMcpTools(entries: readonly McpToolEntry[]): AgentTool<TSchema, unknown>[] {
  return entries.map((entry) => ({
    label: entry.agentName,
    name: entry.agentName,
    description: entry.description,
    parameters: entry.inputSchema as TSchema,
    execute: async (_toolCallId: string, args: unknown): Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }> => {
      const callToolEffect = Effect.gen(function* () {
        const svc = yield* McpApi;
        return yield* svc.callTool(entry.serverName, entry.toolName, args as Record<string, unknown>);
      }).pipe(Effect.provide(McpApiLive));

      const exit = await Effect.runPromiseExit(callToolEffect);
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
              text: `MCP tool error (${err._tag}): ${"message" in err ? err.message : JSON.stringify(err)}`,
            },
          ],
          details: err,
        };
      }
      const result = exit.value as { content: Array<{ type: string; text?: string;[k: string]: unknown }> };
      return {
        content: result.content.map((block) => {
          if (block.type === "text" && block.text !== undefined) {
            return { type: "text" as const, text: block.text };
          }
          return { type: "text" as const, text: JSON.stringify(block) };
        }),
        details: result,
      };
    },
  }));
}
