//! DeepSeek billing adapter.
//!
//! Implements BillingAdapter for DeepSeek's balance API.
//! DeepSeek only supports balance (no plan_quota).

import { Effect } from "effect";
import type { BillingAdapter, Balance, BillingError } from "./types";

const BASE_URL = "https://api.deepseek.com/user/balance";

function mapFetchError(e: unknown): BillingError {
  if (e instanceof TypeError) {
    return { kind: "Network" as const, message: String(e) };
  }
  return { kind: "Upstream" as const, message: String(e) };
}

export const deepseekAdapter: BillingAdapter = {
  id: "deepseek",

  fetchBalance(apiKey: string) {
    return Effect.gen(function* () {
      // Step 1: Fetch with network error handling
      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(BASE_URL, {
            headers: { Authorization: `Bearer ${apiKey}` },
          }),
        catch: mapFetchError,
      });

      // Step 2: Check HTTP status codes
      if (response.status === 401) {
        return yield* Effect.fail({ kind: "Auth" as const, message: "Invalid API key" });
      }
      if (response.status >= 500) {
        return yield* Effect.fail({
          kind: "Upstream" as const,
          message: `HTTP ${response.status}`,
        });
      }
      if (!response.ok) {
        return yield* Effect.fail({
          kind: "Upstream" as const,
          message: `HTTP ${response.status}`,
        });
      }

      // Step 3: Parse JSON with error handling
      let data: {
        balance_infos: Array<{ currency: string; balance: string | number }>;
      };
      try {
        data = yield* Effect.tryPromise({
          try: () => response.json(),
          catch: () => ({ kind: "Parse", message: "Invalid JSON" }) as BillingError,
        });
      } catch {
        // This shouldn't happen because catch transforms the error,
        // but TypeScript needs assurance
        return yield* Effect.fail({
          kind: "Parse" as const,
          message: "Invalid JSON",
        });
      }

      // Step 4: Validate response shape
      const info = data.balance_infos?.[0];
      if (!info) {
        return yield* Effect.fail({
          kind: "Parse" as const,
          message: "No balance info",
        });
      }

      // Step 5: Return balance
      return {
        amount: Number(info.balance),
        currency: info.currency,
      } satisfies Balance;
    });
  },

  fetchPlanQuota(_apiKey: string) {
    return Effect.fail({
      kind: "Upstream" as const,
      message: "DeepSeek does not support plan_quota",
    });
  },
};
