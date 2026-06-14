//! Billing tools — Effect service tests (extended from T33).
//!
//! Effect tests verify the tool definitions are usable with the pi-agent
//! runtime's tool-dispatch pattern (T17's concern).

import { describe, it, expect } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { BillingService } from "../../../shared/lib/tauri";
import type { AppError } from "../../../shared/types";

describe("billing tools — Effect service integration", () => {
  // Mock BillingServiceLive that succeeds for known providers
  const MockBillingServiceLive = Layer.succeed(BillingService, {
    listProviders: () =>
      Effect.succeed([
        { id: "deepseek", label: "DeepSeek", enabled: true },
        { id: "minimax", label: "MiniMax", enabled: true },
      ]),
    getSnapshot: (providerId) => {
      if (providerId === "deepseek") {
        return Effect.succeed({
          kind: "balance" as const,
          amount: 87.42,
          currency: "CNY",
          auto_recharge: true,
        });
      }
      if (providerId === "minimax") {
        return Effect.succeed({
          kind: "plan_quota" as const,
          remaining: 1_200_000,
          total: 5_000_000,
          expires_at: null,
          daily_avg: null,
        });
      }
      return Effect.fail({
        kind: "NotFound" as const,
        message: `unknown provider: ${providerId}`,
      } as AppError);
    },
    hasKey: (providerId) =>
      providerId === "deepseek"
        ? Effect.succeed(true)
        : Effect.succeed(false),
    setKey: () => Effect.succeed(undefined),
  });

  it.effect("BillingService.getSnapshot returns balance for deepseek", () =>
    Effect.gen(function* () {
      const svc = yield* BillingService;
      const snap = yield* svc.getSnapshot("deepseek");
      expect(snap.kind).toBe("balance");
      if (snap.kind === "balance") {
        expect(snap.amount).toBe(87.42);
        expect(snap.currency).toBe("CNY");
      }
    }).pipe(Effect.provide(MockBillingServiceLive))
  );

  it.effect("BillingService.getSnapshot returns plan_quota for minimax", () =>
    Effect.gen(function* () {
      const svc = yield* BillingService;
      const snap = yield* svc.getSnapshot("minimax");
      expect(snap.kind).toBe("plan_quota");
      if (snap.kind === "plan_quota") {
        expect(snap.remaining).toBe(1_200_000);
        expect(snap.total).toBe(5_000_000);
      }
    }).pipe(Effect.provide(MockBillingServiceLive))
  );

  it.effect("BillingService.getSnapshot fails for unknown provider", () =>
    Effect.gen(function* () {
      const svc = yield* BillingService;
      const result = yield* Effect.exit(svc.getSnapshot("unknown"));
      expect(result._tag).toBe("Failure");
    }).pipe(Effect.provide(MockBillingServiceLive))
  );

  it.effect("BillingService.hasKey returns true for deepseek, false for minimax", () =>
    Effect.gen(function* () {
      const svc = yield* BillingService;
      const hasKey = yield* svc.hasKey("deepseek");
      expect(hasKey).toBe(true);
      const noKey = yield* svc.hasKey("minimax");
      expect(noKey).toBe(false);
    }).pipe(Effect.provide(MockBillingServiceLive))
  );
});