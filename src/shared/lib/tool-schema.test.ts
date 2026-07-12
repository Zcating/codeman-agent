import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import * as JsonSchema from "effect/JSONSchema";
import type { Static } from "@sinclair/typebox";
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

// Task 6 (ADR-0025 PR 5 / D8-A through D8-D):
// Type-layer regression. `toToolParameters` must return a `SchemaToTypeBox<S>`
// (a Type.Object<...> brand) so that `Static<typeof toToolParameters(S)>`
// correctly infers the schema's value shape. This replaces the prior
// `as unknown as TSchema` cast with a narrow type that preserves type
// information end-to-end (Static<TParameters> at the AgentTool.execute site).
//
// `AssertEqual` is a dep-free TypeScript conditional check: if the two types
// are structurally identical the assignment compiles; otherwise tsc reports
// `Type 'false' is not assignable to type 'true'`. This is the RED signal
// during type-layer TDD — there is no runtime test for type correctness.
describe("toToolParameters — ADR-0025 PR 5 type layer", () => {
  type AssertEqual<A, B> =
    (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
      ? true
      : false;

  it("infers { a: string } for Struct({ a: Schema.String })", () => {
    const S = Schema.Struct({ a: Schema.String });
    const result = toToolParameters(S);
    type T = Static<typeof result>;
    const _t: AssertEqual<T, { a: string }> = true;
    expect(_t).toBe(true);
  });

  it("infers { a?: string } for Struct({ a: Schema.optional(Schema.String) })", () => {
    const S = Schema.Struct({ a: Schema.optional(Schema.String) });
    const result = toToolParameters(S);
    type T = Static<typeof result>;
    const _t: AssertEqual<T, { a?: string }> = true;
    expect(_t).toBe(true);
  });

  it("infers { a: number, b: boolean } for Number + Boolean leaves", () => {
    const S = Schema.Struct({
      a: Schema.Number,
      b: Schema.Boolean,
    });
    const result = toToolParameters(S);
    type T = Static<typeof result>;
    const _t: AssertEqual<T, { a: number; b: boolean }> = true;
    expect(_t).toBe(true);
  });

  it("infers { a: string[] } for Array(Schema.String)", () => {
    const S = Schema.Struct({ a: Schema.Array(Schema.String) });
    const result = toToolParameters(S);
    type T = Static<typeof result>;
    const _t: AssertEqual<T, { a: string[] }> = true;
    expect(_t).toBe(true);
  });

  it("mirrors readFile / deleteFile shape: { workspace_id?: string; path: string }", () => {
    const S = Schema.Struct({
      workspace_id: Schema.optional(Schema.String),
      path: Schema.String,
    });
    const result = toToolParameters(S);
    type T = Static<typeof result>;
    const _t: AssertEqual<T, { workspace_id?: string; path: string }> = true;
    expect(_t).toBe(true);
  });

  it("mirrors writeFile shape: { workspace_id?: string; path: string; content: string }", () => {
    const S = Schema.Struct({
      workspace_id: Schema.optional(Schema.String),
      path: Schema.String,
      content: Schema.String,
    });
    const result = toToolParameters(S);
    type T = Static<typeof result>;
    const _t: AssertEqual<T, { workspace_id?: string; path: string; content: string }> = true;
    expect(_t).toBe(true);
  });

  it("mirrors editFile shape with replace_all: boolean", () => {
    const S = Schema.Struct({
      workspace_id: Schema.optional(Schema.String),
      path: Schema.String,
      old_text: Schema.String,
      new_text: Schema.String,
      replace_all: Schema.Boolean,
    });
    const result = toToolParameters(S);
    type T = Static<typeof result>;
    const _t: AssertEqual<
      T,
      {
        workspace_id?: string;
        path: string;
        old_text: string;
        new_text: string;
        replace_all: boolean;
      }
    > = true;
    expect(_t).toBe(true);
  });

  it("mirrors searchFiles shape with two optional fields", () => {
    const S = Schema.Struct({
      workspace_id: Schema.optional(Schema.String),
      glob: Schema.String,
      content_pattern: Schema.optional(Schema.String),
    });
    const result = toToolParameters(S);
    type T = Static<typeof result>;
    const _t: AssertEqual<
      T,
      { workspace_id?: string; glob: string; content_pattern?: string }
    > = true;
    expect(_t).toBe(true);
  });
});