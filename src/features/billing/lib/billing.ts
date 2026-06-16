//! Billing 工具 — AgentTool 实现（V1.5+）。
//!
//! T12: 使用 pi-ai 0.9.4 的 AgentTool 工厂模式。
//! 导出 getBalanceTool 和 getPlanQuotaTool，可直接注册到 pi-agent runtime。

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-ai";
import { Effect, Exit } from "effect";
import { getAdapter } from "./adapters";
import type { Balance, PlanQuota, BillingError } from "./adapters/types";

// ============================================================================
// AgentToolResult type (pi-ai 0.9.4 doesn't export this type)
// ============================================================================

interface TextContent {
  type: "text";
  text: string;
}

interface AgentToolResult<T> {
  content: TextContent[];
  details: T;
}

// ============================================================================
// Tool Schemas
// ============================================================================

const ProviderIdSchema = Type.Object({
  provider_id: Type.String(),
});

type ProviderIdArgs = Static<typeof ProviderIdSchema>;

// ============================================================================
// Helper: run Effect and convert to AgentToolResult
// ============================================================================

async function runBalanceEffect(
  effect: Effect.Effect<Balance, BillingError>,
): Promise<AgentToolResult<Balance | BillingError>> {
  const result = await Effect.runPromiseExit(effect);

  if (Exit.isFailure(result)) {
    const cause = result.cause;
    let err: BillingError;
    if (cause._tag === "Fail") {
      err = cause.error as BillingError;
    } else {
      err = { kind: "Upstream", message: String(cause) };
    }
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      details: err,
    };
  }

  const balance = result.value;
  return {
    content: [
      {
        type: "text",
        text: `Balance: ${balance.amount} ${balance.currency}`,
      },
    ],
    details: balance,
  };
}

async function runPlanQuotaEffect(
  effect: Effect.Effect<PlanQuota, BillingError>,
): Promise<AgentToolResult<PlanQuota | BillingError>> {
  const result = await Effect.runPromiseExit(effect);

  if (Exit.isFailure(result)) {
    const cause = result.cause;
    let err: BillingError;
    if (cause._tag === "Fail") {
      err = cause.error as BillingError;
    } else {
      err = { kind: "Upstream", message: String(cause) };
    }
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      details: err,
    };
  }

  const quota = result.value;
  return {
    content: [
      {
        type: "text",
        text: `Plan Quota: ${quota.remaining} / ${quota.total}`,
      },
    ],
    details: quota,
  };
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const getBalanceTool: AgentTool<typeof ProviderIdSchema, Balance | BillingError> = {
  label: "get_balance",
  name: "get_balance",
  description:
    "Fetch the current balance for a billing provider. Returns amount, currency, and auto-recharge flag.",
  parameters: ProviderIdSchema,
  execute: async (_toolCallId, args: ProviderIdArgs) => {
    const adapter = getAdapter(args.provider_id);
    if (!adapter) {
      const err: BillingError = {
        kind: "Upstream",
        message: `No adapter for ${args.provider_id}`,
      };
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        details: err,
      };
    }

    // TODO: V1.6+ — 获取实际 API key 从 Tauri store
    // 暂时传空字符串；需要时 adapter 会返回 Auth error
    return runBalanceEffect(adapter.fetchBalance(""));
  },
};

export const getPlanQuotaTool: AgentTool<typeof ProviderIdSchema, PlanQuota | BillingError> = {
  label: "get_plan_quota",
  name: "get_plan_quota",
  description: "Fetch the current plan quota (remaining / total tokens) for a billing provider.",
  parameters: ProviderIdSchema,
  execute: async (_toolCallId, args: ProviderIdArgs) => {
    const adapter = getAdapter(args.provider_id);
    if (!adapter) {
      const err: BillingError = {
        kind: "Upstream",
        message: `No adapter for ${args.provider_id}`,
      };
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        details: err,
      };
    }

    // TODO: V1.6+ — 获取实际 API key 从 Tauri store
    return runPlanQuotaEffect(adapter.fetchPlanQuota(""));
  },
};

/** 所有 billing 工具数组（供 runtime 注册） */
export const billingTools: AgentTool<any, any>[] = [getBalanceTool, getPlanQuotaTool];
