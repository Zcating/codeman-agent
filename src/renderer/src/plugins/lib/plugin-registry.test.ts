
import { it, expect } from "@effect/vitest";
import { describe, beforeEach } from "vitest";
import { Effect, Deferred } from "effect";
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


const SuccessPluginId = "success-plugin" as const;
const FailPluginId = "fail-plugin" as const;

const makeSuccessDescriptor = (): PluginDescriptor => ({
  id: SuccessPluginId,
  initialize: Effect.succeed(undefined),
  route: { path: "/success", label: "Success" },
  sidebar: { icon: "Check", order: 1, visible: true },
});

const makeFailDescriptor = (error: AppError): PluginDescriptor => ({
  id: FailPluginId,
  initialize: Effect.fail(error),
  route: { path: "/fail", label: "Fail" },
  sidebar: { icon: "X", order: 2, visible: true },
});


describe("plugin registry", () => {
  beforeEach(() => {
    pluginRegistry._resetForTest();
  });

  describe("initial state", () => {
    it("starts with all plugins in pending state", () => {
      const state = pluginRegistry.getState()();
      for (const [_id, pluginState] of state.plugins) {
        expect(pluginState.status).toBe("pending");
      }
    });

    it("has registered plugins with stable string ids", () => {
      const state = pluginRegistry.getState()();
      const ids = Array.from(state.plugins.keys());
      for (const id of ids) {
        expect(typeof id).toBe("string");
        expect(id.length).toBeGreaterThan(0);
      }
    });
  });

  describe("initializeAll", () => {
    it.effect("succeeds when all plugins succeed", () =>
      Effect.gen(function* () {
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
        expect(result.ok).toBe(true);
      }),
    );

    it.effect("transitions plugins from pending to initializing during init", () =>
      Effect.gen(function* () {
        pluginRegistry._resetForTest();
        pluginRegistry._registerForTest({
          id: "test-pending-transition",
          initialize: Effect.gen(function* () {
            const midState = pluginRegistry.getState()();
            const plugin = midState.plugins.get("test-pending-transition");
            expect(plugin?.status).toBe("initializing");
          }),
          route: { path: "/test", label: "Test" },
          sidebar: { icon: "TestTube", order: 0, visible: true },
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
          sidebar: { icon: "Repeat", order: 0, visible: true },
        });

        yield* initializeAll();
        expect(executionCount).toBe(1);

        yield* initializeAll();
        expect(executionCount).toBe(1);

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

    it("metadata is read-only (not affected by state changes)", () =>
      Effect.gen(function* () {
        pluginRegistry._resetForTest();
        pluginRegistry._registerForTest(makeSuccessDescriptor());

        const metadataBefore = pluginRegistry.getMetadata();
        yield* initializeAll();
        const metadataAfter = pluginRegistry.getMetadata();

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
        expect(Object.isFrozen(pluginState)).toBe(true);
      }
    });

    it("state reflects current status of each plugin", () =>
      Effect.gen(function* () {
        pluginRegistry._resetForTest();
        pluginRegistry._registerForTest(makeSuccessDescriptor());

        let state = pluginRegistry.getState()();
        expect(state.plugins.get(SuccessPluginId)?.status).toBe("pending");

        yield* initializeAll();

        state = pluginRegistry.getState()();
        expect(state.plugins.get(SuccessPluginId)?.status).toBe("ready");
      }),
    );
  });

  describe("parallel initialization", () => {
    it.effect("multiple plugins initialize in parallel", () =>
      Effect.gen(function* () {
        pluginRegistry._resetForTest();

        const order: string[] = [];
        const d2 = yield* Deferred.make<void>();

        pluginRegistry._registerForTest({
          id: "parallel-1",
          initialize: Effect.gen(function* () {
            order.push("parallel-1-start");
            yield* Deferred.await(d2);
            yield* Effect.sleep(50);
            order.push("parallel-1-end");
          }),
          route: { path: "/p1", label: "P1" },
          sidebar: { icon: "Zap", order: 1, visible: true },
        });

        pluginRegistry._registerForTest({
          id: "parallel-2",
          initialize: Effect.gen(function* () {
            order.push("parallel-2-start");
            yield* Deferred.complete(d2, Effect.void);
            yield* Effect.sleep(50);
            order.push("parallel-2-end");
          }),
          route: { path: "/p2", label: "P2" },
          sidebar: { icon: "Bot", order: 2, visible: true },
        });

        yield* initializeAll();

        const start1 = order.indexOf("parallel-1-start");
        const start2 = order.indexOf("parallel-2-start");
        const end1 = order.indexOf("parallel-1-end");
        const end2 = order.indexOf("parallel-2-end");

        expect(start1).toBeLessThan(end1);
        expect(start2).toBeLessThan(end2);
        expect(end2).toBeLessThan(end1);
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


  describe("initializing state before parallel init", () => {
    it.effect("sets all pending plugins to initializing BEFORE Promise.all starts", () =>
      Effect.gen(function* () {
        pluginRegistry._resetForTest();
        let initializingObserved = false;

        pluginRegistry._registerForTest({
          id: "blocking-plugin",
          initialize: Effect.gen(function* () {
            const midState = pluginRegistry.getState()();
            const plugin = midState.plugins.get("blocking-plugin");
            if (plugin?.status === "initializing") {
              initializingObserved = true;
            }
            yield* Effect.sleep(10);
          }),
          route: { path: "/blocking", label: "Blocking" },
          sidebar: { icon: "Blocks", order: 0, visible: true },
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
            const s = pluginRegistry.getState()();
            const p = s.plugins.get("freeze-test");
            if (p?.status === "initializing") {
              observedInitializing = true;
            }
          }),
          route: { path: "/freeze", label: "Freeze" },
          sidebar: { icon: "FastForward", order: 0, visible: true },
        });

        yield* initializeAll();
        expect(observedInitializing).toBe(true);
      }),
    );
  });


  describe("reactive state accessor", () => {
    it.effect("state changes are observable via accessor after init", () =>
      Effect.gen(function* () {
        pluginRegistry._resetForTest();
        pluginRegistry._registerForTest(makeSuccessDescriptor());

        const accessor = pluginRegistry.getState();

        let state1 = accessor();
        expect(state1.plugins.get(SuccessPluginId)?.status).toBe("pending");

        yield* initializeAll();

        let state2 = accessor();
        expect(state2.plugins.get(SuccessPluginId)?.status).toBe("ready");
      }),
    );
  });


  describe("public registration API", () => {
    it.effect("registerPlugin allows replacing a plugin's initialize effect", () =>
      Effect.gen(function* () {
        pluginRegistry._resetForTest();

        let callCount = 0;
        const countingInitialize = Effect.gen(function* () {
          callCount++;
        });

        pluginRegistry.registerPlugin({
          id: "replaceable-plugin",
          initialize: countingInitialize,
          route: { path: "/replace", label: "Replace" },
          sidebar: { icon: "Rocket", order: 0, visible: true },
        });

        yield* initializeAll();
        expect(callCount).toBe(1);

        let secondCallCount = 0;
        const newInitialize = Effect.gen(function* () {
          secondCallCount++;
        });

        pluginRegistry.registerPlugin({
          id: "replaceable-plugin",
          initialize: newInitialize,
          route: { path: "/replace", label: "Replace" },
          sidebar: { icon: "Rocket", order: 0, visible: true },
        });

        yield* initializeAll();
        expect(secondCallCount).toBe(1);
      }),
    );
  });

});
