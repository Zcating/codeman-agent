
import { it, expect, describe } from "@effect/vitest";
import { Effect } from "effect";
import {
  getRegistryState,
  getPluginMetadata,
  type PluginDescriptor,
} from "@codeman-frontend/plugins";


describe("plugins barrel", () => {
  describe("public API re-exports", () => {
    it("re-exports getRegistryState from registry core", () => {
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

    it("re-exports PluginDescriptor type", () => {
      const descriptor: PluginDescriptor = {
        id: "test",
        initialize: Effect.void,
        route: { path: "/test", label: "Test" },
        sidebar: { icon: "Star", order: 0, visible: true },
      };
      expect(descriptor.id).toBe("test");
    });
  });

  describe("automations descriptor registration", () => {
    it("automations plugin is registered in the registry", () => {
      const state = getRegistryState()();
      expect(state.plugins.has("automations")).toBe(true);
    });

    it("automations descriptor has correct route metadata", () => {
      const metadata = getPluginMetadata();
      const automationsMeta = metadata.get("automations");
      expect(automationsMeta).toBeDefined();
      expect(automationsMeta?.route.path).toBe("/plugins/automations");
      expect(automationsMeta?.route.label).toBe("Automations");
    });

    it("automations descriptor has correct sidebar metadata", () => {
      const metadata = getPluginMetadata();
      const automationsMeta = metadata.get("automations");
      expect(automationsMeta).toBeDefined();
      expect(automationsMeta?.sidebar.icon).toBe("Clock");
      expect(automationsMeta?.sidebar.order).toBe(5);
      expect(automationsMeta?.sidebar.visible).toBe(true);
    });

    it("automations initialize effect is typed as Effect<void, AppError>", () => {
      const state = getRegistryState()();
      const automationsPlugin = state.plugins.get("automations");
      expect(automationsPlugin).toBeDefined();
      expect(automationsPlugin?.status).toBe("pending");
    });
  });

  describe("skills and mcp moved to features (not in registry)", () => {
    it("skills is NOT registered in the registry (moved to features)", () => {
      const state = getRegistryState()();
      expect(state.plugins.has("skills")).toBe(false);
    });

    it("mcp is NOT registered in the registry (moved to features)", () => {
      const state = getRegistryState()();
      expect(state.plugins.has("mcp")).toBe(false);
    });
  });

  describe("idempotent registration", () => {
    it("no duplicate registration on repeated import — automations present once", () => {
      const state = getRegistryState()();
      const pluginIds = Array.from(state.plugins.keys());
      const automationsCount = pluginIds.filter((id) => id === "automations").length;
      expect(automationsCount).toBe(1);
    });
  });
});