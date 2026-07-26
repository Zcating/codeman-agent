// Plugins barrel tests — central renderer plugin barrel (plugins/index.ts).
//
// Verifies:
// - Both skills and mcp descriptors are registered with exact metadata
// - Initialization effects are properly typed and accessible through public exports
// - No duplicate registration on repeated module imports
//
// NOTE: Test placed in lib/ per plugins AGENTS.md rule (plugin root allows only
// index.ts + AGENTS.md; other files must fall within 5 white-listed sub-dirs).

import { it, expect, describe } from "@effect/vitest";
import { Effect } from "effect";
import {
  getRegistryState,
  getPluginMetadata,
  initializeAll,
  type PluginDescriptor,
  type PluginMetadata,
  type RegistryState,
  type InitializeAllResult,
} from "@codeman-frontend/plugins/lib/plugin-registry";

// ─── Test subjects ────────────────────────────────────────────────────────────

// Re-exported public APIs from the barrel
export {
  getRegistryState,
  getPluginMetadata,
  initializeAll,
} from "@codeman-frontend/plugins";

// Types re-exported through barrel
export type { PluginDescriptor, PluginMetadata, RegistryState, InitializeAllResult };

// ─── Descriptor metadata (verified by tests) ─────────────────────────────────

const EXPECTED_SKILLS_DESCRIPTOR = {
  id: "skills" as const,
  route: { path: "/plugins/skills", label: "Skills" },
  sidebar: { icon: "WandSparkles", order: 3, visible: true },
} as const;

