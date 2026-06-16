//! DeepSeek billing adapter tests.
//!
//! 6 QA scenarios:
//! 1. Happy path (200 OK) — returns Balance
//! 2. Auth error (401) — returns Auth error
//! 3. 5xx upstream error — returns Upstream error
//! 4. Malformed JSON — returns Parse error
//! 5. Network error (fetch throws) — returns Network error
//! 6. fetchPlanQuota() — returns Upstream error (unsupported)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Effect, Exit } from "effect";
import { deepseekAdapter } from "./deepseek";

describe("deepseekAdapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Happy path — 200 OK returns Balance
  // -------------------------------------------------------------------------
  it("fetches balance on 200 OK", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          balance_infos: [{ currency: "USD", balance: 100.5 }],
        }),
    } as unknown as Response;
    vi.spyOn(global, "fetch").mockResolvedValue(mockResponse);

    const result = await Effect.runPromise(deepseekAdapter.fetchBalance("test-key"));

    expect(result).toEqual({ amount: 100.5, currency: "USD" });
    expect(global.fetch).toHaveBeenCalledWith("https://api.deepseek.com/user/balance", {
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
    } as unknown as Response;
    vi.spyOn(global, "fetch").mockResolvedValue(mockResponse);

    const exit = await Effect.runPromiseExit(deepseekAdapter.fetchBalance("bad-key"));

    const error = Exit.match(exit, {
      onFailure: (cause) => (cause as { error: { kind: string } }).error,
      onSuccess: () => null,
    });
    expect(error).toMatchObject({ kind: "Auth" });
  });

  // -------------------------------------------------------------------------
  // Scenario 3: 5xx upstream error — returns Upstream error
  // -------------------------------------------------------------------------
  it("returns Upstream error on 5xx", async () => {
    const mockResponse = {
      ok: false,
      status: 502,
    } as unknown as Response;
    vi.spyOn(global, "fetch").mockResolvedValue(mockResponse);

    const exit = await Effect.runPromiseExit(deepseekAdapter.fetchBalance("any-key"));

    const error = Exit.match(exit, {
      onFailure: (cause) => (cause as { error: { kind: string } }).error,
      onSuccess: () => null,
    });
    expect(error).toMatchObject({ kind: "Upstream" });
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Malformed JSON — returns Parse error
  // -------------------------------------------------------------------------
  it("returns Parse error on malformed JSON", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    } as unknown as Response;
    vi.spyOn(global, "fetch").mockResolvedValue(mockResponse);

    const exit = await Effect.runPromiseExit(deepseekAdapter.fetchBalance("any-key"));

    const error = Exit.match(exit, {
      onFailure: (cause) => (cause as { error: { kind: string } }).error,
      onSuccess: () => null,
    });
    expect(error).toMatchObject({ kind: "Parse" });
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Network error — fetch throws TypeError
  // -------------------------------------------------------------------------
  it("returns Network error when fetch throws", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    const exit = await Effect.runPromiseExit(deepseekAdapter.fetchBalance("any-key"));

    const error = Exit.match(exit, {
      onFailure: (cause) => (cause as { error: { kind: string } }).error,
      onSuccess: () => null,
    });
    expect(error).toMatchObject({ kind: "Network" });
  });

  // -------------------------------------------------------------------------
  // Scenario 6: fetchPlanQuota — returns Upstream error (unsupported)
  // -------------------------------------------------------------------------
  it("fetchPlanQuota returns Upstream error (DeepSeek has no plan_quota)", async () => {
    const exit = await Effect.runPromiseExit(deepseekAdapter.fetchPlanQuota("any-key"));

    expect(Exit.isFailure(exit)).toBe(true);
    if (exit._tag === "Failure") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cause = exit.cause as any;
      expect(cause.error).toMatchObject({
        kind: "Upstream",
        message: "DeepSeek does not support plan_quota",
      });
    }
  });
});
