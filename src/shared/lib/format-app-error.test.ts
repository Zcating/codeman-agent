import { describe, it, expect } from "vitest";
import { Cause, Effect, Exit, FiberId } from "effect";
import { formatAppError } from "./format-app-error";
import type { AppError } from "./types";

describe("formatAppError", () => {
  it("单 failure 带 kind + message 渲染 'kind: message'", () => {
    const err: AppError = { kind: "Network", message: "boom", cause: "timeout" };
    const exit = Effect.runSyncExit(Effect.fail(err));
    expect(Exit.isFailure(exit)).toBe(true);
    if (exit._tag === "Failure") {
      expect(formatAppError(exit.cause)).toBe("Network: boom");
    }
  });

  it("Cause.interrupt(fiberId) 返回 'Interrupted'", () => {
    const fiberId = FiberId.none;
    const cause = Cause.interrupt(fiberId);
    expect(formatAppError(cause)).toBe("Interrupted");
  });

  it("Cause.die(new Error('boom')) 返回 'Defect: Error: boom'", () => {
    const cause = Cause.die(new Error("boom"));
    const out = formatAppError(cause);
    expect(out).toContain("Defect:");
    expect(out).toContain("boom");
  });

  it("failure 缺 kind 字段 → 走 String(e) fallback", () => {
    // 模拟一个丢失 kind 字段的 failure（不应在生产出现，但 formatAppError 必须稳健）
    const exit = Effect.runSyncExit(
      Effect.fail({ message: "raw" } as unknown as AppError),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (exit._tag === "Failure") {
      // String({message:"raw"}) === "[object Object]" — 无 kind 时走 fallback
      const out = formatAppError(exit.cause);
      expect(out).toBe("[object Object]");
    }
  });

  it("多个 failure 用 '; ' 连接", () => {
    const c1: Cause.Cause<AppError> = Cause.fail<AppError>({
      kind: "Network",
      message: "first",
      cause: "timeout",
    });
    const c2: Cause.Cause<AppError> = Cause.fail<AppError>({
      kind: "Unauthorized",
      message: "second",
    });
    const combined = Cause.sequential(c1, c2);
    const out = formatAppError(combined);
    expect(out).toContain("Network: first");
    expect(out).toContain("Unauthorized: second");
    expect(out).toContain("; ");
  });
});
