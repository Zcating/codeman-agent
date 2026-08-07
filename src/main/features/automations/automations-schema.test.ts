// ADR-0053 T0 — automations-schema 测试
import { describe, it, expect } from "@effect/vitest";
import { Effect } from "effect";
import { parseAutomationRule } from "./automations-schema";

const VALID_INTERVAL_RULE = {
  id: "0191a123-4567-7890-abcd-ef0123456789",
  name: "Every 5 minutes check",
  enabled: true,
  schedule: { kind: "interval", everyMs: 300_000 },
  action: {
    kind: "llm",
    systemPrompt: "You are a helpful assistant.",
    userPrompt: "Check system status.",
    providerId: "minimax",
    modelId: "claude-opus",
    timeoutMs: 300_000,
  },
  createdAt: 1_725_558_000_000,
  updatedAt: 1_725_558_000_000,
};

const VALID_DAILY_RULE = {
  id: "0191a123-4567-7890-abcd-ef012345678a",
  name: "Daily report",
  enabled: true,
  schedule: { kind: "daily", hour: 9, minute: 0 },
  action: {
    kind: "script",
    language: "shell",
    source: "echo hello",
    workspaceId: "ws-1",
    timeoutMs: 300_000,
  },
  createdAt: 1_725_558_000_000,
  updatedAt: 1_725_558_000_000,
};

const VALID_WEEKLY_RULE = {
  id: "0191a123-4567-7890-abcd-ef012345678b",
  name: "Weekly summary",
  enabled: false,
  schedule: { kind: "weekly", weekday: 1, hour: 10, minute: 30 },
  action: {
    kind: "llm",
    systemPrompt: "Summarize the week.",
    userPrompt: "What happened this week?",
    providerId: "minimax",
    modelId: "claude-opus",
    timeoutMs: 300_000,
  },
  createdAt: 1_725_558_000_000,
  updatedAt: 1_725_558_000_000,
};

describe("automations-schema", () => {
  describe("parseAutomationRule", () => {
    it("parses a valid AutomationRule with interval schedule and preserves all fields", () =>
      Effect.gen(function* () {
        const result = yield* parseAutomationRule(VALID_INTERVAL_RULE);
        expect(result._tag).toBe("Right");
        if (result._tag === "Right") {
          const rule = result.right;
          expect(rule.id).toBe(VALID_INTERVAL_RULE.id);
          expect(rule.name).toBe(VALID_INTERVAL_RULE.name);
          expect(rule.enabled).toBe(VALID_INTERVAL_RULE.enabled);
          expect(rule.schedule).toEqual(VALID_INTERVAL_RULE.schedule);
          expect(rule.action).toEqual(VALID_INTERVAL_RULE.action);
          expect(rule.createdAt).toBe(VALID_INTERVAL_RULE.createdAt);
          expect(rule.updatedAt).toBe(VALID_INTERVAL_RULE.updatedAt);
        }
      }),
    );

    it("parses a valid AutomationRule with daily schedule", () =>
      Effect.gen(function* () {
        const result = yield* parseAutomationRule(VALID_DAILY_RULE);
        expect(result._tag).toBe("Right");
        if (result._tag === "Right") {
          const schedule = result.right.schedule as { kind: "daily"; hour: number; minute: number };
          expect(schedule.kind).toBe("daily");
          expect(schedule.hour).toBe(9);
          expect(schedule.minute).toBe(0);
        }
      }),
    );

    it("parses a valid AutomationRule with weekly schedule", () =>
      Effect.gen(function* () {
        const result = yield* parseAutomationRule(VALID_WEEKLY_RULE);
        expect(result._tag).toBe("Right");
        if (result._tag === "Right") {
          const schedule = result.right.schedule as { kind: "weekly"; weekday: number; hour: number; minute: number };
          expect(schedule.kind).toBe("weekly");
          expect(schedule.weekday).toBe(1);
          expect(schedule.hour).toBe(10);
          expect(schedule.minute).toBe(30);
        }
      }),
    );

    it("parses a valid AutomationRule with llm action", () =>
      Effect.gen(function* () {
        const result = yield* parseAutomationRule(VALID_INTERVAL_RULE);
        expect(result._tag).toBe("Right");
        if (result._tag === "Right") {
          const action = result.right.action as { kind: "llm"; systemPrompt: string; userPrompt: string; providerId: string; modelId: string; timeoutMs: number };
          expect(action.kind).toBe("llm");
          expect(action.systemPrompt).toBe("You are a helpful assistant.");
          expect(action.userPrompt).toBe("Check system status.");
          expect(action.providerId).toBe("minimax");
          expect(action.modelId).toBe("claude-opus");
          expect(action.timeoutMs).toBe(300_000);
        }
      }),
    );

    it("parses a valid AutomationRule with script action", () =>
      Effect.gen(function* () {
        const result = yield* parseAutomationRule(VALID_DAILY_RULE);
        expect(result._tag).toBe("Right");
        if (result._tag === "Right") {
          const action = result.right.action as { kind: "script"; language: "shell" | "javascript"; source: string; workspaceId: string; timeoutMs: number };
          expect(action.kind).toBe("script");
          expect(action.language).toBe("shell");
          expect(action.source).toBe("echo hello");
          expect(action.workspaceId).toBe("ws-1");
          expect(action.timeoutMs).toBe(300_000);
        }
      }),
    );

    it("fails when required field is missing", () =>
      Effect.gen(function* () {
        const missingName = { ...VALID_INTERVAL_RULE };
        delete (missingName as Record<string, unknown>).name;
        const result = yield* parseAutomationRule(missingName);
        expect(result._tag).toBe("Left");
      }),
    );

    it("fails when enabled is string instead of boolean", () =>
      Effect.gen(function* () {
        const badEnabled = { ...VALID_INTERVAL_RULE, enabled: "true" };
        const result = yield* parseAutomationRule(badEnabled);
        expect(result._tag).toBe("Left");
      }),
    );

    it("fails when llm action timeoutMs is below minimum (30_000)", () =>
      Effect.gen(function* () {
        const tooLowTimeout = {
          ...VALID_INTERVAL_RULE,
          action: { ...VALID_INTERVAL_RULE.action, timeoutMs: 10_000 },
        };
        const result = yield* parseAutomationRule(tooLowTimeout);
        expect(result._tag).toBe("Left");
      }),
    );

    it("fails when llm action timeoutMs is above maximum (1_800_000)", () =>
      Effect.gen(function* () {
        const tooHighTimeout = {
          ...VALID_INTERVAL_RULE,
          action: { ...VALID_INTERVAL_RULE.action, timeoutMs: 2_000_000 },
        };
        const result = yield* parseAutomationRule(tooHighTimeout);
        expect(result._tag).toBe("Left");
      }),
    );

    it("fails when script action timeoutMs is below minimum (5_000)", () =>
      Effect.gen(function* () {
        const tooLowTimeout = {
          ...VALID_DAILY_RULE,
          action: { ...VALID_DAILY_RULE.action, timeoutMs: 1_000 },
        };
        const result = yield* parseAutomationRule(tooLowTimeout);
        expect(result._tag).toBe("Left");
      }),
    );
  });
});
