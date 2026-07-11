import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import * as JsonSchema from "effect/JSONSchema";
import { toToolParameters } from "./tool-schema";

describe("toToolParameters (ADR-0025 PR 3)", () => {
  it("returns Schema.toJsonSchema output as TSchema-compatible", () => {
    const S = Schema.Struct({
      workspace_id: Schema.optional(Schema.String),
      path: Schema.String,
    });
    const out = toToolParameters(S);
    // Runtime: same JSON-Schema object as JsonSchema.fromAST
    expect(out).toEqual(JsonSchema.fromAST(S.ast, { definitions: {} }));
    // Cast to `unknown` then assert structure keys
    const json = out as unknown as Record<string, unknown>;
    expect(json["type"]).toBe("object");
    expect(json["properties"]).toBeDefined();
    expect((json["properties"] as Record<string, unknown>)["path"]).toEqual({ type: "string" });
  });

  it("preserves optional fields in JSON Schema", () => {
    const S = Schema.Struct({
      workspace_id: Schema.optional(Schema.String),
      path: Schema.String,
    });
    const json = toToolParameters(S) as unknown as Record<string, unknown>;
    // Schema.toJsonSchema marks optional fields with a wrapper; we don't assert the
    // exact shape, only that the property is enumerable.
    const props = json["properties"] as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(["path", "workspace_id"]);
  });

  it("handles boolean fields", () => {
    const S = Schema.Struct({
      workspace_id: Schema.optional(Schema.String),
      old_text: Schema.String,
      new_text: Schema.String,
      replace_all: Schema.Boolean,
    });
    const json = toToolParameters(S) as unknown as Record<string, unknown>;
    const props = json["properties"] as Record<string, unknown>;
    expect(props["replace_all"]).toEqual({ type: "boolean" });
  });
});

// Task 5 (ADR-0025.1 D-C / Phase-3 review Spec Deviation #3):
// `toToolParameters` uses `JsonSchema.fromAST` (NOT `Schema.toJsonSchema`).
// These parity tests capture the current output shape as a regression guard
// against future helper-body refactors.
describe("toToolParameters — ADR-0025.1 D-C parity guard", () => {
  it("emits type=object JSON Schema for a Struct with a required string field", () => {
    const S = Schema.Struct({ path: Schema.String });
    const json = toToolParameters(S) as unknown as Record<string, unknown>;
    expect(json["type"]).toBe("object");
    const props = json["properties"] as Record<string, unknown>;
    expect(props["path"]).toEqual({ type: "string" });
  });

  it("preserves optional fields as non-required (workspace_id is optional)", () => {
    const S = Schema.Struct({
      workspace_id: Schema.optional(Schema.String),
      path: Schema.String,
    });
    const json = toToolParameters(S) as unknown as { required?: string[] };
    expect(json.required ?? []).not.toContain("workspace_id");
    expect(json.required ?? []).toContain("path");
  });
});
