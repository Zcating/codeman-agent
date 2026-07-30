import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import { WebfetchParamsSchema } from "@codeman-frontend/tools/webfetch/schemas";

describe("WebfetchParamsSchema", () => {
  it("decodes https://example.com", () => {
    const v = Schema.decodeUnknownSync(WebfetchParamsSchema)({ url: "https://example.com" });
    expect(v.url).toBe("https://example.com");
  });

  it("decodes http://example.com:8080/path?q=1", () => {
    const v = Schema.decodeUnknownSync(WebfetchParamsSchema)({ url: "http://example.com:8080/path?q=1" });
    expect(v.url).toBe("http://example.com:8080/path?q=1");
  });

  it("rejects ftp://x with URL pattern message", () => {
    expect(() => Schema.decodeUnknownSync(WebfetchParamsSchema)({ url: "ftp://x" })).toThrow(
      "URL must start with http:// or https://",
    );
  });

  it("accepts format: text, markdown, html", () => {
    for (const f of ["text", "markdown", "html"] as const) {
      const v = Schema.decodeUnknownSync(WebfetchParamsSchema)({ url: "https://x.com", format: f });
      expect(v.format).toBe(f);
    }
  });

  it("rejects format: json", () => {
    expect(() =>
      Schema.decodeUnknownSync(WebfetchParamsSchema)({ url: "https://x.com", format: "json" })
    ).toThrow();
  });

  it("accepts missing format", () => {
    const v = Schema.decodeUnknownSync(WebfetchParamsSchema)({ url: "https://x.com" });
    expect(v.format).toBeUndefined();
  });

  it("accepts timeout: 5 (lower bound)", () => {
    const v = Schema.decodeUnknownSync(WebfetchParamsSchema)({ url: "https://x.com", timeout: 5 });
    expect(v.timeout).toBe(5);
  });

  it("accepts timeout: 120 (upper bound)", () => {
    const v = Schema.decodeUnknownSync(WebfetchParamsSchema)({ url: "https://x.com", timeout: 120 });
    expect(v.timeout).toBe(120);
  });

  it("rejects timeout: 200 (exceeds 120)", () => {
    expect(() =>
      Schema.decodeUnknownSync(WebfetchParamsSchema)({ url: "https://x.com", timeout: 200 })
    ).toThrow();
  });

  it("rejects timeout: 0 (below 5)", () => {
    expect(() =>
      Schema.decodeUnknownSync(WebfetchParamsSchema)({ url: "https://x.com", timeout: 0 })
    ).toThrow();
  });

  it("rejects timeout: 30.5 (non-integer)", () => {
    expect(() =>
      Schema.decodeUnknownSync(WebfetchParamsSchema)({ url: "https://x.com", timeout: 30.5 })
    ).toThrow();
  });
});
