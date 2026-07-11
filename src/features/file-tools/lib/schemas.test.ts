import { describe, it, expect } from "vitest";
import { FilePathSchema, type FilePath } from "./schemas";

describe("FilePathSchema (ADR-0025 PR 4)", () => {
  it("accepts absolute paths without traversal", () => {
    const p: FilePath = FilePathSchema.make("/workspace/foo/bar.txt");
    expect(p).toBe("/workspace/foo/bar.txt");
  });

  it("rejects paths containing '..' (component-level traversal guard)", () => {
    expect(() => FilePathSchema.make("/workspace/../etc/passwd")).toThrow();
    expect(() => FilePathSchema.make("../escape")).toThrow();
    expect(() => FilePathSchema.make("/foo/../bar")).toThrow();
    // Note: /foo/..bar/baz contains ".." as substring but is NOT a traversal;
    // the guard rejects '..' only when it's a whole path component (Phase-3 J4).
  });

  it("type guard: FilePath is distinct from string at compile time", () => {
    const p: FilePath = FilePathSchema.make("/abs/path");
    const s: string = p; // OK
    expect(typeof s).toBe("string");
    // Reverse (string → FilePath without make()) would be compile error.
  });
});

// Task 6 (Phase-3 review J4): FilePath refinement should be component-level,
// not substring. The substring filter `!s.includes("..")` over-rejects
// legitimate filenames like `/foo/..bar/baz` and `...weird.txt`.
// Component-level split: `/a/../etc` rejected, `/foo/..bar/baz` accepted.
describe("FilePathSchema — component-level traversal guard (Phase-3 review J4)", () => {
  it("accepts legitimate names that contain '..' as substring", () => {
    expect(() => FilePathSchema.make("/foo/..bar/baz")).not.toThrow();
    expect(() => FilePathSchema.make("...weird.txt")).not.toThrow();
    expect(() => FilePathSchema.make("/home/user/..hidden")).not.toThrow();
  });

  it("rejects '..' when it appears as a whole path component", () => {
    expect(() => FilePathSchema.make("/foo/../etc/passwd")).toThrow();
    expect(() => FilePathSchema.make("../etc/passwd")).toThrow();
    expect(() => FilePathSchema.make("foo/..")).toThrow();
    expect(() => FilePathSchema.make("/a/b/..")).toThrow();
    // Backslash separator (Windows) — also a path component
    expect(() => FilePathSchema.make("foo\\..\\bar")).toThrow();
  });

  it("accepts plain paths without '..'", () => {
    expect(() => FilePathSchema.make("/usr/local/bin")).not.toThrow();
    expect(() => FilePathSchema.make("file.txt")).not.toThrow();
    expect(() => FilePathSchema.make("a/b/c")).not.toThrow();
  });
});
