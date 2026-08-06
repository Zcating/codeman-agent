import { describe, it, expect, beforeEach } from "vitest";
import { Effect, Layer } from "effect";
import { it as itEffect } from "@effect/vitest";
import {
  automationsRules$,
  automationsLoading$,
  automationsError$,
  automationsStore,
  _resetForTest,
} from "./automations.store";
import { AutomationsApi } from "@codeman-frontend/shared/apis";
import type { AutomationRule } from "@codeman-frontend/shared/lib/automation-types";

const makeRule = (overrides: Partial<AutomationRule> = {}): AutomationRule => ({
  id: "rule-1" as any,
  name: "Test Rule",
  enabled: true,
  schedule: { kind: "interval", everyMs: 60_000 },
  action: { kind: "llm", systemPrompt: "", userPrompt: "", providerId: "p1", modelId: "m1", timeoutMs: 300_000 },
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

const mockLayer = (rules: AutomationRule[]) =>
  Layer.succeed(AutomationsApi, {
    listRules: () => Effect.succeed(rules),
    createRule: (rule) => Effect.succeed(rule),
    updateRule: (rule) => Effect.succeed(rule),
    deleteRule: () => Effect.succeed(undefined),
    toggleRule: (id, enabled) =>
      Effect.succeed({ ...rules.find((r) => r.id === id)!, enabled } as AutomationRule),
    runNow: () => Effect.succeed(undefined),
    listExecutions: () => Effect.succeed([]),
    getExecution: () => Effect.succeed({} as any),
    runMissed: () => Effect.succeed(undefined),
  });

describe("automations store", () => {
  beforeEach(() => {
    _resetForTest();
  });

  it("初始状态为空数组", () => {
    expect(automationsRules$()).toEqual([]);
    expect(automationsLoading$()).toBe(false);
    expect(automationsError$()).toBe(null);
  });

  it("accessor 返回同一 reference", () => {
    const rules = automationsRules$();
    expect(automationsRules$()).toBe(rules);
  });

  describe("loadRules", () => {
    itEffect("loadRules 加载后规则被填充", () =>
      Effect.gen(function* () {
        const rules = [makeRule({ id: "r1" }), makeRule({ id: "r2" })];
        yield* automationsStore.effects.loadRules().pipe(Effect.provide(mockLayer(rules)));
        expect(automationsRules$()).toEqual(rules);
        expect(automationsLoading$()).toBe(false);
      }),
    );

    itEffect("loadRules 失败时 error 被设置", () =>
      Effect.gen(function* () {
        const failLayer = Layer.succeed(AutomationsApi, {
          listRules: () => Effect.fail(new Error("IPC failed") as any),
          createRule: () => Effect.fail(new Error("IPC failed") as any),
          updateRule: () => Effect.fail(new Error("IPC failed") as any),
          deleteRule: () => Effect.fail(new Error("IPC failed") as any),
          toggleRule: () => Effect.fail(new Error("IPC failed") as any),
          runNow: () => Effect.fail(new Error("IPC failed") as any),
          listExecutions: () => Effect.fail(new Error("IPC failed") as any),
          getExecution: () => Effect.fail(new Error("IPC failed") as any),
          runMissed: () => Effect.fail(new Error("IPC failed") as any),
        });
        yield* automationsStore.effects.loadRules().pipe(Effect.provide(failLayer)).pipe(Effect.exit);
        // 失败不应改变已有状态
        expect(automationsRules$()).toEqual([]);
      }),
    );
  });

  describe("actions", () => {
    itEffect("createRule 添加规则到列表", () =>
      Effect.gen(function* () {
        const newRule = makeRule({ id: "new-rule" });
        yield* automationsStore.actions.createRule(newRule).pipe(Effect.provide(mockLayer([])));
        expect(automationsRules$()).toContain(newRule);
        expect(automationsRules$()).toHaveLength(1);
      }),
    );

    itEffect("updateRule 更新现有规则", () =>
      Effect.gen(function* () {
        const existing = makeRule({ id: "r1", name: "Old Name" });
        yield* automationsStore.effects.loadRules().pipe(Effect.provide(mockLayer([existing])));

        const updated = { ...existing, name: "New Name" };
        yield* automationsStore.actions.updateRule(updated).pipe(Effect.provide(mockLayer([existing])));
        expect(automationsRules$()[0]?.name).toBe("New Name");
      }),
    );

    itEffect("deleteRule 移除规则", () =>
      Effect.gen(function* () {
        const existing = makeRule({ id: "r1" });
        yield* automationsStore.effects.loadRules().pipe(Effect.provide(mockLayer([existing])));
        expect(automationsRules$()).toHaveLength(1);

        yield* automationsStore.actions.deleteRule("r1").pipe(Effect.provide(mockLayer([])));
        expect(automationsRules$()).toHaveLength(0);
      }),
    );

    itEffect("toggleRule 更新 enabled 状态", () =>
      Effect.gen(function* () {
        const existing = makeRule({ id: "r1", enabled: true });
        yield* automationsStore.effects.loadRules().pipe(Effect.provide(mockLayer([existing])));

        yield* automationsStore.actions.toggleRule("r1", false).pipe(Effect.provide(mockLayer([existing])));
        expect(automationsRules$()[0]?.enabled).toBe(false);
      }),
    );

    itEffect("runNow 调用后无状态变化（纯触发）", () =>
      Effect.gen(function* () {
        const existing = makeRule({ id: "r1" });
        yield* automationsStore.effects.loadRules().pipe(Effect.provide(mockLayer([existing])));

        yield* automationsStore.actions.runNow("r1").pipe(Effect.provide(mockLayer([existing])));
        expect(automationsRules$()).toEqual([existing]);
      }),
    );
  });
});
