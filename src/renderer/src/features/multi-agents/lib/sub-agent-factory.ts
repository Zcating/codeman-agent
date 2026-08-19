import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { anthropicStream } from "@codeman-frontend/core/llm/anthropic-stream-fn";
import { createProviderFromConfig, findDefaultModel } from "@codeman-frontend/core/llm/pi-provider-adapter";
import {
  buildSystemPrompt,
  DEFAULT_IDENTITY,
  DEFAULT_GUIDELINES,
  type ToolSnippet,
} from "@codeman-frontend/core/llm/build-system-prompt";
import { deriveToolSnippets } from "@codeman-frontend/core/llm/build-tool-snippets";
import { formatSkillsManifestSection } from "@codeman-frontend/features/skills/lib/skill-injector";
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

  // V1 grill决议: sub-agent 永远不能看到 delegate_task,避免递归
  const toolsWithoutDelegate = tools.filter((t) => t.name !== "delegate_task");

  const snippets = deriveToolSnippets(toolsWithoutDelegate);

  const piProvider = createProviderFromConfig({
    id: baseProvider.id,
    name: baseProvider.id,
    baseUrl: baseProvider.baseUrl,
    apiKey: baseProvider.apiKey ?? "",
    models: baseProvider.models,
  });
  const model = findDefaultModel(piProvider, config.modelId);

  // Filter tool snippets to only allowedTools (delegate_task already excluded from toolsWithoutDelegate)
  const allowedToolNames = new Set(config.allowedTools);
  const filteredSnippets: readonly ToolSnippet[] = snippets.filter((s) =>
    allowedToolNames.has(s.name),
  );

  const skillsSection = formatSkillsManifestSection(baseProvider.enabledSkills ?? []);

  const systemPrompt = buildSystemPrompt({
    identity: DEFAULT_IDENTITY,
    staticToolSnippets: filteredSnippets,
    guidelines: DEFAULT_GUIDELINES,
    skillsSection,
    userDefault: config.systemPrompt,
  });

  return new Agent({
    initialState: {
      systemPrompt,
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
