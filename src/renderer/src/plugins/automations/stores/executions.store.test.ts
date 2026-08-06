import { describe, it, expect, beforeEach } from "vitest";
import { Effect, Layer } from "effect";
import {
  executions$,
  executionsLoading$,
  executionsStore,
  _resetForTest,
} from "./executions.store";
import { AutomationsApi } from "@codeman-frontend/shared/apis";
import type { AutomationExecution } from "@codeman-frontend/shared/apis/invoke.api";

const makeExecution = (overrides: Partial<AutomationExecution> = {}): AutomationExecution => ({
  id: "exec-1",
  ruleId: "rule-1" as any,
  status: "success",
  triggerKind: "scheduled",
  startedAt: Date.now(),
  completedAt: Date.now(),
  durationMs: 1000,
  finalText: "Done",
  exitCode: null,
  stderr: null,
  error: null,
  metadataJson: null,
  ...overrides,
});

const mockLayer = (executions: AutomationExecution[]) =>
  Layer.succeed(AutomationsApi, {
    listRules: () => Effect.succeed([]),
    createRule: (rule) => Effect.succeed(rule as any),
    updateRule: (rule) => Effect.succeed(rule as any),
    deleteRule: () => Effect.succeed(undefined),
    toggleRule: () => Effect.succeed({} as any),
    runNow: () => Effect.succeed(undefined),
    listExecutions: () => Effect.succeed(executions),
    getExecution: (id) => Effect.succeed(executions.find((e) => e.id === id) ?? makeExecution({ id })),
    runMissed: () => Effect.succeed(undefined),
  });

describe("executions store", () => {
  beforeEach(() => {
    _resetForTest();
  });

  it("初始状态为空数组", () => {
    expect(executions$()).toEqual([]);
    expect(executionsLoading$()).toBe(false);
  });

  it("loadExecutions 填充执行历史", () =>
    Effect.gen(function* () {
      const execs = [makeExecution({ id: "e1" }), makeExecution({ id: "e2" })];
      yield* executionsStore.effects.loadExecutions().pipe(Effect.provide(mockLayer(execs)));
      expect(executions$()).toEqual(execs);
    }),
  );

  it("prependExecution 添加到列表头部", () => {
    const existing = makeExecution({ id: "e1" });
    const newExec = makeExecution({ id: "e2" });
    executionsStore.actions.prependExecution(existing);
    expect(executions$()).toHaveLength(1);
    executionsStore.actions.prependExecution(newExec);
    expect(executions$()).toHaveLength(2);
    expect(executions$()[0]?.id).toBe("e2");
  });
});
