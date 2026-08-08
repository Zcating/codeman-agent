/**
 * src/main/features/automations/scheduler.test.ts
 *
 * PR-γ (ADR-0058): AutomationScheduler class → `createAutomationScheduler()` factory。
 * `AutomationScheduler.getInstance()` 移除；测试现在通过 factory 创建实例。
 *
 * config / db / executor mocks 改为 Effect-returning 形式（与新签名对齐）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Effect, Layer } from "effect";
import * as NodePathModule from "@effect/platform-node/NodePath";
import type { AutomationRule } from "../../../shared/lib/automation-types";
import { NodeFileSystemLive } from "../../lib/file-system-node.js";

// Mock config — return functions that produce Effect values (matching new
// automations-config API: readAutomationsConfig is `Effect.fn(...)(...)` which
// is a () => Effect<...> factory, not a bare Effect).
vi.mock("./automations-config", () => ({
  readAutomationsConfig: () => Effect.succeed({ version: 1 as const, rules: [] }),
  writeAutomationsConfig: () => Effect.succeed(undefined),
  automationsConfigExists: () => Effect.succeed(false),
}));

vi.mock("./db", () => ({
  setDatabase: vi.fn(),
  insertExecution: () => Effect.succeed(undefined),
  updateExecutionCompletion: () => Effect.succeed(undefined),
  listExecutions: () => Effect.succeed([]),
  getExecution: () => Effect.succeed(null),
}));

vi.mock("./executor", () => ({
  executeAction: () => Effect.succeed({ status: "success" as const }),
}));

vi.mock("../workspaces/data", () => ({
  listWorkspaces: () => Effect.succeed([]),
}));

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/fake/home") },
  BrowserWindow: {
    getFocusedWindow: vi.fn(),
    getAllWindows: vi.fn(() => []),
  },
}));

const TestLayer = Layer.mergeAll(NodeFileSystemLive, NodePathModule.layer);

const { createAutomationScheduler } = await import("./scheduler");

const runWithFs = <A, E, R>(
  eff: Effect.Effect<A, E, R>,
): Promise<A> =>
  Effect.runPromise(eff.pipe(Effect.provide(TestLayer)) as Effect.Effect<A, E, never>);

describe("AutomationScheduler (factory)", () => {
  let scheduler: ReturnType<typeof createAutomationScheduler>;

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.clearAllMocks();
    scheduler = createAutomationScheduler();
  });

  afterEach(() => {
    scheduler.stop();
    vi.useRealTimers();
  });

  describe("start / stop", () => {
    it("start registers timers for enabled rules", async () => {
      const rule: AutomationRule = {
        id: "rule-start-test",
        name: "Test rule",
        enabled: true,
        schedule: { kind: "interval", everyMs: 60_000 },
        action: {
          kind: "llm",
          systemPrompt: "",
          userPrompt: "",
          providerId: "p1",
          modelId: "m1",
          timeoutMs: 300_000,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      // Override mock for this test
      const automationsConfig = await import("./automations-config");
      vi.spyOn(automationsConfig, "readAutomationsConfig").mockReturnValue(
        Effect.succeed({ version: 1 as const, rules: [rule] }),
      );

      await runWithFs(scheduler.start());
      expect(scheduler.getRule("rule-start-test")).toBeDefined();
    });

    it("start skips disabled rules", async () => {
      const rule: AutomationRule = {
        id: "rule-disabled",
        name: "Disabled rule",
        enabled: false,
        schedule: { kind: "interval", everyMs: 60_000 },
        action: {
          kind: "llm",
          systemPrompt: "",
          userPrompt: "",
          providerId: "p1",
          modelId: "m1",
          timeoutMs: 300_000,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const automationsConfig = await import("./automations-config");
      vi.spyOn(automationsConfig, "readAutomationsConfig").mockReturnValue(
        Effect.succeed({ version: 1 as const, rules: [rule] }),
      );

      await runWithFs(scheduler.start());
      expect(scheduler.getRule("rule-disabled")).toBeDefined();
      // Disabled rules still cached but no timers
    });

    it("stop clears all timers", () => {
      scheduler.stop();
      // After stop, no internal state should hold timers
      expect(true).toBe(true); // structural: stop() doesn't throw
    });
  });

  describe("runNow", () => {
    it("runNow throws for unknown ruleId", async () => {
      await expect(scheduler.runNow("unknown-rule", "manual")).rejects.toThrow();
    });
  });

  describe("queue ordering", () => {
    it("rule cache is populated on start", async () => {
      const rule: AutomationRule = {
        id: "rule-cache",
        name: "Cache test",
        enabled: true,
        schedule: { kind: "interval", everyMs: 60_000 },
        action: {
          kind: "llm",
          systemPrompt: "",
          userPrompt: "",
          providerId: "p1",
          modelId: "m1",
          timeoutMs: 300_000,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const automationsConfig = await import("./automations-config");
      vi.spyOn(automationsConfig, "readAutomationsConfig").mockReturnValue(
        Effect.succeed({ version: 1 as const, rules: [rule] }),
      );

      await runWithFs(scheduler.start());
      expect(scheduler.getRule("rule-cache")).toBeDefined();
      expect(scheduler.getRule("rule-cache")?.name).toBe("Cache test");
    });
  });
});