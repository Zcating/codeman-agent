import { describe, it, expect } from "vitest";
import { Cause, Effect, Exit, FiberId } from "effect";
import { formatAppError } from "./format-app-error";
import type { AppError } from "./types";
import {
  NotFound,
  Unauthorized,
  Network as NetworkErr,
  InvalidConfig,
  Database,
  ToolCall,
  SandboxViolation,
  Unknown as UnknownErr,
  type AppError as NewAppError,
} from "./errors";

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

describe("formatAppError — new Schema.TaggedError instances (ADR-0025 PR1)", () => {
  const fmt = (e: NewAppError) => {
    const exit = Effect.runSyncExit(Effect.fail(e));
    if (exit._tag !== "Failure") throw new Error("expected failure");
    return formatAppError(exit.cause);
  };

  it("Network instance → 'Network: boom'", () => {
    expect(fmt(new NetworkErr({ message: "boom", cause: "timeout" }))).toBe("Network: boom");
  });
  it("NotFound instance → 'NotFound: gone'", () => {
    expect(fmt(new NotFound({ message: "gone" }))).toBe("NotFound: gone");
  });
  it("Unauthorized instance → 'Unauthorized: nope'", () => {
    expect(fmt(new Unauthorized({ message: "nope" }))).toBe("Unauthorized: nope");
  });
  it("InvalidConfig instance → 'InvalidConfig: bad'", () => {
    expect(fmt(new InvalidConfig({ message: "bad", field: "base_url" }))).toBe("InvalidConfig: bad");
  });
  it("Database instance → 'Database: locked'", () => {
    expect(fmt(new Database({ message: "locked" }))).toBe("Database: locked");
  });
  it("ToolCall instance → 'ToolCall: failed'", () => {
    expect(fmt(new ToolCall({ tool_call_id: "call_1", message: "failed" }))).toBe("ToolCall: failed");
  });
  it("SandboxViolation without message → 'SandboxViolation: (no message)'", () => {
    // message collides with Error.prototype.message → "" when omitted; formatter uses `||`.
    expect(fmt(new SandboxViolation({ path: "/etc/passwd", workspace_label: "proj" }))).toBe(
      "SandboxViolation: (no message)",
    );
  });
  it("SandboxViolation with message → 'SandboxViolation: outside'", () => {
    expect(fmt(new SandboxViolation({ message: "outside", path: "/p", workspace_label: "w" }))).toBe(
      "SandboxViolation: outside",
    );
  });
  it("Unknown instance → 'Unknown: ???'", () => {
    expect(fmt(new UnknownErr({ message: "???" }))).toBe("Unknown: ???");
  });
});
