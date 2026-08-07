// ADR-0053 TC — service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Effect } from "effect";
import type { AutomationRule } from "../../../shared/lib/automation-types";

// Create mutable mock state
let mockReadConfigState: { version: 1; rules: AutomationRule[] } = { version: 1 as const, rules: [] };
let mockListExecutionsState: any[] = [];
let mockGetExecutionState: any | null = null;

const mockSchedulerRunNow = vi.fn<() => Promise<void>>(() => Promise.resolve());

vi.mock("./automations-config", () => ({
  readAutomationsConfig: () => Effect.succeed(mockReadConfigState),
  writeAutomationsConfig: (config: any) => {
    mockReadConfigState = config;
    return Effect.succeed(undefined);
  },
}));

vi.mock("./db", () => ({
  setDatabase: vi.fn(),
  insertExecution: () => Effect.succeed(undefined),
  updateExecutionCompletion: () => Effect.succeed(undefined),
  listExecutions: () => Effect.succeed(mockListExecutionsState),
  getExecution: () => Effect.succeed(mockGetExecutionState),
}));

vi.mock("./scheduler", () => ({
  AutomationScheduler: {
    getInstance: () => ({
      runNow: mockSchedulerRunNow,
      stop: vi.fn(),
    }),
  },
}));

describe("automation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadConfigState = { version: 1 as const, rules: [] };
    mockListExecutionsState = [];
    mockGetExecutionState = null;
    mockSchedulerRunNow.mockResolvedValue(undefined);
  });

  describe("listRules", () => {
    it("returns empty array when no rules", async () => {
      const { listRules } = await import("./service");
      const result = await Effect.runPromise(listRules());
      expect(result).toEqual([]);
    });

    it("returns rules from config", async () => {
      const rule: AutomationRule = {
        id: "rule-1",
        name: "Test rule",
        enabled: true,
        schedule: { kind: "interval", everyMs: 60000 },
        action: { kind: "llm", systemPrompt: "", userPrompt: "", providerId: "p1", modelId: "m1", timeoutMs: 300_000 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mockReadConfigState = { version: 1 as const, rules: [rule] };

      const { listRules } = await import("./service");
      const result = await Effect.runPromise(listRules());
      expect(result).toEqual([rule]);
    });
  });

  describe("createRule", () => {
    it("adds rule to config", async () => {
      const rule: AutomationRule = {
        id: "new-rule",
        name: "New rule",
        enabled: true,
        schedule: { kind: "interval", everyMs: 60000 },
        action: { kind: "llm", systemPrompt: "", userPrompt: "", providerId: "p1", modelId: "m1", timeoutMs: 300_000 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const { createRule, listRules } = await import("./service");

      // First list should be empty
      const before = await Effect.runPromise(listRules());
      expect(before).toEqual([]);

      // Create the rule
      const result = await Effect.runPromise(createRule(rule));
      expect(result).toEqual(rule);

      // After create, list should contain the rule
      const after = await Effect.runPromise(listRules());
      expect(after).toContainEqual(expect.objectContaining({ id: "new-rule" }));
    });
  });

  describe("updateRule", () => {
    it("updates existing rule", async () => {
      const existingRule: AutomationRule = {
        id: "rule-to-update",
        name: "Original name",
        enabled: true,
        schedule: { kind: "interval", everyMs: 60000 },
        action: { kind: "llm", systemPrompt: "", userPrompt: "", providerId: "p1", modelId: "m1", timeoutMs: 300_000 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mockReadConfigState = { version: 1 as const, rules: [existingRule] };

      const updatedRule = { ...existingRule, name: "Updated name" };

      const { updateRule } = await import("./service");
      const result = await Effect.runPromise(updateRule(updatedRule));

      expect(result.name).toBe("Updated name");
    });

    it("throws NotFound for unknown rule", async () => {
      const { updateRule } = await import("./service");
      const result = await Effect.runPromiseExit(
        updateRule({
          id: "unknown",
          name: "Unknown",
          enabled: true,
          schedule: { kind: "interval", everyMs: 60000 },
          action: { kind: "llm", systemPrompt: "", userPrompt: "", providerId: "p1", modelId: "m1", timeoutMs: 300_000 },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      );

      expect(result._tag).toBe("Failure");
    });
  });

  describe("deleteRule", () => {
    it("throws NotFound for unknown rule", async () => {
      const { deleteRule } = await import("./service");
      const result = await Effect.runPromiseExit(deleteRule("unknown-id"));
      expect(result._tag).toBe("Failure");
    });
  });

  describe("toggleRule", () => {
    it("sets enabled to false", async () => {
      const rule: AutomationRule = {
        id: "rule-toggle",
        name: "Toggle test",
        enabled: true,
        schedule: { kind: "interval", everyMs: 60000 },
        action: { kind: "llm", systemPrompt: "", userPrompt: "", providerId: "p1", modelId: "m1", timeoutMs: 300_000 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mockReadConfigState = { version: 1 as const, rules: [rule] };

      const { toggleRule } = await import("./service");
      const result = await Effect.runPromise(toggleRule("rule-toggle", false));

      expect(result.enabled).toBe(false);
    });
  });

  describe("runNow", () => {
    it("calls scheduler.runNow with manual trigger", async () => {
      const rule: AutomationRule = {
        id: "rule-run",
        name: "Run test",
        enabled: true,
        schedule: { kind: "interval", everyMs: 60000 },
        action: { kind: "llm", systemPrompt: "", userPrompt: "", providerId: "p1", modelId: "m1", timeoutMs: 300_000 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mockReadConfigState = { version: 1 as const, rules: [rule] };

      const { runNow } = await import("./service");
      await Effect.runPromise(runNow("rule-run"));

      expect(mockSchedulerRunNow).toHaveBeenCalledWith("rule-run", "manual");
    });

    it("throws NotFound for unknown rule", async () => {
      const { runNow } = await import("./service");
      const result = await Effect.runPromiseExit(runNow("unknown"));
      expect(result._tag).toBe("Failure");
    });
  });

  describe("runMissed", () => {
    it("calls scheduler.runNow with missed-replay trigger", async () => {
      const rule: AutomationRule = {
        id: "rule-missed",
        name: "Missed test",
        enabled: true,
        schedule: { kind: "interval", everyMs: 60000 },
        action: { kind: "llm", systemPrompt: "", userPrompt: "", providerId: "p1", modelId: "m1", timeoutMs: 300_000 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mockReadConfigState = { version: 1 as const, rules: [rule] };

      const { runMissed } = await import("./service");
      await Effect.runPromise(runMissed("rule-missed"));

      expect(mockSchedulerRunNow).toHaveBeenCalledWith("rule-missed", "missed-replay");
    });
  });

  describe("listExecutions", () => {
    it("delegates to db.listExecutions", async () => {
      const exec = { id: "exec-1", rule_id: "rule-1" };
      mockListExecutionsState = [exec];

      const { listExecutions } = await import("./service");
      const result = await Effect.runPromise(listExecutions({}));

      expect(result).toEqual([exec]);
    });
  });

  describe("getExecution", () => {
    it("returns execution from db", async () => {
      const exec = { id: "exec-get", rule_id: "rule-1" };
      mockGetExecutionState = exec;

      const { getExecution } = await import("./service");
      const result = await Effect.runPromise(getExecution("exec-get"));

      expect(result).toEqual(exec);
    });

    it("throws NotFound for unknown execution", async () => {
      mockGetExecutionState = null;

      const { getExecution } = await import("./service");
      const result = await Effect.runPromiseExit(getExecution("unknown"));
      expect(result._tag).toBe("Failure");
    });
  });
});
