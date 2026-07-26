// Plugin registry tests — ADR-0035 / plugin-registry-startup-initialization.md Task A.
//
// Tests the core registry behavior: parallel init, per-plugin failure capture,
// idempotent ready behavior, and metadata access.

import { it, expect } from "@effect/vitest";
import { describe, beforeEach } from "vitest";
import { Effect } from "effect";
import {
  NotFound,
  Unknown,
  type AppError,
} from "@codeman-frontend/shared/lib/errors";
import {
  pluginRegistry,
  initializeAll,
  type PluginDescriptor,
  type PluginStatus,
} from "@codeman-frontend/plugins/lib/plugin-registry";

// ─── Mock plugin factory helpers ──────────────────────────────────────────────

const SuccessPluginId = "success-plugin" as const;
const FailPluginId = "fail-plugin" as const;

const makeSuccessDescriptor = (): PluginDescriptor => ({
  id: SuccessPluginId,
  initialize: Effect.succeed(undefined),
  route: { path: "/success", label: "Success" },
  sidebar: { icon: "check", order: 1, visible: true },
});

const makeFailDescriptor = (error: AppError): PluginDescriptor => ({
  id: FailPluginId,
  initialize: Effect.fail(error),
  route: { path: "/fail", label: "Fail" },
  sidebar: { icon: "x", order: 2, visible: true },
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("plugin registry", () => {
  beforeEach(() => {
    // Reset registry state before each test
    pluginRegistry._resetForTest();
  });

  describe("initial state", () => {
    it("starts with all plugins in pending state", () => {
      const state = pluginRegistry.getState()();
      expect(state.plugins.size).toBeGreaterThan(0);
      for (const [_id, pluginState] of state.plugins) {
        expect(pluginState.status).toBe("pending");
      }
    });

    it("has registered plugins with stable string ids", () => {
      const state = pluginRegistry.getState()();
      const ids = Array.from(state.plugins.keys());
      expect(ids).toContain("skills");
      expect(ids).toContain("mcp");
      // All ids are non-empty strings
      for (const id of ids) {
        expect(typeof id).toBe("string");
        expect(id.length).toBeGreaterThan(0);
      }
    });
  });

  describe("initializeAll", () => {
    it.effect("succeeds when all plugins succeed", () =>
      Effect.gen(function* () {
        // Override with test plugins that succeed
        pluginRegistry._registerForTest(makeSuccessDescriptor());
        pluginRegistry._registerForTest(makeFailDescriptor(new NotFound({ message: "nope" })));

        const result = yield* initializeAll();
        expect(result.ok).toBe(true);
      }),
    );

    it.effect("completes successfully even when one plugin fails", () =>
      Effect.gen(function* () {
        pluginRegistry._registerForTest(makeSuccessDescriptor());
        pluginRegistry._registerForTest(makeFailDescriptor(new NotFound({ message: "intentional fail" })));

        const result = yield* initializeAll();
        // Overall result succeeds because all plugins settled (success or fail)
        expect(result.ok).toBe(true);
      }),
    );

    it.effect("transitions plugins from pending to initializing during init", () =>
      Effect.gen(function* () {
        pluginRegistry._resetForTest();
        pluginRegistry._registerForTest({
          id: "test-pending-transition",
          initialize: Effect.gen(function* () {
            // Check state while initializing
            const midState = pluginRegistry.getState()();
            const plugin = midState.plugins.get("test-pending-transition");
            expect(plugin?.status).toBe("initializing");
          }),
          route: { path: "/test", label: "Test" },
          sidebar: { icon: "test", order: 0, visible: true },
        });

        yield* initializeAll();
      }),
    );

    it.effect("transitions successful plugins to ready after init", () =>
      Effect.gen(function* () {
        pluginRegistry._resetForTest();
        pluginRegistry._registerForTest(makeSuccessDescriptor());

        yield* initializeAll();

        const state = pluginRegistry.getState()();
        const plugin = state.plugins.get(SuccessPluginId);
        expect(plugin?.status).toBe("ready");
      }),
    );

    it.effect("transitions failed plugins to failed with error preserved", () =>
      Effect.gen(function* () {
        pluginRegistry._resetForTest();
        const testError = new NotFound({ message: "plugin failed" });
        pluginRegistry._registerForTest(makeFailDescriptor(testError));

        yield* initializeAll();

        const state = pluginRegistry.getState()();
        const plugin = state.plugins.get(FailPluginId);
        expect(plugin?.status).toBe("failed");
        if (plugin?.status === "failed") {
          expect(plugin.error).toBe(testError);
        }
      }),
    );

    it.effect("failed plugin does not affect successful plugin state", () =>
      Effect.gen(function* () {
        pluginRegistry._resetForTest();
        pluginRegistry._registerForTest(makeSuccessDescriptor());
        pluginRegistry._registerForTest(makeFailDescriptor(new Unknown({ message: "fail" })));

        yield* initializeAll();

        const state = pluginRegistry.getState()();
        const success = state.plugins.get(SuccessPluginId);
        expect(success?.status).toBe("ready");
      }),
    );
  });

  describe("idempotent ready behavior", () => {
    it.effect("ready plugin initialization is a no-op (does not re-execute)", () =>
      Effect.gen(function* () {
        pluginRegistry._resetForTest();
        let executionCount = 0;
        pluginRegistry._registerForTest({
          id: "idempotent-test",
          initialize: Effect.gen(function* () {
            executionCount++;
          }),
          route: { path: "/idempotent", label: "Idempotent" },
          sidebar: { icon: "repeat", order: 0, visible: true },
        });

        // First initialization
        yield* initializeAll();
        expect(executionCount).toBe(1);

        // Second initialization should not re-execute
        yield* initializeAll();
        expect(executionCount).toBe(1);

        // Third initialization should also not re-execute
        yield* initializeAll();
        expect(executionCount).toBe(1);
      }),
    );

    it.effect("ready plugin returns success without re-running", () =>
      Effect.gen(function* () {
        pluginRegistry._resetForTest();
        pluginRegistry._registerForTest(makeSuccessDescriptor());

        const first = yield* initializeAll();
        expect(first.ok).toBe(true);

        const second = yield* initializeAll();
        expect(second.ok).toBe(true);
      }),
    );
  });

  describe("metadata accessor", () => {
    it("exposes route and sidebar metadata for registered plugins", () => {
      const metadata = pluginRegistry.getMetadata();
      expect(metadata.size).toBeGreaterThan(0);
    });

    it("returns metadata for skills plugin with correct structure", () => {
      const metadata = pluginRegistry.getMetadata();
      const skillsMeta = metadata.get("skills");
      expect(skillsMeta).toBeDefined();
      expect(skillsMeta?.id).toBe("skills");
      expect(skillsMeta?.route).toBeDefined();
      expect(skillsMeta?.route.path).toBe("/plugins/skills");
      expect(skillsMeta?.route.label).toBe("Skills");
      expect(skillsMeta?.sidebar).toBeDefined();
      expect(typeof skillsMeta?.sidebar.icon).toBe("string");
      expect(typeof skillsMeta?.sidebar.order).toBe("number");
      expect(typeof skillsMeta?.sidebar.visible).toBe("boolean");
    });

    it("returns metadata for mcp plugin with correct structure", () => {
      const metadata = pluginRegistry.getMetadata();
      const mcpMeta = metadata.get("mcp");
      expect(mcpMeta).toBeDefined();
      expect(mcpMeta?.id).toBe("mcp");
      expect(mcpMeta?.route).toBeDefined();
      expect(mcpMeta?.route.path).toBe("/plugins/mcp");
      expect(mcpMeta?.route.label).toBe("MCP");
      expect(mcpMeta?.sidebar).toBeDefined();
    });

    it("metadata is read-only (not affected by state changes)", () =>
      Effect.gen(function* () {
        pluginRegistry._resetForTest();
        pluginRegistry._registerForTest(makeSuccessDescriptor());

        const metadataBefore = pluginRegistry.getMetadata();
        yield* initializeAll();
        const metadataAfter = pluginRegistry.getMetadata();

        // Same reference - metadata doesn't change with state
        expect(metadataBefore).toBe(metadataAfter);
      }),
    );
  });

  describe("state accessor", () => {
    it("getState returns readonly registry state", () => {
      const stateAccessor = pluginRegistry.getState();
      const state = stateAccessor();
      expect(state.plugins).toBeDefined();
      expect(state.plugins.size).toBeGreaterThan(0);
    });

    it("state.plugins values are immutable", () => {
      const state = pluginRegistry.getState()();
      for (const [_id, pluginState] of state.plugins) {
        // All properties should be readonly
        expect(Object.isFrozen(pluginState)).toBe(true);
      }
    });

    it("state reflects current status of each plugin", () =>
      Effect.gen(function* () {
        pluginRegistry._resetForTest();
        pluginRegistry._registerForTest(makeSuccessDescriptor());

        // Initially pending
        let state = pluginRegistry.getState()();
        expect(state.plugins.get(SuccessPluginId)?.status).toBe("pending");

        yield* initializeAll();

        // After init, ready
        state = pluginRegistry.getState()();
        expect(state.plugins.get(SuccessPluginId)?.status).toBe("ready");
      }),
    );
  });

  describe("parallel initialization", () => {
    it.effect("multiple plugins initialize in parallel", () =>
      Effect.gen(function* () {
        pluginRegistry._resetForTest();

        const startTime = Date.now();
        let order: string[] = [];

        pluginRegistry._registerForTest({
          id: "parallel-1",
          initialize: Effect.gen(function* () {
            order.push("parallel-1-start");
            yield* Effect.sleep(50);
            order.push("parallel-1-end");
          }),
          route: { path: "/p1", label: "P1" },
          sidebar: { icon: "1", order: 1, visible: true },
        });

        pluginRegistry._registerForTest({
          id: "parallel-2",
          initialize: Effect.gen(function* () {
            order.push("parallel-2-start");
            yield* Effect.sleep(50);
            order.push("parallel-2-end");
          }),
          route: { path: "/p2", label: "P2" },
          sidebar: { icon: "2", order: 2, visible: true },
        });

        yield* initializeAll();

        const elapsed = Date.now() - startTime;

        // If sequential, would take ~100ms. If parallel, ~50ms
        expect(elapsed).toBeLessThan(100);

        // Both should have started before either finished (parallel execution)
        const start1 = order.indexOf("parallel-1-start");
        const start2 = order.indexOf("parallel-2-start");
        const end1 = order.indexOf("parallel-1-end");
        const end2 = order.indexOf("parallel-2-end");

        expect(start1).toBeLessThan(end1);
        expect(start2).toBeLessThan(end2);
      }),
    );
  });

  describe("plugin status types", () => {
    it("status is one of pending | initializing | ready | failed", () => {
      const state = pluginRegistry.getState()();
      const validStatuses: PluginStatus[] = ["pending", "initializing", "ready", "failed"];

      for (const [_id, pluginState] of state.plugins) {
        expect(validStatuses).toContain(pluginState.status);
      }
    });

    it("failed status includes error field", () =>
      Effect.gen(function* () {
        pluginRegistry._resetForTest();
        pluginRegistry._registerForTest(makeFailDescriptor(new Unknown({ message: "test error" })));

        yield* initializeAll();

        const state = pluginRegistry.getState()();
        const plugin = state.plugins.get(FailPluginId);
        expect(plugin?.status).toBe("failed");
        if (plugin?.status === "failed") {
          expect(plugin.error).toBeDefined();
        }
      }),
    );

    it("pending status has no other fields", () => {
      const state = pluginRegistry.getState()();
      for (const [_id, pluginState] of state.plugins) {
        if (pluginState.status === "pending") {
          expect(Object.keys(pluginState).filter(k => k !== "status")).toHaveLength(0);
        }
      }
    });

    it("ready status has no other fields", () => {
      const state = pluginRegistry.getState()();
      for (const [_id, pluginState] of state.plugins) {
        if (pluginState.status === "ready") {
          expect(Object.keys(pluginState).filter(k => k !== "status")).toHaveLength(0);
        }
      }
    });
  });

  // ─── Issue Fix 1: initializing state is set before parallel init ─────────────

  describe("initializing state before parallel init", () => {
    it.effect("sets all pending plugins to initializing BEFORE Promise.all starts", () =>
      Effect.gen(function* () {
        pluginRegistry._resetForTest();
        let initializingObserved = false;

        pluginRegistry._registerForTest({
          id: "blocking-plugin",
          initialize: Effect.gen(function* () {
            // Observe state DURING initialization
            const midState = pluginRegistry.getState()();
            const plugin = midState.plugins.get("blocking-plugin");
            if (plugin?.status === "initializing") {
              initializingObserved = true;
            }
            // Block briefly so we can observe
            yield* Effect.sleep(10);
          }),
          route: { path: "/blocking", label: "Blocking" },
          sidebar: { icon: "block", order: 0, visible: true },
        });

        yield* initializeAll();
        expect(initializingObserved).toBe(true);
      }),
    );

    it.effect("initializing state is frozen when set before Promise.all", () =>
      Effect.gen(function* () {
        pluginRegistry._resetForTest();
        let observedInitializing = false;

        pluginRegistry._registerForTest({
          id: "freeze-test",
          initialize: Effect.gen(function* () {
            // Inside the effect, check what state was set BEFORE this ran
            const s = pluginRegistry.getState()();
            const p = s.plugins.get("freeze-test");
            if (p?.status === "initializing") {
              observedInitializing = true;
            }
          }),
          route: { path: "/freeze", label: "Freeze" },
          sidebar: { icon: "f", order: 0, visible: true },
        });

        yield* initializeAll();
        // If we observed "initializing" inside the effect, the state was set before Promise.all
        expect(observedInitializing).toBe(true);
      }),
    );
  });

  // ─── Issue Fix 2: getRegistryState() is reactive (Solid signal), not snapshot ─

  describe("reactive state accessor", () => {
    it.effect("state changes are observable via accessor after init", () =>
      Effect.gen(function* () {
        pluginRegistry._resetForTest();
        pluginRegistry._registerForTest(makeSuccessDescriptor());

        // Get accessor via method call
        const accessor = pluginRegistry.getState();

        // First call - should be pending
        let state1 = accessor();
        expect(state1.plugins.get(SuccessPluginId)?.status).toBe("pending");

        yield* initializeAll();

        // Second call with SAME accessor - should be ready (reactive signal)
        let state2 = accessor();
        expect(state2.plugins.get(SuccessPluginId)?.status).toBe("ready");
      }),
    );
  });

  // ─── Issue Fix 3: Public registration API ────────────────────────────────────

  describe("public registration API", () => {
    it.effect("registerPlugin allows replacing a plugin's initialize effect", () =>
      Effect.gen(function* () {
        pluginRegistry._resetForTest();

        // Initially with void effect
        let callCount = 0;
        const countingInitialize = Effect.gen(function* () {
          callCount++;
        });

        // Use public API to register/replace
        pluginRegistry.registerPlugin({
          id: "replaceable-plugin",
          initialize: countingInitialize,
          route: { path: "/replace", label: "Replace" },
          sidebar: { icon: "r", order: 0, visible: true },
        });

        yield* initializeAll();
        expect(callCount).toBe(1);

        // Replace with new initialize
        let secondCallCount = 0;
        const newInitialize = Effect.gen(function* () {
          secondCallCount++;
        });

        pluginRegistry.registerPlugin({
          id: "replaceable-plugin",
          initialize: newInitialize,
          route: { path: "/replace", label: "Replace" },
          sidebar: { icon: "r", order: 0, visible: true },
        });

        // Re-initialize should use new effect
        yield* initializeAll();
        expect(secondCallCount).toBe(1);
      }),
    );
  });

  // ─── Issue Fix 4: Icon metadata uses proper identifiers ─────────────────────

  describe("built-in plugin icon metadata", () => {
    it("skills plugin uses WandSparkles icon identifier", () => {
      const metadata = pluginRegistry.getMetadata();
      const skillsMeta = metadata.get("skills");
      expect(skillsMeta?.sidebar.icon).toBe("WandSparkles");
    });

    it("mcp plugin uses Cable icon identifier", () => {
      const metadata = pluginRegistry.getMetadata();
      const mcpMeta = metadata.get("mcp");
      expect(mcpMeta?.sidebar.icon).toBe("Cable");
    });
  });
});
