//! MiniMax 计费适配器（V1.5+）。
//!
//! MiniMax 余额端点 URL TBD（V1.6+ 验证）。

import { Effect } from "effect";
import type { BillingAdapter, Balance, PlanQuota, BillingError } from "./types";

// TODO: V1.6+ — MiniMax 余额端点 URL 待公开验证
//       https://github.com/MiniMaxAI/MiniMax/issues/XXX
const QUOTA_URL = "https://api.minimaxi.com/anthropic/v1/quota/plan";

function mapFetchError(e: unknown): BillingError {
  if (e instanceof TypeError) {
    return { kind: "Network" as const, message: String(e) };
  }
  return { kind: "Upstream" as const, message: String(e) };
}

export const minimaxAdapter: BillingAdapter = {
  id: "minimax",

  fetchBalance(_apiKey: string): Effect.Effect<Balance, BillingError> {
    // TODO: V1.6+ — MiniMax balance endpoint not yet public
    return Effect.fail({
      kind: "Upstream" as const,
      message: "MiniMax balance endpoint not yet public",
    });
  },

  fetchPlanQuota(apiKey: string): Effect.Effect<PlanQuota, BillingError> {
    return Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(QUOTA_URL, {
            headers: { Authorization: `Bearer ${apiKey}` },
          }),
        catch: mapFetchError,
      });

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

      // Parse JSON response - use flatMap to properly handle type narrowing
      const parseResult = yield* Effect.flatMap(
        Effect.tryPromise({
          try: () => response.json() as Promise<unknown>,
          catch: (_e: unknown): BillingError => ({
            kind: "Parse" as const,
            message: "Invalid JSON",
          }),
        }),
        (
          data,
        ): Effect.Effect<
          { remaining_credit: number; total_credit: number; expires_at?: string },
          BillingError
        > => {
          if (typeof data !== "object" || data === null || Array.isArray(data)) {
            return Effect.fail({ kind: "Parse" as const, message: "Invalid JSON" });
          }
          const d = data as { remaining_credit: number; total_credit: number; expires_at?: string };
          return Effect.succeed(d);
        },
      );

      return {
        remaining: parseResult.remaining_credit,
        total: parseResult.total_credit,
        expires_at: parseResult.expires_at,
      } satisfies PlanQuota;
    });
  },
};
