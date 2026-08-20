import type { AgentTool, AgentEvent } from "@earendil-works/pi-agent-core";
import type { SubAgentConfig, SubAgentId } from "@codeman-frontend/shared/lib/sub-agent-schema";
import { createSubAgent } from "@codeman-frontend/features/multi-agents/lib/sub-agent-factory";

export type ToolRegistry = Map<string, AgentTool>;

export interface CreateMultiAgentRunnerDeps {
  readonly configs: readonly SubAgentConfig[];
  readonly baseProvider: ProviderConfig;
  readonly toolRegistry: ToolRegistry;
  readonly onStreamEvent: (event: AgentEvent, toolCallId: string, subAgentId: SubAgentId) => void;
}

export interface MultiAgentRunner {
  readonly runTask: (
    toolCallId: string,
    params: { agent_name: string; task: string },
  ) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    details: unknown;
  }>;
}

export function createMultiAgentRunner(deps: CreateMultiAgentRunnerDeps): MultiAgentRunner {
  const configByName = new Map(deps.configs.map((c) => [c.name, c]));

  return {
    runTask: async (toolCallId, params) => {
      const config = configByName.get(params.agent_name);
      if (!config) {
        throw new Error(
          `Unknown sub-agent "${params.agent_name}". Available: ${[...configByName.keys()].join(", ")}`,
        );
      }
      const subAgent = createSubAgent(config, deps.baseProvider, deps.toolRegistry);
      const unsubscribe = subAgent.subscribe((event) => {
        deps.onStreamEvent(event, toolCallId, config.id);
      });
      try {
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
