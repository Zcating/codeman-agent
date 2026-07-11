import { describe, it, expect } from "vitest";
import { Cause, Effect } from "effect";
import { formatAppError } from "./format-app-error";
import type { AppError } from "./errors";
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

describe("formatAppError — Schema.TaggedError instances only (ADR-0025 PR 2)", () => {
  const fmt = (e: AppError) => {
    const exit = Effect.runSyncExit(Effect.fail(e));
    if (exit._tag !== "Failure") throw new Error("expected failure");
    return formatAppError(exit.cause);
  };

  it("Network instance → 'Network: boom'", () => {
    expect(fmt(new NetworkErr({ message: "boom", cause: "timeout" }))).toBe("Network: boom");
  });
  it("Unauthorized instance → 'Unauthorized: nope'", () => {
    expect(fmt(new Unauthorized({ message: "nope" }))).toBe("Unauthorized: nope");
  });
  it("InvalidConfig instance → 'InvalidConfig: bad'", () => {
    expect(fmt(new InvalidConfig({ message: "bad", field: "base_url" }))).toBe("InvalidConfig: bad");
  });
  it("ToolCall instance → 'ToolCall: failed'", () => {
    expect(fmt(new ToolCall({ tool_call_id: "call_1", message: "failed" }))).toBe("ToolCall: failed");
  });
  it("multiple failures joined with '; '", () => {
    const c1 = Cause.fail<AppError>(new NetworkErr({ message: "first", cause: "timeout" }));
    const c2 = Cause.fail<AppError>(new Unauthorized({ message: "second" }));
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
