import { describe, it, expect } from "vitest";
import { Cause, Effect } from "effect";
import { formatAppError } from "@codeman-frontend/shared/lib/format-app-error";
import type { AppError } from "@codeman-frontend/shared/lib/errors";
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
} from "@codeman-frontend/shared/lib/errors";
import { TauriError } from "@codeman-frontend/shared/apis";

describe("formatAppError — Schema.TaggedError instances only (ADR-0025 PR 2)", () => {
  const fmt = (e: AppError) => {
    const exit = Effect.runSyncExit(Effect.fail(e));
    if (exit._tag !== "Failure") { throw new Error("expected failure"); }
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
    expect(fmt(new ToolCall({ toolCallId: "call_1", message: "failed" }))).toBe("ToolCall: failed");
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
  it("NotFound instance → 'NotFound: gone'", () => {
    expect(fmt(new NotFound({ message: "gone" }))).toBe("NotFound: gone");
  });
  it("Database instance → 'Database: locked'", () => {
    expect(fmt(new Database({ message: "locked" }))).toBe("Database: locked");
  });
  it("SandboxViolation instance → 'SandboxViolation: outside'", () => {
    expect(fmt(new SandboxViolation({ message: "outside", path: "/p", workspaceLabel: "w" }))).toBe(
      "SandboxViolation: outside",
    );
  });
  it("Unknown instance → 'Unknown: ???'", () => {
    expect(fmt(new UnknownErr({ message: "???" }))).toBe("Unknown: ???");
  });
});

describe("formatAppError — new Schema.TaggedError instances (ADR-0025 PR1)", () => {
  const fmt = (e: NewAppError) => {
    const exit = Effect.runSyncExit(Effect.fail(e));
    if (exit._tag !== "Failure") { throw new Error("expected failure"); }
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
    expect(fmt(new ToolCall({ toolCallId: "call_1", message: "failed" }))).toBe("ToolCall: failed");
  });
  it("SandboxViolation without message → 'SandboxViolation: (no message)'", () => {
    expect(fmt(new SandboxViolation({ path: "/etc/passwd", workspaceLabel: "proj" }))).toBe(
      "SandboxViolation: (no message)",
    );
  });
  it("SandboxViolation with message → 'SandboxViolation: outside'", () => {
    expect(fmt(new SandboxViolation({ message: "outside", path: "/p", workspaceLabel: "w" }))).toBe(
      "SandboxViolation: outside",
    );
  });
  it("Unknown instance → 'Unknown: ???'", () => {
    expect(fmt(new UnknownErr({ message: "???" }))).toBe("Unknown: ???");
  });
});

describe("formatAppError — TauriError fallback (ADR-0025 review Hard #3)", () => {
  it("TauriError falls back to 'IPC: <message>' format", () => {
    const exit = Effect.runSyncExit(Effect.fail(TauriError.IPC("connection refused")));
    if (exit._tag !== "Failure") { throw new Error("expected failure"); }
    expect(formatAppError(exit.cause)).toBe("IPC: connection refused");
  });
});
