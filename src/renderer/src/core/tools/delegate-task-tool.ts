import { Schema } from "effect";
import type { AgentTool, AgentEvent } from "@earendil-works/pi-agent-core";
import type { SubAgentConfig, SubAgentId } from "@codeman-frontend/shared/lib/sub-agent-schema";
import { createMultiAgentRunner, type ToolRegistry } from "@codeman-frontend/core/tools/delegate-task/multi-agent-runner";
import { toToolParameters } from "@codeman-frontend/shared/lib/tool-schema";

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
  const descriptionList = enabledConfigs.map((c) => `- ${c.name}: ${c.description}`).join("\n");

  const runner = createMultiAgentRunner({
    configs: enabledConfigs,
    baseProvider,
    toolRegistry,
    onStreamEvent,
  });

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
      return runner.runTask(toolCallId, params);
    },
  };
}
