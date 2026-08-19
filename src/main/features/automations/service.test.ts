/**
 * src/main/features/automations/service.test.ts
 *
 * in service.ts before wrapping to Effect.fn (commit #7).
 *
 * Test pattern: vitest + Effect.runPromise with TestLayer (NodeFileSystemLive + NodePath.layer).
 * DB-dependent functions use setDatabase() for the db singleton.
 */
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Effect, Layer } from "effect";
import * as NodePathModule from "@effect/platform-node/NodePath";
import { rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { NodeFileSystemLive } from "../../lib/file-system-node.js";
import {
  listRules,
  createRule,
  updateRule,
  deleteRule,
  toggleRule,
  runNow,
  runMissed,
  listExecutions,
  getExecution,
} from "./service.js";
import { setDatabase } from "./db.js";
import { AppBackendError } from "../../lib/errors.js";
import type { AutomationRule } from "../../../shared/lib/automation-types";

const mocks = vi.hoisted(() => {
  const mockGetPath = vi.fn(() => "");
  return { mockGetPath };
});

vi.mock("electron", () => ({
  app: { getPath: mocks.mockGetPath },
}));

// Fake SqliteClient for R channel (runNow/runMissed require it in type signature)
const fakeSqliteClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

let tempDir = "";

const SqliteClientModule = await import("@effect/sql-sqlite-node/SqliteClient");
const TestLayer = Layer.mergeAll(
  NodeFileSystemLive,
  NodePathModule.layer,
  Layer.succeed(SqliteClientModule.SqliteClient, fakeSqliteClient),
);

const runWithFs = <A, E, R>(eff: Effect.Effect<A, E, R>): Promise<A> =>
  Effect.runPromise(eff.pipe(Effect.provide(TestLayer)) as Effect.Effect<A, E, never>);

const SAMPLE_RULE: AutomationRule = {
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

beforeEach(async () => {
  tempDir = join(
    tmpdir(),
    `codeman-automations-service-test-${Date.now()}-${Math.random()}`,
  );
  mocks.mockGetPath.mockReturnValue(tempDir);
  await mkdir(join(tempDir, ".agents"), { recursive: true });
});

afterEach(async () => {
  try {
    await rm(join(tempDir, ".agents"), { recursive: true, force: true });
  } catch {
    // ignore
  }
  vi.restoreAllMocks();
});

describe("listRules", () => {
  it("returns empty array when config does not exist", async () => {
    const result = await runWithFs(listRules());
    expect(result).toEqual([]);
  });

  it("returns rules from config", async () => {
    const config = { version: 1 as const, rules: [SAMPLE_RULE] };
    await writeFile(
      join(tempDir, ".agents", "automations.json"),
      JSON.stringify(config),
      "utf-8",
    );
    const result = await runWithFs(listRules());
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(SAMPLE_RULE.id);
  });
});

describe("createRule", () => {
  it("adds rule and returns it", async () => {
    const result = await runWithFs(createRule(SAMPLE_RULE));
    expect(result).toEqual(SAMPLE_RULE);
    const listResult = await runWithFs(listRules());
    expect(listResult).toHaveLength(1);
    expect(listResult[0]?.id).toBe(SAMPLE_RULE.id);
  });

  it("appends to existing rules", async () => {
    const rule2: AutomationRule = { ...SAMPLE_RULE, id: "0191a000-0000-0000-0000-000000000001", name: "Rule 2" };
    await runWithFs(createRule(SAMPLE_RULE));
    await runWithFs(createRule(rule2));
    const listResult = await runWithFs(listRules());
    expect(listResult).toHaveLength(2);
  });
});

describe("updateRule", () => {
  it("updates existing rule and returns it", async () => {
    await runWithFs(createRule(SAMPLE_RULE));
    const updated = { ...SAMPLE_RULE, name: "Updated name" };
    const result = await runWithFs(updateRule(updated));
    expect(result.name).toBe("Updated name");
  });

  it("returns NotFound when rule does not exist", async () => {
    const exit = await Effect.runPromiseExit(
      updateRule(SAMPLE_RULE).pipe(Effect.provide(TestLayer)),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const cause = exit.cause;
      if (cause._tag === "Fail") {
        expect(cause.error).toBeInstanceOf(AppBackendError.NotFound);
      }
    }
  });
});

describe("deleteRule", () => {
  it("removes existing rule", async () => {
    await runWithFs(createRule(SAMPLE_RULE));
    await runWithFs(deleteRule(SAMPLE_RULE.id));
    const result = await runWithFs(listRules());
    expect(result).toHaveLength(0);
  });

  it("returns NotFound when rule does not exist", async () => {
    const exit = await Effect.runPromiseExit(
      deleteRule("nonexistent-id").pipe(Effect.provide(TestLayer)),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const cause = exit.cause;
      if (cause._tag === "Fail") {
        expect(cause.error).toBeInstanceOf(AppBackendError.NotFound);
      }
    }
  });
});

describe("toggleRule", () => {
  it("toggles enabled to false", async () => {
    await runWithFs(createRule(SAMPLE_RULE));
    const result = await runWithFs(toggleRule(SAMPLE_RULE.id, false));
    expect(result.enabled).toBe(false);
    expect(result.id).toBe(SAMPLE_RULE.id);
  });

  it("toggles enabled to true", async () => {
    const disabledRule = { ...SAMPLE_RULE, enabled: false };
    await runWithFs(createRule(disabledRule));
    const result = await runWithFs(toggleRule(SAMPLE_RULE.id, true));
    expect(result.enabled).toBe(true);
  });

  it("returns NotFound when rule does not exist", async () => {
    const exit = await Effect.runPromiseExit(
      toggleRule("nonexistent-id", true).pipe(Effect.provide(TestLayer)),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const cause = exit.cause;
      if (cause._tag === "Fail") {
        expect(cause.error).toBeInstanceOf(AppBackendError.NotFound);
      }
    }
  });
});

describe("runNow", () => {
  it("returns NotFound when rule does not exist in config", async () => {
    const exit = await Effect.runPromiseExit(
      runNow("nonexistent-id").pipe(Effect.provide(TestLayer)),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const cause = exit.cause;
      if (cause._tag === "Fail") {
        expect(cause.error).toBeInstanceOf(AppBackendError.NotFound);
      }
    }
  });
});

describe("runMissed", () => {
  it("returns NotFound when rule does not exist in config", async () => {
    const exit = await Effect.runPromiseExit(
      runMissed("nonexistent-id").pipe(Effect.provide(TestLayer)),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const cause = exit.cause;
      if (cause._tag === "Fail") {
        expect(cause.error).toBeInstanceOf(AppBackendError.NotFound);
      }
    }
  });
});

describe("listExecutions", () => {
  it("returns empty array when no executions exist", async () => {
    // setDatabase with fake in-memory db
    const fakeDb = new Map<string, Record<string, unknown>>();
    const makeStmt = () => ({
      run: vi.fn((params?: Record<string, unknown>) => {
        if (params?.id) fakeDb.set(params.id as string, { ...params });
      }),
      all: vi.fn(() => Array.from(fakeDb.values())),
      get: vi.fn((id: string) => fakeDb.get(id)),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const FakeDatabase = function () {
      return {
        prepare: vi.fn(() => makeStmt()),
        exec: vi.fn(),
        close: vi.fn(),
        transaction: vi.fn((fn: () => void) => fn()),
      };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setDatabase(new (FakeDatabase as any)());

    const result = await Effect.runPromiseExit(
      listExecutions({}).pipe(Effect.provide(TestLayer)),
    );
    expect(result._tag).toBe("Success");
    if (result._tag === "Success") {
      expect(result.value).toEqual([]);
    }
  });
});

describe("getExecution", () => {
  it("returns NotFound when execution does not exist", async () => {
    const makeStmt = () => ({
      run: vi.fn(),
      all: vi.fn(() => []),
      get: vi.fn(() => undefined),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const FakeDatabase = function () {
      return {
        prepare: vi.fn(() => makeStmt()),
        exec: vi.fn(),
        close: vi.fn(),
        transaction: vi.fn((fn: () => void) => fn()),
      };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setDatabase(new (FakeDatabase as any)());

    const exit = await Effect.runPromiseExit(
      getExecution("nonexistent").pipe(Effect.provide(TestLayer)),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const cause = exit.cause;
      if (cause._tag === "Fail") {
        expect(cause.error).toBeInstanceOf(AppBackendError.NotFound);
      }
    }
  });
});
