//! 适配器注册表测试（V1.5+）。

import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { getAdapter, registerAdapter, adapterRegistry } from "./index";
import { deepseekAdapter } from "./deepseek";
import { minimaxAdapter } from "./minimax";
import type { BillingAdapter } from "./types";

describe("adapterRegistry", () => {
  it("getAdapter returns deepseekAdapter for 'deepseek'", () => {
    expect(getAdapter("deepseek")).toBe(deepseekAdapter);
  });

  it("getAdapter returns minimaxAdapter for 'minimax'", () => {
    expect(getAdapter("minimax")).toBe(minimaxAdapter);
  });

  it("getAdapter returns null for missing adapter", () => {
    expect(getAdapter("nonexistent")).toBeNull();
  });

  it("registerAdapter adds new adapter to registry", () => {
    const testAdapter: BillingAdapter = {
      id: "test",
      fetchBalance: () => Effect.succeed({ amount: 0, currency: "USD" }),
      fetchPlanQuota: () => Effect.succeed({ remaining: 0, total: 0 }),
    };
    registerAdapter("test", testAdapter);
    expect(getAdapter("test")).toBe(testAdapter);
    // Cleanup
    adapterRegistry.delete("test");
  });

  it("registerAdapter overwrites existing adapter", () => {
    const newAdapter: BillingAdapter = {
      id: "deepseek",
      fetchBalance: () => Effect.succeed({ amount: 999, currency: "EUR" }),
      fetchPlanQuota: () => Effect.succeed({ remaining: 999, total: 999 }),
    };
    registerAdapter("deepseek", newAdapter);
    expect(getAdapter("deepseek")).toBe(newAdapter);
    // Restore original
    adapterRegistry.set("deepseek", deepseekAdapter);
  });
});
