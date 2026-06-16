//! MiniMax billing adapter tests.
//!
//! 4 QA scenarios:
//! 1. Happy path (200 OK) — returns PlanQuota
//! 2. Auth error (401) — returns Auth error
//! 3. 5xx upstream error (503) — returns Upstream error
//! 4. fetchBalance() returns Upstream error (not yet supported)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Effect, Exit } from "effect";
import { minimaxAdapter } from "./minimax";

describe("minimaxAdapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Happy path — 200 OK returns PlanQuota
  // -------------------------------------------------------------------------
  it("fetches plan_quota on 200 OK", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          remaining_credit: 1_200_000,
          total_credit: 5_000_000,
          expires_at: "2026-12-31T23:59:59Z",
        }),
    };
    vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

    const result = await Effect.runPromise(minimaxAdapter.fetchPlanQuota("test-key"));

    expect(result).toEqual({
      remaining: 1_200_000,
      total: 5_000_000,
      expires_at: "2026-12-31T23:59:59Z",
    });
    expect(global.fetch).toHaveBeenCalledWith("https://api.minimaxi.com/anthropic/v1/quota/plan", {
      headers: { Authorization: "Bearer test-key" },
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Auth error — 401 returns Auth error
  // -------------------------------------------------------------------------
  it("returns Auth error on 401", async () => {
    const mockResponse = {
      ok: false,
      status: 401,
    };
    vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

    const exit = await Effect.runPromiseExit(minimaxAdapter.fetchPlanQuota("bad-key"));

    expect(Exit.isFailure(exit)).toBe(true);
    if (exit._tag === "Failure") {
      const cause = exit.cause;
      if (cause._tag === "Fail") {
        expect(cause.error).toMatchObject({ kind: "Auth" });
      }
    }
  });

  // -------------------------------------------------------------------------
  // Scenario 3: 5xx upstream error — returns Upstream error
  // -------------------------------------------------------------------------
  it("returns Upstream error on 503", async () => {
    const mockResponse = {
      ok: false,
      status: 503,
    };
    vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

    const exit = await Effect.runPromiseExit(minimaxAdapter.fetchPlanQuota("any-key"));

    expect(Exit.isFailure(exit)).toBe(true);
    if (exit._tag === "Failure") {
      const cause = exit.cause;
      if (cause._tag === "Fail") {
        expect(cause.error).toMatchObject({ kind: "Upstream" });
      }
    }
  });

  // -------------------------------------------------------------------------
  // Scenario 4: fetchBalance — returns Upstream error (not yet supported)
  // -------------------------------------------------------------------------
  it("fetchBalance returns Upstream error (MiniMax balance endpoint not yet public)", async () => {
    const exit = await Effect.runPromiseExit(minimaxAdapter.fetchBalance("any-key"));

    expect(Exit.isFailure(exit)).toBe(true);
    if (exit._tag === "Failure") {
      const cause = exit.cause;
      if (cause._tag === "Fail") {
        expect(cause.error).toMatchObject({
          kind: "Upstream",
          message: "MiniMax balance endpoint not yet public",
        });
      }
    }
  });
});
