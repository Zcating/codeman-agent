import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ToolSnippet } from "@codeman-frontend/core/llm/build-system-prompt";

export function deriveToolSnippets(
  tools: ReadonlyArray<AgentTool>,
): readonly ToolSnippet[] {
  return tools.map((tool) => ({
    name: tool.name,
    summary: tool.description,
  }));
}
