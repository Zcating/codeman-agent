import { Effect } from "effect";
import { pluginRegistry } from "@codeman-frontend/plugins/lib/plugin-registry";
import type { PluginDescriptor } from "@codeman-frontend/plugins/lib/plugin-registry";
import { initializeSkillsManifests } from "@codeman-frontend/plugins/skills/stores/skills.store";
import { initializeMcp } from "@codeman-frontend/plugins/mcp/stores/store";
import "@codeman-frontend/plugins/multi-agents/index";
import "@codeman-frontend/plugins/automations/index";
import { initializeAutomations } from "@codeman-frontend/plugins/automations/index";
import type { AppError } from "@codeman-frontend/shared/lib/errors";


const skillsInitialize: Effect.Effect<void, AppError> = initializeSkillsManifests();

const mcpInitialize: Effect.Effect<void, AppError> = initializeMcp();


const skillsDescriptor = {
  id: "skills" as const,
  initialize: skillsInitialize,
  route: { path: "/plugins/skills", label: "Skills" },
  sidebar: { icon: "WandSparkles", order: 3, visible: true },
} satisfies PluginDescriptor;

const mcpDescriptor = {
  id: "mcp" as const,
  initialize: mcpInitialize,
  route: { path: "/plugins/mcp", label: "MCP" },
  sidebar: { icon: "Cable", order: 4, visible: true },
} satisfies PluginDescriptor;

const automationsDescriptor = {
  id: "automations" as const,
  initialize: initializeAutomations(),
  route: { path: "/plugins/automations", label: "Automations" },
  sidebar: { icon: "Clock", order: 5, visible: true },
} satisfies PluginDescriptor;


let registered = false;

if (!registered) {
  pluginRegistry.registerPlugin(skillsDescriptor);
  pluginRegistry.registerPlugin(mcpDescriptor);
  pluginRegistry.registerPlugin(automationsDescriptor);
  registered = true;
}


export {
  getRegistryState,
  getPluginMetadata,
  initializeAll,
} from "@codeman-frontend/plugins/lib/plugin-registry";

export { initializeSkillsManifests, initializeMcp };

export type {
  PluginDescriptor,
  PluginRouteMetadata,
  PluginSidebarMetadata,
  PluginState,
  PluginStates,
  RegistryState,
  PluginMetadata,
  InitializeAllResult,
  PluginStatus,
} from "@codeman-frontend/plugins/lib/plugin-registry";
