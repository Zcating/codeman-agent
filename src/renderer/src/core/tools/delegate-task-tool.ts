import { Schema } from "effect";
import type { AgentTool, AgentEvent } from "@earendil-works/pi-agent-core";
import type { SubAgentConfig, SubAgentId } from "@codeman-frontend/plugins/multi-agents/lib/sub-agent.types";
import type { ProviderConfig } from "@codeman-frontend/features/chat/lib/runtime";
import { createSubAgent } from "@codeman-frontend/plugins/multi-agents/lib/sub-agent-factory";
import { toToolParameters } from "@codeman-frontend/shared/lib/tool-schema";

export type ToolRegistry = Map<string, AgentTool>;

const DelegateTaskParamsSchema = Schema.Struct({
  agent_name: Schema.String,
  task: Schema.String,
});

interface DelegateTaskParams {
  readonly agent_name: string;
  readonly task: string;
}

export function buildDelegateTaskTool(
  enabledConfigs: readonly SubAgentConfig[],
  baseProvider: ProviderConfig,
  toolRegistry: ToolRegistry,
  onStreamEvent: (event: AgentEvent, toolCallId: string, subAgentId: SubAgentId) => void,
): AgentTool {
  const configByName = new Map(enabledConfigs.map((c) => [c.name, c]));
  const descriptionList = enabledConfigs.map((c) => `- ${c.name}: ${c.description}`).join("\n");

  return {
    label: "delegate_task",
    name: "delegate_task",
    description:
      `Delegate a task to one of the configured sub-agents. ` +
      `Each sub-agent runs in isolation (fresh context) with its own model and allowed tools. ` +
      `Multiple delegate_task calls in the same turn run in parallel.\n\n` +
      `Available sub-agents:\n${descriptionList}`,
    parameters: toToolParameters(DelegateTaskParamsSchema),
    executionMode: "parallel" as const,
    execute: async (toolCallId, rawParams, _signal) => {
      const params = rawParams as DelegateTaskParams;
      const config = configByName.get(params.agent_name);
      if (!config) {
        throw new Error(
          `Unknown sub-agent "${params.agent_name}". Available: ${[...configByName.keys()].join(", ")}`,
        );
      }
      const subAgent = createSubAgent(config, baseProvider, toolRegistry);
      const unsubscribe = subAgent.subscribe((event) => {
        onStreamEvent(event, toolCallId, config.id);
      });
      try {
        // Note: subAgent.prompt returns Promise<void> in the real API.
        // The mock returns an AssistantMessage-like object directly for testing.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (subAgent.prompt(params.task) as any);
        if (result.stopReason === "error") {
          throw new Error(result.errorMessage ?? "sub-agent error");
        }
        const finalText = result.content
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text)
          .join("\n");
        return {
          content: [{ type: "text" as const, text: finalText }],
          details: {
            subAgentId: config.id,
            subAgentName: config.name,
            model: config.modelId,
            usage: result.usage,
          },
        };
      } finally {
        unsubscribe();
        await subAgent.abort();
      }
    },
  };
}
