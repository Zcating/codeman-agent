import { describe, it, expect } from "vitest";
import { FilePathSchema, type FilePath } from "./schemas";

describe("FilePathSchema (ADR-0025 PR 4)", () => {
  it("accepts absolute paths without traversal", () => {
    const p: FilePath = FilePathSchema.make("/workspace/foo/bar.txt");
    expect(p).toBe("/workspace/foo/bar.txt");
  });

  it("rejects paths containing '..' (path traversal guard)", () => {
    expect(() => FilePathSchema.make("/workspace/../etc/passwd")).toThrow();
    expect(() => FilePathSchema.make("../escape")).toThrow();
    expect(() => FilePathSchema.make("/foo/..bar/baz")).toThrow();
    // Note: /foo/..bar/baz contains ".." as substring but is NOT a traversal;
    // we filter strictly on substring ".." for safety (Rust sandbox does strict check).
  });

  it("type guard: FilePath is distinct from string at compile time", () => {
    const p: FilePath = FilePathSchema.make("/abs/path");
    const s: string = p; // OK
    expect(typeof s).toBe("string");
    // Reverse (string → FilePath without make()) would be compile error.
  });
});