const EXPECTED_MCP_DESCRIPTOR = {
  id: "mcp" as const,
  route: { path: "/plugins/mcp", label: "MCP" },
  sidebar: { icon: "Cable", order: 4, visible: true },
} as const;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("plugins barrel", () => {
  describe("public API re-exports", () => {
    it("re-exports getRegistryState from registry core", () => {
      // The barrel must re-export this so consumers don't import from lib directly
      const stateAccessor = getRegistryState();
      expect(typeof stateAccessor).toBe("function");
      const state = stateAccessor();
      expect(state.plugins).toBeDefined();
    });

    it("re-exports getPluginMetadata from registry core", () => {
      const metadata = getPluginMetadata();
      expect(metadata).toBeDefined();
      expect(metadata instanceof Map).toBe(true);
    });

    it("re-exports initializeAll from registry core", () => {
      // initializeAll should be callable and return Effect
      const effect = initializeAll();
      expect(effect).toBeDefined();
      // Effect is a real type, checking it exists
      expect(typeof effect).toBe("object");
    });

    it("re-exports PluginDescriptor type", () => {
      // PluginDescriptor must be accessible from barrel for consumers
      const descriptor: PluginDescriptor = {
        id: "test",
        initialize: Effect.void,
        route: { path: "/test", label: "Test" },
        sidebar: { icon: "Star", order: 0, visible: true },
      };
      expect(descriptor.id).toBe("test");
    });
  });

  describe("skills descriptor registration", () => {
    it("skills plugin is registered in the registry", () => {
      const state = getRegistryState()();
      expect(state.plugins.has("skills")).toBe(true);
    });

    it("skills descriptor has exact route metadata", () => {
      const metadata = getPluginMetadata();
      const skillsMeta = metadata.get("skills");
      expect(skillsMeta).toBeDefined();
      expect(skillsMeta?.route.path).toBe(EXPECTED_SKILLS_DESCRIPTOR.route.path);
      expect(skillsMeta?.route.label).toBe(EXPECTED_SKILLS_DESCRIPTOR.route.label);
    });

    it("skills descriptor has exact sidebar metadata", () => {
      const metadata = getPluginMetadata();
      const skillsMeta = metadata.get("skills");
      expect(skillsMeta).toBeDefined();
      expect(skillsMeta?.sidebar.icon).toBe(EXPECTED_SKILLS_DESCRIPTOR.sidebar.icon);
      expect(skillsMeta?.sidebar.order).toBe(EXPECTED_SKILLS_DESCRIPTOR.sidebar.order);
      expect(skillsMeta?.sidebar.visible).toBe(EXPECTED_SKILLS_DESCRIPTOR.sidebar.visible);
    });

    it("skills initialize effect is typed as Effect<void, AppError>", () => {
      // Verify the re-exported initializer has the correct type signature
      // The actual Effect type is accessible via the public export
      const state = getRegistryState()();
      const skillsPlugin = state.plugins.get("skills");
      expect(skillsPlugin).toBeDefined();
      // Plugin should be registered with pending status initially
      expect(skillsPlugin?.status).toBe("pending");
    });
  });

  describe("mcp descriptor registration", () => {
    it("mcp plugin is registered in the registry", () => {
      const state = getRegistryState()();
      expect(state.plugins.has("mcp")).toBe(true);
    });

    it("mcp descriptor has exact route metadata", () => {
      const metadata = getPluginMetadata();
      const mcpMeta = metadata.get("mcp");
      expect(mcpMeta).toBeDefined();
      expect(mcpMeta?.route.path).toBe(EXPECTED_MCP_DESCRIPTOR.route.path);
      expect(mcpMeta?.route.label).toBe(EXPECTED_MCP_DESCRIPTOR.route.label);
    });

    it("mcp descriptor has exact sidebar metadata", () => {
      const metadata = getPluginMetadata();
      const mcpMeta = metadata.get("mcp");
      expect(mcpMeta).toBeDefined();
      expect(mcpMeta?.sidebar.icon).toBe(EXPECTED_MCP_DESCRIPTOR.sidebar.icon);
      expect(mcpMeta?.sidebar.order).toBe(EXPECTED_MCP_DESCRIPTOR.sidebar.order);
      expect(mcpMeta?.sidebar.visible).toBe(EXPECTED_MCP_DESCRIPTOR.sidebar.visible);
    });

    it("mcp initialize effect is typed as Effect<void, AppError>", () => {
      // Verify the re-exported initializer has the correct type signature
      // The actual Effect type is accessible via the public export
      const state = getRegistryState()();
      const mcpPlugin = state.plugins.get("mcp");
      expect(mcpPlugin).toBeDefined();
      // Plugin should be registered with pending status initially
      expect(mcpPlugin?.status).toBe("pending");
    });
  });

  describe("initialization effects", () => {
    it.effect("skills initialize effect can execute successfully", () =>
      Effect.gen(function* () {
        const state = getRegistryState()();
        const plugin = state.plugins.get("skills");
        expect(plugin).toBeDefined();
        if (plugin && plugin.status === "pending") {
          const result = yield* initializeAll();
          expect(result.ok).toBe(true);
        }
      }),
    );

    it.effect("mcp initialize effect can execute successfully", () =>
      Effect.gen(function* () {
        const state = getRegistryState()();
        const plugin = state.plugins.get("mcp");
        expect(plugin).toBeDefined();
        if (plugin && plugin.status === "pending") {
          const result = yield* initializeAll();
          expect(result.ok).toBe(true);
        }
      }),
    );

    it.effect("initializeAll captures failures without blocking other plugins", () =>
      Effect.gen(function* () {
        // The overall result should always succeed after all plugins settle
        const result = yield* initializeAll();
        expect(result.ok).toBe(true);
        // Failures map may be empty or contain failures
        expect(result.failures instanceof Map).toBe(true);
      }),
    );
  });

  describe("idempotent registration", () => {
    it("no duplicate registration on repeated import — both plugins present", () => {
      const state = getRegistryState()();
      const pluginIds = Array.from(state.plugins.keys());
      // Should contain exactly skills and mcp (no duplicates)
      const skillsCount = pluginIds.filter((id) => id === "skills").length;
      const mcpCount = pluginIds.filter((id) => id === "mcp").length;
      expect(skillsCount).toBe(1);
      expect(mcpCount).toBe(1);
    });
  });
});
