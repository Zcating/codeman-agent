// ADR-0053 TC — scheduler.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Effect } from "effect";
import type { AutomationRule } from "../../../shared/lib/automation-types";

// Create mock implementations
const mockReadConfig = vi.fn<() => Promise<{ version: 1; rules: AutomationRule[] }>>();
const mockListExecutions = vi.fn<() => Promise<any[]>>();
const mockInsertExecution = vi.fn<() => Promise<void>>();
const mockUpdateExecutionCompletion = vi.fn<() => Promise<void>>();
const mockExecuteAction = vi.fn<() => Promise<{ status: "success"; finalText?: string; exitCode?: number; stderr?: string; error?: string }>>();
const mockListWorkspaces = vi.fn<() => Promise<any[]>>();

// Mock modules before importing scheduler
vi.mock("./automations-config", () => ({
  readAutomationsConfig: () => Effect.tryPromise(() => mockReadConfig()),
}));

vi.mock("./db", () => ({
  setDatabase: vi.fn(),
  insertExecution: () => Effect.tryPromise(() => mockInsertExecution()),
  updateExecutionCompletion: () => Effect.tryPromise(() => mockUpdateExecutionCompletion()),
  listExecutions: () => Effect.tryPromise(() => mockListExecutions()),
}));

vi.mock("./executor", () => ({
  executeAction: () => Effect.tryPromise(() => mockExecuteAction()),
}));

vi.mock("../workspaces/data", () => ({
  listWorkspaces: () => Effect.tryPromise(() => mockListWorkspaces()),
}));

// Mock electron
vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/fake/home") },
  BrowserWindow: {
    getFocusedWindow: vi.fn(),
    getAllWindows: vi.fn(() => []),
  },
}));

describe("AutomationScheduler", () => {
  let AutomationScheduler: typeof import("./scheduler").AutomationScheduler;
  let scheduler: import("./scheduler").AutomationScheduler;

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.clearAllMocks();
    mockReadConfig.mockResolvedValue({ version: 1 as const, rules: [] });
    mockListExecutions.mockResolvedValue([]);
    mockInsertExecution.mockResolvedValue(undefined);
    mockUpdateExecutionCompletion.mockResolvedValue(undefined);
    mockExecuteAction.mockResolvedValue({ status: "success" });
    mockListWorkspaces.mockResolvedValue([]);

    // Re-import scheduler to get fresh instance
    const mod = await import("./scheduler");
    AutomationScheduler = mod.AutomationScheduler;
    scheduler = AutomationScheduler.getInstance();
    // Reset singleton state by clearing maps
    scheduler.stop();
  });

  afterEach(() => {
    scheduler.stop();
    vi.useRealTimers();
  });

  describe("singleton", () => {
    it("getInstance returns same instance", () => {
      const s1 = AutomationScheduler.getInstance();
      const s2 = AutomationScheduler.getInstance();
      expect(s1).toBe(s2);
    });
  });

  describe("start / stop", () => {
    it("start registers timers for enabled rules", async () => {
      const rule: AutomationRule = {
        id: "rule-start-test",
        name: "Test rule",
        enabled: true,
        schedule: { kind: "interval", everyMs: 60_000 },
        action: { kind: "llm", systemPrompt: "", userPrompt: "", providerId: "p1", modelId: "m1", timeoutMs: 300_000 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mockReadConfig.mockResolvedValue({ version: 1 as const, rules: [rule] });

      await scheduler.start();
      expect(scheduler["timers"].size).toBe(1);
      expect(scheduler["timers"].has("rule-start-test")).toBe(true);
    });

    it("start skips disabled rules", async () => {
      const rule: AutomationRule = {
        id: "rule-disabled",
        name: "Disabled rule",
        enabled: false,
        schedule: { kind: "interval", everyMs: 60_000 },
        action: { kind: "llm", systemPrompt: "", userPrompt: "", providerId: "p1", modelId: "m1", timeoutMs: 300_000 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mockReadConfig.mockResolvedValue({ version: 1 as const, rules: [rule] });

      await scheduler.start();
      expect(scheduler["timers"].size).toBe(0);
    });

    it("stop clears all timers", async () => {
      const rule: AutomationRule = {
        id: "rule-stop-test",
        name: "Test rule",
        enabled: true,
        schedule: { kind: "interval", everyMs: 60_000 },
        action: { kind: "llm", systemPrompt: "", userPrompt: "", providerId: "p1", modelId: "m1", timeoutMs: 300_000 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mockReadConfig.mockResolvedValue({ version: 1 as const, rules: [rule] });

      await scheduler.start();
      expect(scheduler["timers"].size).toBe(1);

      scheduler.stop();
      expect(scheduler["timers"].size).toBe(0);
    });

    it("start is idempotent (no double registration)", async () => {
      const rule: AutomationRule = {
        id: "rule-idempotent",
        name: "Test rule",
        enabled: true,
        schedule: { kind: "interval", everyMs: 60_000 },
        action: { kind: "llm", systemPrompt: "", userPrompt: "", providerId: "p1", modelId: "m1", timeoutMs: 300_000 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mockReadConfig.mockResolvedValue({ version: 1 as const, rules: [rule] });

      await scheduler.start();
      await scheduler.start();
      expect(scheduler["timers"].size).toBe(1);
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
        action: { kind: "llm", systemPrompt: "", userPrompt: "", providerId: "p1", modelId: "m1", timeoutMs: 300_000 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mockReadConfig.mockResolvedValue({ version: 1 as const, rules: [rule] });

      await scheduler.start();
      expect(scheduler.getRule("rule-cache")).toBeDefined();
      expect(scheduler.getRule("rule-cache")?.name).toBe("Cache test");
    });
  });

  describe("missed-run detection", () => {
    it("enqueues missed-replay when last execution is older than period", async () => {
      const rule: AutomationRule = {
        id: "rule-missed",
        name: "Missed detection test",
        enabled: true,
        schedule: { kind: "interval", everyMs: 60_000 },
        action: { kind: "llm", systemPrompt: "", userPrompt: "", providerId: "p1", modelId: "m1", timeoutMs: 300_000 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mockReadConfig.mockResolvedValue({ version: 1 as const, rules: [rule] });

      // Mock a completed execution 2 minutes ago (> 1 minute period)
      const twoMinutesAgo = Date.now() - 120_000;
      mockListExecutions.mockResolvedValue([{
        id: "exec-1",
        rule_id: "rule-missed",
        status: "success",
        trigger_kind: "scheduled",
        started_at: twoMinutesAgo,
        completed_at: twoMinutesAgo + 1000,
        duration_ms: 1000,
        final_text: null,
        exit_code: 0,
        stderr: null,
        error: null,
        metadata_json: null,
      }]);

      // Spy on enqueue to verify it was called with missed-replay
      const enqueueSpy = vi.spyOn(scheduler as any, "enqueue").mockImplementation(() => {});

      await scheduler.start();

      // Should have detected the missed run
      expect(enqueueSpy).toHaveBeenCalledWith("rule-missed", "missed-replay");
    });
  });
});
