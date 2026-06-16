//! BillingAdapter 接口定义（V1.5+）。
//!
//! 本模块定义 provider 适配器契约，用于从不同 billing provider
//!（DeepSeek / MiniMax）获取余额和套餐配额。

import { Effect } from "effect";

// ============================================================================
// Billing Snapshot Types
// ============================================================================

export interface Balance {
  amount: number;
  currency: string;
  auto_recharge?: boolean;
}

export interface PlanQuota {
  remaining: number;
  total: number;
  expires_at?: string;
  daily_avg?: number;
}

/** V1 snapshot 是 Balance | PlanQuota 的二选一联合 */
export type Snapshots = Balance | PlanQuota;

// ============================================================================
// Billing Error
// ============================================================================

export type BillingErrorKind = "Network" | "Auth" | "Upstream" | "Parse";

export interface BillingError {
  readonly kind: BillingErrorKind;
  readonly message: string;
}

// ============================================================================
// Billing Adapter Interface
// ============================================================================

export interface BillingAdapter {
  readonly id: string;
  fetchBalance(apiKey: string): Effect.Effect<Balance, BillingError>;
  fetchPlanQuota(apiKey: string): Effect.Effect<PlanQuota, BillingError>;
}
