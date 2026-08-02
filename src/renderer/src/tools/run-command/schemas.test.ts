import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import { RunCommandParamsSchema } from "@codeman-frontend/tools/run-command/schemas";

describe("RunCommandParamsSchema", () => {
  it("rejects empty command", () => {
    expect(() => Schema.decodeUnknownSync(RunCommandParamsSchema)({ command: "" })).toThrow();
  });
});
