import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import type { Static } from "@sinclair/typebox";
import { toToolParameters } from "@codeman-frontend/shared/lib/tool-schema";

// Mirrors pi-mono's TYPEBOX_KIND constant in
// @earendil-works/pi-ai/dist/utils/validation.js (line 13).
// Same Symbol.for key ensures the runtime product is recognized by
// pi-mono's hasTypeBoxMetadata() check, routing through Value.Convert.
const TYPEBOX_KIND = Symbol.for("TypeBox.Kind");

describe("toToolParameters — JSON Schema field shape (walker produces real TypeBox)", () => {
  it("emits type=object with properties + path field of type string", () => {
    const S = Schema.Struct({
      workspaceId: Schema.optional(Schema.String),
      path: Schema.String,
    });
    const json = toToolParameters(S) as unknown as Record<string, unknown>;
    expect(json["type"]).toBe("object");
    expect(json["properties"]).toBeDefined();
    const props = json["properties"] as Record<string, unknown>;
    expect((props["path"] as Record<string, unknown>)["type"]).toBe("string");
  });

  it("preserves optional fields in properties map", () => {
    const S = Schema.Struct({
      workspaceId: Schema.optional(Schema.String),
      path: Schema.String,
    });
    const json = toToolParameters(S) as unknown as Record<string, unknown>;
    const props = json["properties"] as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(["path", "workspaceId"]);
  });

  it("handles boolean fields", () => {
    const S = Schema.Struct({
      workspaceId: Schema.optional(Schema.String),
      oldText: Schema.String,
      newText: Schema.String,
      replaceAll: Schema.Boolean,
    });
    const json = toToolParameters(S) as unknown as Record<string, unknown>;
    const props = json["properties"] as Record<string, unknown>;
    expect((props["replaceAll"] as Record<string, unknown>)["type"]).toBe(
      "boolean",
    );
  });
});

// ADR-0025.1 D-C parity guard: TypeBox's Type.Object auto-computes `required`
// from the `[OptionalKind]` symbol on each property — required keys = those
// whose value is NOT Type.Optional(...). These tests assert that contract.
describe("toToolParameters — required array auto-computation (Type.Optional marker)", () => {
  it("emits type=object JSON Schema for a Struct with a required string field", () => {
    const S = Schema.Struct({ path: Schema.String });
    const json = toToolParameters(S) as unknown as Record<string, unknown>;
    expect(json["type"]).toBe("object");
    const props = json["properties"] as Record<string, unknown>;
    expect((props["path"] as Record<string, unknown>)["type"]).toBe("string");
  });

  it("preserves optional fields as non-required (workspaceId is optional)", () => {
    const S = Schema.Struct({
      workspaceId: Schema.optional(Schema.String),
      path: Schema.String,
    });
    const json = toToolParameters(S) as unknown as { required?: string[] };
    expect(json.required ?? []).not.toContain("workspaceId");
    expect(json.required ?? []).toContain("path");
  });
});

