import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ProviderConfig } from "@codeman-frontend/core/llm/runtime";
import type { ToolType } from "@codeman-frontend/core/tools/tool-type";

export interface ToolContributionContext {
  readonly provider: ProviderConfig;
  readonly baseToolTypes: readonly ToolType[];
}

export interface ToolContribution {
  readonly id: string;
  readonly provide: (ctx: ToolContributionContext) => readonly AgentTool[];
}

const registry = new Map<string, ToolContribution>();

export function registerToolContribution(c: ToolContribution): void {
  registry.set(c.id, c);
}

export function getToolContributions(ctx: ToolContributionContext): readonly AgentTool[] {
  const result: AgentTool[] = [];
  for (const c of registry.values()) {
    result.push(...c.provide(ctx));
  }
  return result;
}

export function _resetContributionsForTest(): void {
  registry.clear();
}
