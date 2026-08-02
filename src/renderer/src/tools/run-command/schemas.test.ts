import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import { RunCommandParamsSchema } from "@codeman-frontend/tools/run-command/schemas";

describe("RunCommandParamsSchema", () => {
  it("rejects empty command", () => {
    expect(() => Schema.decodeUnknownSync(RunCommandParamsSchema)({ command: "" })).toThrow();
  });

  it("rejects timeoutMs over 1800000", () => {
    expect(() =>
      Schema.decodeUnknownSync(RunCommandParamsSchema)({ command: "git status", timeoutMs: 1_800_001 })
    ).toThrow();
  });
});
