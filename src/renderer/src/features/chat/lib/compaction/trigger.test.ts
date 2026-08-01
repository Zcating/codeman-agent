import { describe, it, expect } from "@effect/vitest";
import { Effect } from "effect";
import { shouldTriggerAutoCompaction } from "./trigger";

describe("shouldTriggerAutoCompaction", () => {
  it("returns false when enabled=false even if tokens exceed threshold", () =>
    Effect.gen(function* () {
      const result = shouldTriggerAutoCompaction({
        enabled: false,
        contextWindow: 100_000,
        reserveTokens: 10_000,
        estimatedTokens: 95_000,
      });
      expect(result).toBe(false);
    }),
  );

  it("returns true when enabled=true and estimatedTokens >= contextWindow - reserveTokens", () =>
    Effect.gen(function* () {
      const result = shouldTriggerAutoCompaction({
        enabled: true,
        contextWindow: 100_000,
        reserveTokens: 10_000,
        estimatedTokens: 90_000,
      });
      expect(result).toBe(true);
    }),
  );

  it("returns true at boundary: estimatedTokens === contextWindow - reserveTokens", () =>
    Effect.gen(function* () {
      const result = shouldTriggerAutoCompaction({
        enabled: true,
        contextWindow: 100_000,
        reserveTokens: 10_000,
        estimatedTokens: 90_000,
      });
      expect(result).toBe(true);
    }),
  );

  it("returns false at boundary: estimatedTokens === contextWindow - reserveTokens - 1", () =>
    Effect.gen(function* () {
      const result = shouldTriggerAutoCompaction({
        enabled: true,
        contextWindow: 100_000,
        reserveTokens: 10_000,
        estimatedTokens: 89_999,
      });
      expect(result).toBe(false);
    }),
  );

  it("returns false when contextWindow=0 (avoids NaN)", () =>
    Effect.gen(function* () {
      const result = shouldTriggerAutoCompaction({
        enabled: true,
        contextWindow: 0,
        reserveTokens: 10_000,
        estimatedTokens: 0,
      });
      expect(result).toBe(false);
    }),
  );

  it("returns false when contextWindow is negative", () =>
    Effect.gen(function* () {
      const result = shouldTriggerAutoCompaction({
        enabled: true,
        contextWindow: -1,
        reserveTokens: 10_000,
        estimatedTokens: 0,
      });
      expect(result).toBe(false);
    }),
  );
});