// Symbol presence tests — mirrors pi-mono's hasTypeBoxMetadata() check in
// @earendil-works/pi-ai/dist/utils/validation.js:
//   const TYPEBOX_KIND = Symbol.for("TypeBox.Kind");
//   function hasTypeBoxMetadata(schema) {
//     return Object.getOwnPropertySymbols(schema).includes(TYPEBOX_KIND);
//   }
// When the check returns true, pi-mono routes through TypeBox's Value.Convert
// + Compile; otherwise it falls back to a custom JSON-Schema coercion path.
// These tests verify the walker output carries TypeBox metadata so pi-mono
// takes the TypeBox path.
describe("toToolParameters — Symbol presence (pi-mono hasTypeBoxMetadata)", () => {
  it("top-level output has [Kind] symbol", () => {
    const S = Schema.Struct({ path: Schema.String });
    const out = toToolParameters(S);
    expect(Object.getOwnPropertySymbols(out).includes(TYPEBOX_KIND)).toBe(
      true,
    );
  });

  it("primitive String leaf has [Kind] symbol", () => {
    const S = Schema.Struct({ path: Schema.String });
    const out = toToolParameters(S) as unknown as {
      properties: Record<string, unknown>;
    };
    expect(
      Object.getOwnPropertySymbols(out.properties.path).includes(TYPEBOX_KIND),
    ).toBe(true);
  });

  it("Boolean leaf has [Kind] symbol", () => {
    const S = Schema.Struct({ replaceAll: Schema.Boolean });
    const out = toToolParameters(S) as unknown as {
      properties: Record<string, unknown>;
    };
    expect(
      Object.getOwnPropertySymbols(out.properties.replaceAll).includes(
        TYPEBOX_KIND,
      ),
    ).toBe(true);
  });

  it("optional String property has [Kind] symbol (Type.Optional wraps it)", () => {
    const S = Schema.Struct({
      workspaceId: Schema.optional(Schema.String),
      path: Schema.String,
    });
    const out = toToolParameters(S) as unknown as {
      properties: Record<string, unknown>;
    };
    expect(
      Object.getOwnPropertySymbols(out.properties.workspaceId).includes(
        TYPEBOX_KIND,
      ),
    ).toBe(true);
  });

  it("Array(Schema.String) leaf has [Kind] symbol", () => {
    const S = Schema.Struct({ tags: Schema.Array(Schema.String) });
    const out = toToolParameters(S) as unknown as {
      properties: Record<string, unknown>;
    };
    expect(
      Object.getOwnPropertySymbols(out.properties.tags).includes(TYPEBOX_KIND),
    ).toBe(true);
  });
});

// Type-layer regression (ADR-0025 PR 5 / D8-A through D8-D):
// `toToolParameters` must return a `SchemaToTypeBox<S>` (a Type.Object<...>
// brand) so that `Static<typeof toToolParameters(S)>` correctly infers the
// schema's value shape. The walker preserves this — the runtime output's
// TS-compile-time brand is the same TObject<ShapeToTypeBox<valueShape>> the
// conditional type declares.
//
// `AssertEqual` is a dep-free TypeScript conditional check: if the two types
// are structurally identical the assignment compiles; otherwise tsc reports
// `Type 'false' is not assignable to type 'true'`. This is the RED signal
// during type-layer TDD — there is no runtime test for type correctness.
describe("toToolParameters — type layer (AssertEqual<Static<typeof out>, ...>)", () => {
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

  it("mirrors readFile / deleteFile shape: { workspaceId?: string; path: string }", () => {
    const S = Schema.Struct({
      workspaceId: Schema.optional(Schema.String),
      path: Schema.String,
    });
    const result = toToolParameters(S);
    type T = Static<typeof result>;
    const _t: AssertEqual<T, { workspaceId?: string; path: string }> = true;
    expect(_t).toBe(true);
  });

  it("mirrors writeFile shape: { workspaceId?: string; path: string; content: string }", () => {
    const S = Schema.Struct({
      workspaceId: Schema.optional(Schema.String),
      path: Schema.String,
      content: Schema.String,
    });
    const result = toToolParameters(S);
    type T = Static<typeof result>;
    const _t: AssertEqual<
      T,
      { workspaceId?: string; path: string; content: string }
    > = true;
    expect(_t).toBe(true);
  });

  it("mirrors editFile shape with replaceAll: boolean", () => {
    const S = Schema.Struct({
      workspaceId: Schema.optional(Schema.String),
      path: Schema.String,
      oldText: Schema.String,
      newText: Schema.String,
      replaceAll: Schema.Boolean,
    });
    const result = toToolParameters(S);
    type T = Static<typeof result>;
    const _t: AssertEqual<
      T,
      {
        workspaceId?: string;
        path: string;
        oldText: string;
        newText: string;
        replaceAll: boolean;
      }
    > = true;
    expect(_t).toBe(true);
  });

  it("mirrors searchFiles shape with two optional fields", () => {
    const S = Schema.Struct({
      workspaceId: Schema.optional(Schema.String),
      glob: Schema.String,
      contentPattern: Schema.optional(Schema.String),
    });
    const result = toToolParameters(S);
    type T = Static<typeof result>;
    const _t: AssertEqual<
      T,
      { workspaceId?: string; glob: string; contentPattern?: string }
    > = true;
    expect(_t).toBe(true);
  });
});