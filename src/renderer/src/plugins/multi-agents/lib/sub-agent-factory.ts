import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { anthropicStream } from "@codeman-frontend/features/chat/lib/anthropic-stream-fn";
import { createProviderFromConfig, findDefaultModel } from "@codeman-frontend/features/chat/lib/pi-provider-adapter";
import { buildSystemPrompt } from "@codeman-frontend/features/chat/lib/build-system-prompt";
import { formatSkillsManifestSection } from "@codeman-frontend/plugins/skills/lib/skill-injector";
import type { SubAgentConfig } from "./sub-agent.types";
import type { ProviderConfig } from "@codeman-frontend/features/chat/lib/runtime";
import type { ToolSnippet } from "@codeman-frontend/features/chat/lib/build-system-prompt";

// ── Sub-agent identity & guidelines (mirrors main chat; defined locally to avoid chat.store circular dep) ──

const SUB_AGENT_IDENTITY = "You are an AI assistant.";

const SUB_AGENT_GUIDELINES: readonly string[] = [
  "edit_file old_text must match uniquely.",
  "10MB file size limit.",
];

// ── Tool snippets available to sub-agents (single-line summaries; delegate_task excluded) ──

const SUB_AGENT_TOOL_SNIPPETS: readonly ToolSnippet[] = [
  { name: "webfetch", summary: "Retrieve web content from URLs." },
  { name: "search_files", summary: "Search for files in the workspace." },
  { name: "read_file", summary: "Read a file from the filesystem." },
  { name: "write_file", summary: "Create or overwrite a file." },
  { name: "edit_file", summary: "Edit an existing file." },
  { name: "delete_file", summary: "Delete a file." },
  { name: "run_command", summary: "Execute a shell command." },
];

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
    identity: SUB_AGENT_IDENTITY,
    staticToolSnippets: filteredSnippets,
    guidelines: SUB_AGENT_GUIDELINES,
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
