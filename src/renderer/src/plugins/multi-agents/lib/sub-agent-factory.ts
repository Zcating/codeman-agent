import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { anthropicStream } from "@codeman-frontend/features/chat/lib/anthropic-stream-fn";
import { createProviderFromConfig, findDefaultModel } from "@codeman-frontend/features/chat/lib/pi-provider-adapter";
import {
  buildSystemPrompt,
  DEFAULT_IDENTITY,
  DEFAULT_GUIDELINES,
  DEFAULT_TOOL_SNIPPETS,
  type ToolSnippet,
} from "@codeman-frontend/features/chat/lib/build-system-prompt";
import { formatSkillsManifestSection } from "@codeman-frontend/plugins/skills/lib/skill-injector";
import type { SubAgentConfig } from "./sub-agent.types";
import type { ProviderConfig } from "@codeman-frontend/features/chat/lib/runtime";

// ── Tool snippets available to sub-agents (single-line summaries; delegate_task excluded) ──
// Derived from DEFAULT_TOOL_SNIPPETS (single source of truth); _load_skill excluded since sub-agents cannot load skills
const SUB_AGENT_TOOL_SNIPPETS: readonly ToolSnippet[] = DEFAULT_TOOL_SNIPPETS.filter(
  (s) => s.name !== "_load_skill",
);

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

  // Filter tool snippets to only allowedTools (delegate_task already excluded from snippets map)
  const allowedToolNames = new Set(config.allowedTools);
  const filteredSnippets: readonly ToolSnippet[] = SUB_AGENT_TOOL_SNIPPETS.filter((s) =>
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
