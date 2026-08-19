import { describe, it, expect } from "vitest";
import { FilePathSchema, type FilePath } from "@codeman-frontend/tools/file-ops";

describe("FilePathSchema (ADR-0025 PR 4)", () => {
  it("accepts absolute paths without traversal", () => {
    const p: FilePath = FilePathSchema.make("/workspace/foo/bar.txt");
    expect(p).toBe("/workspace/foo/bar.txt");
  });

  it("rejects paths containing '..' (component-level traversal guard)", () => {
    expect(() => FilePathSchema.make("/workspace/../etc/passwd")).toThrow();
    expect(() => FilePathSchema.make("../escape")).toThrow();
    expect(() => FilePathSchema.make("/foo/../bar")).toThrow();
  });

  it("type guard: FilePath is distinct from string at compile time", () => {
    const p: FilePath = FilePathSchema.make("/abs/path");
    const s: string = p;
    expect(typeof s).toBe("string");
  });
});

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
    expect(() => FilePathSchema.make("foo\\..\\bar")).toThrow();
  });

  it("accepts plain paths without '..'", () => {
    expect(() => FilePathSchema.make("/usr/local/bin")).not.toThrow();
    expect(() => FilePathSchema.make("file.txt")).not.toThrow();
    expect(() => FilePathSchema.make("a/b/c")).not.toThrow();
  });
});
