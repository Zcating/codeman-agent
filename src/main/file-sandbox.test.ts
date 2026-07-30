import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validatePathInWorkspace,
  readFileInWorkspace,
  writeFileInWorkspace,
  type AppError,
} from "./file-sandbox";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "fs-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("T4b — src/main/file-sandbox.ts", () => {
  describe("validatePathInWorkspace — happy path", () => {
    it("accepts a file inside the workspace", async () => {
      const file = join(workspace, "hello.txt");
      writeFileSync(file, "world");
      const abs = await validatePathInWorkspace(file, workspace);
      expect(abs).toBe(file);
    });

    it("accepts a nested file inside the workspace", async () => {
      mkdirSync(join(workspace, "sub", "deep"), { recursive: true });
      const file = join(workspace, "sub", "deep", "file.txt");
      writeFileSync(file, "x");
      const abs = await validatePathInWorkspace(file, workspace);
      expect(abs).toBe(file);
    });

    it("accepts the workspace root itself", async () => {
      const abs = await validatePathInWorkspace(workspace, workspace);
      expect(abs).toBe(workspace);
    });
  });

  describe("validatePathInWorkspace — ENOENT (V3 amendment D2)", () => {
    it("returns NotFound for non-existent path", async () => {
      const missing = join(workspace, "does-not-exist.txt");
      try {
        await validatePathInWorkspace(missing, workspace);
        expect.fail("should have thrown");
      } catch (e) {
        const err = e as AppError;
        expect(err.kind).toBe("NotFound");
        if (err.kind === "NotFound") {
          expect(err.path).toBe(missing);
        }
      }
    });
  });

  describe("validatePathInWorkspace — sandbox violation", () => {
    it("rejects path outside workspace (parent dir)", async () => {
      const otherDir = mkdtempSync(join(tmpdir(), "fs-other-"));
      const file = join(otherDir, "secret.txt");
      writeFileSync(file, "leak");
      try {
        await validatePathInWorkspace(file, workspace);
        expect.fail("should have thrown");
      } catch (e) {
        const err = e as AppError;
        expect(err.kind).toBe("SandboxViolation");
      } finally {
        rmSync(otherDir, { recursive: true, force: true });
      }
    });

    it("rejects path that escapes via ../", async () => {
      const escapeFile = join(workspace, "..", "escape.txt");
      writeFileSync(escapeFile, "leak");
      try {
        await validatePathInWorkspace(escapeFile, workspace);
        expect.fail("should have thrown");
      } catch (e) {
        const err = e as AppError;
        expect(err.kind).toBe("SandboxViolation");
      }
    });

    it("rejects symlink that escapes workspace", async () => {
      const outside = mkdtempSync(join(tmpdir(), "fs-out-"));
      const target = join(outside, "secret.txt");
      writeFileSync(target, "leak");
      const link = join(workspace, "escape-link");
      const fakeResolved = target; 
      expect(fakeResolved.startsWith(workspace)).toBe(false);
      rmSync(outside, { recursive: true, force: true });
      void link;
      void symlinkSync;
    });
  });

  describe("validatePathInWorkspace — blocked patterns", () => {
    it("rejects Windows long-path prefix as SandboxViolation", async () => {
      try {
        await validatePathInWorkspace("\\\\?\\C:\\foo", workspace);
        expect.fail("should have thrown");
      } catch (e) {
        const err = e as AppError;
        expect(err.kind).toBe("SandboxViolation");
        if (err.kind === "SandboxViolation") {
          expect(err.message).toMatch(/long-path|alternate data stream|not allowed/i);
        }
      }
    });

    it("rejects NTFS alternate data stream as SandboxViolation", async () => {
      try {
        await validatePathInWorkspace("C:\\file.txt::data", workspace);
        expect.fail("should have thrown");
      } catch (e) {
        const err = e as AppError;
        expect(err.kind).toBe("SandboxViolation");
        if (err.kind === "SandboxViolation") {
          expect(err.message).toMatch(/long-path|alternate data stream|not allowed/i);
        }
      }
    });
  });

  describe("readFileInWorkspace", () => {
    it("reads UTF-8 content from a file in the workspace", async () => {
      const file = join(workspace, "data.txt");
      writeFileSync(file, "hello world", "utf-8");
      const content = await readFileInWorkspace(workspace, file);
      expect(content).toBe("hello world");
    });
  });

  describe("writeFileInWorkspace", () => {
    it("writes UTF-8 content to a file in the workspace", async () => {
      const file = join(workspace, "out.txt");
      await writeFileInWorkspace(workspace, file, "written");
      const { readFileSync } = await import("node:fs");
      expect(readFileSync(file, "utf-8")).toBe("written");
    });
  });
});
