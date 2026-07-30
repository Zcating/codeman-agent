import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import type { Static } from "@sinclair/typebox";
import { toToolParameters } from "@codeman-frontend/shared/lib/tool-schema";

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