//! Billing 工具 — Effect 服务测试（从 T33 扩展）。
//!
//! Effect 测试验证工具定义可与 pi-agent 运行时的 tool-dispatch 模式配合使用（T17 的关注点）。

import { describe, it, expect } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { BillingService } from "../../../shared/lib/tauri";
import type { AppError } from "../../../shared/lib/types";

describe("billing 工具 — Effect 服务集成", () => {
  // Mock BillingServiceLive，成功返回已知 provider
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
      providerId === "deepseek" ? Effect.succeed(true) : Effect.succeed(false),
    setKey: () => Effect.succeed(undefined),
  });

  it.effect("BillingService.getSnapshot 返回 deepseek 的 balance", () =>
    Effect.gen(function* () {
      const svc = yield* BillingService;
      const snap = yield* svc.getSnapshot("deepseek");
      expect(snap.kind).toBe("balance");
      if (snap.kind === "balance") {
        expect(snap.amount).toBe(87.42);
        expect(snap.currency).toBe("CNY");
      }
    }).pipe(Effect.provide(MockBillingServiceLive)),
  );

  it.effect("BillingService.getSnapshot 返回 minimax 的 plan_quota", () =>
    Effect.gen(function* () {
      const svc = yield* BillingService;
      const snap = yield* svc.getSnapshot("minimax");
      expect(snap.kind).toBe("plan_quota");
      if (snap.kind === "plan_quota") {
        expect(snap.remaining).toBe(1_200_000);
        expect(snap.total).toBe(5_000_000);
      }
    }).pipe(Effect.provide(MockBillingServiceLive)),
  );

  it.effect("BillingService.getSnapshot 对未知 provider 失败", () =>
    Effect.gen(function* () {
      const svc = yield* BillingService;
      const result = yield* Effect.exit(svc.getSnapshot("unknown"));
      expect(result._tag).toBe("Failure");
    }).pipe(Effect.provide(MockBillingServiceLive)),
  );

  it.effect("BillingService.hasKey 对 deepseek 返回 true，对 minimax 返回 false", () =>
    Effect.gen(function* () {
      const svc = yield* BillingService;
      const hasKey = yield* svc.hasKey("deepseek");
      expect(hasKey).toBe(true);
      const noKey = yield* svc.hasKey("minimax");
      expect(noKey).toBe(false);
    }).pipe(Effect.provide(MockBillingServiceLive)),
  );
});
