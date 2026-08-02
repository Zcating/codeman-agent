import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { anthropicStream } from "@codeman-frontend/features/chat/lib/anthropic-stream-fn";
import { createProviderFromConfig, findDefaultModel } from "@codeman-frontend/features/chat/lib/pi-provider-adapter";
import type { SubAgentConfig } from "./sub-agent.types";
import type { ProviderConfig } from "@codeman-frontend/features/chat/lib/runtime";

export type ToolRegistry = Map<string, AgentTool>;

export function createSubAgent(
  config: SubAgentConfig,
  baseProvider: ProviderConfig,
  toolRegistry: ToolRegistry,
): Agent {
  const tools = config.allowedTools
    .map((name) => toolRegistry.get(name))
    .filter((t): t is AgentTool => t !== undefined);

  // V1 grill决议: sub-agent 永远不能看到 delegate_task,避免递归
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
      systemPrompt: config.systemPrompt,
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
