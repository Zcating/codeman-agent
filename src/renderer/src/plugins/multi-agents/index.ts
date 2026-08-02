import { Effect } from "effect";
import { pluginRegistry } from "@codeman-frontend/plugins/lib/plugin-registry";
import type { PluginDescriptor } from "@codeman-frontend/plugins/lib/plugin-registry";

export const multiAgentsDescriptor: PluginDescriptor = {
  id: "multi-agents",
  initialize: Effect.succeed(undefined),
  route: { path: "/plugins/multi-agents", label: "Sub-Agents" },
  sidebar: { icon: "Users", order: 30, visible: true },
};

// Auto-register on module load
pluginRegistry.registerPlugin(multiAgentsDescriptor);
