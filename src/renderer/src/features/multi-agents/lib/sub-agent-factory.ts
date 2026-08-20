import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { anthropicStream } from "@codeman-frontend/core/llm/anthropic-stream-fn";
import { createProviderFromConfig, findDefaultModel } from "@codeman-frontend/core/llm/pi-provider-adapter";
import type { SubAgentConfig } from "@codeman-frontend/shared/lib/sub-agent-schema";
import type { ProviderConfig } from "@codeman-frontend/core/llm/runtime";

export type ToolRegistry = Map<string, AgentTool>;

export function createSubAgent(
  config: SubAgentConfig,
  baseProvider: ProviderConfig,
  toolRegistry: ToolRegistry,
): Agent {
  const tools = config.allowedTools
    .map((name) => toolRegistry.get(name))
    .filter((t): t is AgentTool => t !== undefined);

  const toolsWithoutDelegate = tools.filter((t) => t.name !== "delegate_task");

  const piProvider = createProviderFromConfig({
    id: baseProvider.id,
    name: baseProvider.id,
    baseUrl: baseProvider.baseUrl,
    apiKey: baseProvider.apiKey ?? "",
    models: baseProvider.models,
  });
  const model = findDefaultModel(piProvider, config.modelId);

  return new Agent({
    initialState: {
      model,
      thinkingLevel: config.thinkingLevel,
      tools: toolsWithoutDelegate,
      messages: [],
    },
    streamFn: anthropicStream,
    getApiKey: async () => baseProvider.apiKey ?? undefined,
    toolExecution: "sequential",
  });
}
