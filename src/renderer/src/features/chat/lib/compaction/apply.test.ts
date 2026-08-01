import { describe, it, expect } from "@effect/vitest";
import { Effect, Exit, Context, Layer } from "effect";
import { applyCompactionToContext } from "./apply";
import type { CompactionEntry } from "./types";
import type { Message } from "@codeman-frontend/shared/lib/types";

// @ts-ignore - Layer.succeed requires a Tag but Context.empty() is valid at runtime
const EmptyTestLayer = Layer.succeed(Context.empty() as any, {} as any);

describe("applyCompactionToContext", () => {
  // Helper to build a mock message
  const msg = (id: string, role: string, content: string): Message => ({
    id,
    conversationId: "conv-1",
    role: role as "user" | "assistant" | "system",
    content,
    thinking: null,
    toolCalls: null,
    toolResults: null,
    model: null,
    inputTokens: null,
    outputTokens: null,
    createdAt: Date.now(),
  });

  const entry = (
    id: string,
    summary: string,
    firstKeptMessageId: string,
    createdAt: number,
  ): CompactionEntry =>
    ({
      id,
      conversationId: "conv-1",
      summary,
      model: "claude-3-5-sonnet",
      tokensBefore: 5000,
      kind: "auto",
      createdAt,
      firstKeptMessageId,
    }) as CompactionEntry;

  it("no entries -> returns original agentMessages unchanged", () =>
    Effect.gen(function* () {
      const agentMessages = [
        msg("m1", "user", "hello"),
        msg("m2", "assistant", "hi there"),
      ];

      const result = yield* applyCompactionToContext({ entries: [], agentMessages });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("m1");
      expect(result[1].id).toBe("m2");
    }).pipe(Effect.provide(EmptyTestLayer)),
  );

  it("1 entry: returns summary + messages from firstKeptMessageId onwards", () =>
    Effect.gen(function* () {
      const agentMessages = [
        msg("m1", "user", "hello"),
        msg("m2", "assistant", "hi there"),
        msg("m3", "user", "follow up"),
        msg("m4", "assistant", "answer"),
      ];

      const entries = [
        entry("e1", "Earlier conversation summary", "m3", 1000),
      ];

      const result = yield* applyCompactionToContext({ entries, agentMessages });

      // Result: summary message + m3 + m4
      expect(result).toHaveLength(3);
      expect(result[0].content).toBe("Earlier conversation summary");
      expect(result[0].role).toBe("system");
      expect(result[1].id).toBe("m3");
      expect(result[2].id).toBe("m4");
    }).pipe(Effect.provide(EmptyTestLayer)),
  );

  it("2 entries (rolling merge): uses latest entry's summary, ignores older", () =>
    Effect.gen(function* () {
      const agentMessages = [
        msg("m1", "user", "hello"),
        msg("m2", "assistant", "hi there"),
        msg("m3", "user", "follow up"),
        msg("m4", "assistant", "answer"),
      ];

      const entries = [
        entry("e1", "OLDEST summary should not appear", "m1", 1000),
        entry("e2", "LATEST summary should appear", "m3", 2000),
      ];

      const result = yield* applyCompactionToContext({ entries, agentMessages });

      // Rolling merge: latest entry (e2) summary + messages from e2.firstKeptMessageId (m3) onwards
      expect(result).toHaveLength(3);
      expect(result[0].content).toBe("LATEST summary should appear");
      expect(result[0].role).toBe("system");
      expect(result[1].id).toBe("m3");
      expect(result[2].id).toBe("m4");
    }).pipe(Effect.provide(EmptyTestLayer)),
  );

  it("old turn content does NOT appear in output (unique marker verification)", () =>
    Effect.gen(function* () {
      const agentMessages = [
        msg("m1", "user", "TURN-0-UNIQUE-MARKER"),
        msg("m2", "assistant", "response to marker"),
      ];

      const entries = [
        entry("e1", "summary of old turns", "m2", 1000),
      ];

      const result = yield* applyCompactionToContext({ entries, agentMessages });

      // m1 should NOT be in result (it's before firstKeptMessageId=m2)
      const contents = result.map((m) => m.content);
      expect(contents).not.toContain("TURN-0-UNIQUE-MARKER");
      expect(result[0].content).toBe("summary of old turns");
    }).pipe(Effect.provide(EmptyTestLayer)),
  );

  it("firstKeptMessageId not found in messages -> CompactionFailed({ reason: 'stale_entry' })", () =>
    Effect.gen(function* () {
      const agentMessages = [
        msg("m1", "user", "hello"),
        msg("m2", "assistant", "hi"),
      ];

      // entry references "m999" which doesn't exist
      const entries = [
        entry("e1", "summary", "m999", 1000),
      ];

      const exit = yield* Effect.exit(
        applyCompactionToContext({ entries, agentMessages }),
      );

      expect(exit._tag).toBe("Failure");
      if (Exit.isFailure(exit)) {
        const err = (exit.cause as any).error as any;
        expect(err._tag).toBe("CompactionFailed");
        expect(err.reason).toBe("stale_entry");
      }
    }).pipe(Effect.provide(EmptyTestLayer)),
  );
});
