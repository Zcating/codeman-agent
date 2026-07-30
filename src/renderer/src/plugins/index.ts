import { Effect } from "effect";
import { pluginRegistry } from "@codeman-frontend/plugins/lib/plugin-registry";
import type { PluginDescriptor } from "@codeman-frontend/plugins/lib/plugin-registry";
import { initializeSkillsManifests } from "@codeman-frontend/plugins/skills/stores/skills.store";
import { initializeMcp } from "@codeman-frontend/plugins/mcp/stores/store";
import type { AppError } from "@codeman-frontend/shared/lib/errors";

// ─── Plugin initializers ──────────────────────────────────────────────────────
//
// Both store exports are FUNCTIONS that return Effects when called.
// We invoke them here to get the Effect instances for the descriptors.
// The Effect is lazy — it only executes when run by the registry.

// Skills: initializeSkillsManifests() returns Effect<void, AppError>
const skillsInitialize: Effect.Effect<void, AppError> = initializeSkillsManifests();

// MCP: initializeMcp() returns Effect<void, AppError>
const mcpInitialize: Effect.Effect<void, AppError> = initializeMcp();

// ─── Descriptor definitions ───────────────────────────────────────────────────

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

// ─── Module-level idempotent registration ────────────────────────────────────
// Track whether registration has occurred to avoid duplicate side-effects on
// repeated module imports (e.g., different import graphs merging).

let registered = false;

if (!registered) {
  pluginRegistry.registerPlugin(skillsDescriptor);
  pluginRegistry.registerPlugin(mcpDescriptor);
  registered = true;
}

// ─── Public API re-exports ───────────────────────────────────────────────────

// Re-export registry core APIs so bootstrap/sidebar consumers import from here
// rather than reaching into lib/ directly.
export {
  getRegistryState,
  getPluginMetadata,
  initializeAll,
} from "@codeman-frontend/plugins/lib/plugin-registry";

// Re-export plugin initializers so consumers can inspect their types
export { initializeSkillsManifests, initializeMcp };

// Re-export types for consumers
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
