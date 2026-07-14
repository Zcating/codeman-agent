// Smoke test for effect-schema-adapter
import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import { effectSchema, firstErrorMessage } from "./effect-schema-adapter";

describe("effectSchema adapter (Standard Schema V1)", () => {
  it("valid value passes", () => {
    const v = effectSchema(Schema.String);
    const r = v["~standard"].validate("hello");
    expect(r).toEqual({ value: "hello" });
  });

  it("invalid value returns Standard Schema issues with custom message", () => {
    const v = effectSchema(
      Schema.String.pipe(Schema.minLength(5, { message: "too short" as never })),
    );
    const r = v["~standard"].validate("hi");
    expect("issues" in r).toBe(true);
    if ("issues" in r && r.issues) {
      expect(r.issues.length).toBeGreaterThan(0);
      expect(r.issues[0]?.message).toBe("too short");
    }
  });

  it("non-string value returns Type issue", () => {
    const v = effectSchema(Schema.String);
    const r = v["~standard"].validate(42);
    expect("issues" in r).toBe(true);
    if ("issues" in r && r.issues) {
      // Effect's Type issue for Schema.String has no default message annotation.
      // Adapter falls back to "Invalid value (Type)"; users wanting a custom message
      // should pass `{ message: "..." }` to their schema (see test above).
      expect(r.issues[0]?.message).toBe("Invalid value (Type)");
    }
  });

  it("Struct validation flattens nested issues (errors:all)", () => {
    const v = effectSchema(
      Schema.Struct({
        name: Schema.String.pipe(
          Schema.minLength(1, { message: "name required" as never }),
        ),
        age: Schema.Number,
      }),
    );
    const r = v["~standard"].validate({ name: "", age: "x" });
    expect("issues" in r).toBe(true);
    if ("issues" in r && r.issues) {
      // 两个 field 各一个 issue
      expect(r.issues.length).toBe(2);
      const paths = r.issues.map((i) => i.path?.join("."));
      expect(paths).toContain("name");
      expect(paths).toContain("age");
    }
  });

  it("exposes spec-required `~standard` brand with version 1 and vendor 'effect'", () => {
    const v = effectSchema(Schema.String);
    expect(v["~standard"].version).toBe(1);
    expect(v["~standard"].vendor).toBe("effect");
    expect(typeof v["~standard"].validate).toBe("function");
  });
});

describe("firstErrorMessage", () => {
  it("returns undefined for empty array", () => {
    expect(firstErrorMessage([])).toBeUndefined();
  });

  it("returns plain string error as-is", () => {
    expect(firstErrorMessage(["too short"])).toBe("too short");
  });

  it("extracts .message from { message: string } object", () => {
    expect(firstErrorMessage([{ message: "bad url" }])).toBe("bad url");
  });

  it("returns undefined for non-string, non-message-object shapes", () => {
    expect(firstErrorMessage([42, null, { foo: "bar" }])).toBeUndefined();
  });
});
