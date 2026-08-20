import { createFileTools } from "@codeman-frontend/tools/file-ops";
import { webfetchTool } from "@codeman-frontend/tools/webfetch";
import { runCommandTool } from "@codeman-frontend/tools/run-command";
import { loadSkillTool } from "@codeman-frontend/core/tools/load-skill-tool";
import { buildMcpTools } from "@codeman-frontend/core/tools/mcp-tool";
import {
  buildDelegateTaskTool,
} from "@codeman-frontend/core/tools/delegate-task-tool";
import type { ToolRegistry } from "@codeman-frontend/core/tools/delegate-task/multi-agent-runner";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { McpToolEntry } from "@codeman-frontend/shared/lib/types";
import type { SubAgentConfig } from "@codeman-frontend/shared/lib/sub-agent-schema";
import type { SubAgentId } from "@codeman-frontend/shared/lib/sub-agent-schema";
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { ProviderConfig } from "@codeman-frontend/core/llm/runtime";
import type { ToolType } from "@codeman-frontend/core/tools/tool-type";
import { deriveToolSnippets } from "./build-tool-snippets";
import type { ToolSnippet } from "@codeman-frontend/core/llm/build-system-prompt";

export interface BuildToolSetDeps {
  readonly workspaceId?: string;
  readonly mcpEntries?: readonly McpToolEntry[];
  readonly enabledSubAgents?: readonly SubAgentConfig[];
  readonly baseProvider?: ProviderConfig;
  readonly onSubAgentEvent?: (event: AgentEvent, toolCallId: string, subAgentId: SubAgentId) => void;
}

export interface ToolSet {
  readonly tools: AgentTool[];
  readonly toolTypes: readonly ToolType[];
  readonly snippets: readonly ToolSnippet[];
}

export interface ComputeToolTypesDeps {
  readonly mcpEntries: readonly McpToolEntry[];
  readonly enabledSubAgents: readonly SubAgentConfig[];
}

export function computeToolTypes(deps: ComputeToolTypesDeps): readonly ToolType[] {
  const toolTypes: ToolType[] = [
    { kind: "file-ops" },
    { kind: "webfetch" },
    { kind: "run-command" },
    { kind: "load-skill" },
  ];

  if (deps.mcpEntries.length > 0) {
    toolTypes.push({ kind: "mcp", count: deps.mcpEntries.length });
  }

  if (deps.enabledSubAgents.length > 0) {
    toolTypes.push({ kind: "delegate-task", agentCount: deps.enabledSubAgents.length });
  }

  return toolTypes;
}

function buildToolTypeAgents(
  deps: BuildToolSetDeps,
): AgentTool[] {
  const workspaceId = deps.workspaceId ?? "";
  const baseTools: AgentTool[] = [
    ...createFileTools(workspaceId),
    webfetchTool,
    runCommandTool,
    loadSkillTool,
  ];

  const mcpEntries = deps.mcpEntries ?? [];
  if (mcpEntries.length > 0) {
    baseTools.push(...buildMcpTools(mcpEntries));
  }

  const toolRegistry: ToolRegistry = new Map(baseTools.map((t) => [t.name, t]));

  const enabledSubAgents = deps.enabledSubAgents ?? [];
  if (enabledSubAgents.length > 0 && deps.baseProvider && deps.onSubAgentEvent) {
    baseTools.push(
      buildDelegateTaskTool(
        enabledSubAgents,
        deps.baseProvider,
        toolRegistry,
        deps.onSubAgentEvent,
      ),
    );
  }

  return baseTools;
}

export function buildToolSet(deps: BuildToolSetDeps): ToolSet {
  const mcpEntries = deps.mcpEntries ?? [];
  const enabledSubAgents = deps.enabledSubAgents ?? [];
  const toolTypes = computeToolTypes({ mcpEntries, enabledSubAgents });
  const tools = buildToolTypeAgents(deps);
  const snippets = deriveToolSnippets(tools);

  return { tools, toolTypes, snippets };
}
