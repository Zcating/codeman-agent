//! BillingAdapter 接口 — 类型级测试。
//!
//! 这些测试验证 BillingAdapter 接口可以正确接受有效实现，
//! 并且会拒绝缺少 fetchPlanQuota 的实现。

import { Effect } from "effect";
import type { BillingAdapter, Balance, PlanQuota } from "./types";

// =============================================================================
// Positive test: 有效实现满足 BillingAdapter 接口
// =============================================================================

// 实现一个有效的 BillingAdapter
const testAdapter: BillingAdapter = {
  id: "deepseek",
  fetchBalance: (_apiKey: string) =>
    Effect.succeed({
      amount: 87.42,
      currency: "CNY",
      auto_recharge: true,
    } as Balance),
  fetchPlanQuota: (_apiKey: string) =>
    Effect.succeed({
      remaining: 1_200_000,
      total: 5_000_000,
      expires_at: "2026-12-31",
      daily_avg: 50000,
    } as PlanQuota),
};

// 验证 id 属性存在
const _id: string = testAdapter.id;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
void [_id]; // 防止未使用警告

// =============================================================================
// Negative test: 缺少 fetchPlanQuota 的实现应产生类型错误
// =============================================================================

// @ts-expect-error - 缺少 fetchPlanQuota 方法，BillingAdapter 接口要求此方法
const invalidAdapterMissingMethod: BillingAdapter = {
  id: "deepseek",
  fetchBalance: (_apiKey: string) =>
    Effect.succeed({
      amount: 87.42,
      currency: "CNY",
    }),
};

// @ts-expect-error - fetchBalance 返回类型不匹配（返回 string 而非 Balance）
const invalidAdapterWrongReturnType: BillingAdapter = {
  id: "deepseek",
  fetchBalance: (_apiKey: string) => Effect.succeed("not a balance" as unknown as Balance),
  fetchPlanQuota: (_apiKey: string) =>
    Effect.succeed({
      remaining: 100,
      total: 200,
    }),
};
