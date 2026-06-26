//! Billing 工具 — AgentTool 测试（V1.5+）。
//!
//! T12: 4 个测试用例覆盖:
//! 1. getBalanceTool dispatches to DeepSeek adapter (happy path)
//! 2. getPlanQuotaTool dispatches to MiniMax adapter (happy path)
//! 3. invalid provider_id returns error in details
//! 4. adapter throws → tool.execute returns error in details

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Effect } from "effect";
import { getBalanceTool, getPlanQuotaTool } from "./billing";
import * as registry from "./adapters";
import { deepseekAdapter } from "./adapters/deepseek";
import type { BillingAdapter, Balance, PlanQuota } from "./adapters/types";

describe("billing tools", () => {
  // Mock adapter that returns successful results
  const mockBalanceAdapter: BillingAdapter = {
    id: "mock-balance",
    fetchBalance: () =>
      Effect.succeed({
        amount: 99.99,
        currency: "USD",
        auto_recharge: true,
      } satisfies Balance),
    fetchPlanQuota: () =>
      Effect.fail({
        kind: "Upstream" as const,
        message: "Not supported",
      }),
  };

  const mockQuotaAdapter: BillingAdapter = {
    id: "mock-quota",
    fetchBalance: () =>
      Effect.fail({
        kind: "Upstream" as const,
        message: "Not supported",
      }),
    fetchPlanQuota: () =>
      Effect.succeed({
        remaining: 500000,
        total: 1000000,
        expires_at: "2026-12-31",
        daily_avg: 15000,
      } satisfies PlanQuota),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    // Re-register deepseek adapter (may have been deleted by previous tests)
    registry.adapterRegistry.set("deepseek", deepseekAdapter);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore deepseek adapter for subsequent tests
    registry.adapterRegistry.set("deepseek", deepseekAdapter);
  });

  describe("getBalanceTool", () => {
    it("getBalanceTool dispatches to DeepSeek adapter", async () => {
      // Register mock adapter as deepseek
      registry.adapterRegistry.set("deepseek", mockBalanceAdapter);

      const result = await getBalanceTool.execute("test-call-id", {
        provider_id: "deepseek",
      });

      expect(result.details).toMatchObject({
        amount: 99.99,
        currency: "USD",
        auto_recharge: true,
      });
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: "Balance: 99.99 USD",
      });

      // Cleanup
      registry.adapterRegistry.delete("deepseek");
    });

    it("getBalanceTool with invalid provider_id returns error in details", async () => {
      const result = await getBalanceTool.execute("test-call-id", {
        provider_id: "nonexistent",
      });

      expect(result.details).toMatchObject({
        kind: "Upstream",
        message: "No adapter for nonexistent",
      });
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: "Error: No adapter for nonexistent",
      });
    });

    it("adapter throws → tool.execute returns error in details", async () => {
      // Create throwing adapter
      const throwingAdapter: BillingAdapter = {
        id: "throwing",
        fetchBalance: () =>
          Effect.fail({
            kind: "Network" as const,
            message: "Connection refused",
          }),
        fetchPlanQuota: () =>
          Effect.fail({
            kind: "Upstream" as const,
            message: "Not supported",
          }),
      };

      // Spy on getAdapter and return throwing adapter for deepseek
      const getAdapterSpy = vi.spyOn(registry, "getAdapter");
      getAdapterSpy.mockReturnValue(throwingAdapter);

      const result = await getBalanceTool.execute("test-call-id", {
        provider_id: "deepseek",
      });

      expect(result.details).toMatchObject({
        kind: "Network",
        message: "Connection refused",
      });
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: "Error: Connection refused",
      });
    });

    it("adapter Effect.die 触发 runBalanceEffect 走非-Fail cause 分支", async () => {
      // Create die adapter that uses Effect.die
      const dieAdapter: BillingAdapter = {
        id: "die-balance",
        fetchBalance: () => Effect.die(new Error("die boom")),
        fetchPlanQuota: () =>
          Effect.fail({
            kind: "Upstream" as const,
            message: "Not supported",
          }),
      };

      registry.adapterRegistry.set("die-balance", dieAdapter);

      const result = await getBalanceTool.execute("test-call-id", {
        provider_id: "die-balance",
      });

      expect(result.details).toMatchObject({ kind: "Upstream" });
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("Error:"),
      });

      // Cleanup
      registry.adapterRegistry.delete("die-balance");
    });
  });

  describe("getPlanQuotaTool", () => {
    it("getPlanQuotaTool dispatches to MiniMax adapter", async () => {
      // Register mock adapter as minimax
      registry.adapterRegistry.set("minimax", mockQuotaAdapter);

      const result = await getPlanQuotaTool.execute("test-call-id", {
        provider_id: "minimax",
      });

      expect(result.details).toMatchObject({
        remaining: 500000,
        total: 1000000,
        expires_at: "2026-12-31",
        daily_avg: 15000,
      });
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: "Plan Quota: 500000 / 1000000",
      });

      // Cleanup
      registry.adapterRegistry.delete("minimax");
    });

    it("getPlanQuotaTool with invalid provider_id returns error in details", async () => {
      const result = await getPlanQuotaTool.execute("test-call-id", {
        provider_id: "unknown",
      });

      expect(result.details).toMatchObject({
        kind: "Upstream",
        message: "No adapter for unknown",
      });
    });

    it("getPlanQuotaTool 调 deepseek adapter (无 plan_quota 支持) → Upstream", async () => {
      // deepseekAdapter is registered in adapterRegistry by default
      const result = await getPlanQuotaTool.execute("test-call-id", {
        provider_id: "deepseek",
      });

      expect(result.details).toMatchObject({
        kind: "Upstream",
        message: expect.stringContaining("does not support plan_quota"),
      });
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("Error:"),
      });
    });
  });
});
