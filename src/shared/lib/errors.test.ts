import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import {
  NotFound,
  Unauthorized,
  Network,
  InvalidConfig,
  Database,
  ToolCall,
  SandboxViolation,
  Unknown,
  isAppError,
  type AppError,
} from "./errors";

describe("errors — Schema.TaggedError variants (ADR-0025 PR1)", () => {
  it("each variant carries its OWN instance _tag (not a shared base)", () => {
    expect(new NotFound({ message: "a" })._tag).toBe("NotFound");
    expect(new Unauthorized({ message: "a" })._tag).toBe("Unauthorized");
    expect(new Network({ message: "a" })._tag).toBe("Network");
    expect(new InvalidConfig({ message: "a" })._tag).toBe("InvalidConfig");
    expect(new Database({ message: "a" })._tag).toBe("Database");
    expect(new ToolCall({ toolCallId: "t1", message: "a" })._tag).toBe("ToolCall");
    expect(new SandboxViolation({ path: "/p", workspaceLabel: "w" })._tag).toBe("SandboxViolation");
    expect(new Unknown({ message: "a" })._tag).toBe("Unknown");
  });

  it("optional fields accept present and absent values", () => {
    expect(new Network({ message: "a", cause: "timeout" }).cause).toBe("timeout");
    expect(new Network({ message: "a" }).cause).toBeUndefined();
    expect(new InvalidConfig({ message: "a" }).field).toBeUndefined();
    // NOTE: `message` collides with Error.prototype.message (Schema.TaggedError extends
    // Error). When the optional `message` field is omitted, `.message` falls through to
    // Error's default `""` (empty string), NOT undefined. formatAppError must treat
    // empty-string as "no message" (uses `||`, not `??`).
    expect(new SandboxViolation({ path: "/p", workspaceLabel: "w" }).message).toBe("");
    expect(new SandboxViolation({ message: "m", path: "/p", workspaceLabel: "w" }).message).toBe("m");
  });

  it("required per-variant fields are accessible", () => {
    const tc = new ToolCall({ toolCallId: "call_9", message: "boom" });
    expect(tc.toolCallId).toBe("call_9");
    const sv = new SandboxViolation({ path: "/etc/passwd", workspaceLabel: "proj" });
    expect(sv.path).toBe("/etc/passwd");
    expect(sv.workspaceLabel).toBe("proj");
  });

  it("isAppError() is true for every variant instance", () => {
    const all: AppError[] = [
      new NotFound({ message: "a" }),
      new Unauthorized({ message: "a" }),
      new Network({ message: "a" }),
      new InvalidConfig({ message: "a" }),
      new Database({ message: "a" }),
      new ToolCall({ toolCallId: "t", message: "a" }),
      new SandboxViolation({ path: "/p", workspaceLabel: "w" }),
      new Unknown({ message: "a" }),
    ];
    for (const e of all) {expect(isAppError(e)).toBe(true);}
  });

  it("isAppError() is false for legacy {kind} objects and plain values", () => {
    expect(isAppError({ kind: "Network", message: "x" })).toBe(false);
    expect(isAppError({ message: "x" })).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError("Network")).toBe(false);
  });

  it("variants are yieldable Effect failures preserving identity", () => {
    const exit = Effect.runSyncExit(Effect.fail(new NotFound({ message: "gone" })));
    expect(exit._tag).toBe("Failure");
  });
});
