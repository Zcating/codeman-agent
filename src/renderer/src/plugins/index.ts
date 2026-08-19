import { pluginRegistry } from "@codeman-frontend/plugins/lib/plugin-registry";
import type { PluginDescriptor } from "@codeman-frontend/plugins/lib/plugin-registry";
import { initializeAutomations } from "@codeman-frontend/plugins/automations/index";


const automationsDescriptor = {
  id: "automations" as const,
  initialize: initializeAutomations(),
  route: { path: "/plugins/automations", label: "Automations" },
  sidebar: { icon: "Clock", order: 5, visible: true },
} satisfies PluginDescriptor;


let registered = false;

if (!registered) {
  pluginRegistry.registerPlugin(automationsDescriptor);
  registered = true;
}


export {
  getRegistryState,
  getPluginMetadata,
} from "@codeman-frontend/plugins/lib/plugin-registry";

export type {
  PluginDescriptor,
  PluginRouteMetadata,
  PluginSidebarMetadata,
  PluginState,
  PluginStates,
  RegistryState,
  PluginMetadata,
  PluginStatus,
} from "@codeman-frontend/plugins/lib/plugin-registry";