// T4b — electron/main/file-sandbox.ts: workspace-bounded file access.
//
// Per V3 consensus 1.2 + ADR-0013 amendment D2:
// - realpath.native resolves symlinks + absolute path (Rust std::fs::canonicalize
//   semantic equivalent; differs on missing-path handling: Rust errors, Node
//   errors with ENOENT).
// - ENOENT vs SandboxViolation: missing file → AppError.NotFound; path resolves
//   outside workspace → AppError.SandboxViolation. Distinct error types let
//   the agent distinguish "file doesn't exist" (recoverable: try different path)
//   from "path blocked" (security: re-plan).
// - Reject Windows long-path prefix `\\?\` and NTFS alternate data streams
//   `::` BEFORE realpath (don't trust renderer).

import { realpath } from "node:fs/promises";
import { join, sep } from "node:path";

export type AppError =
  | { kind: "NotFound"; path: string }
  // TODO(ADR-0025 migration): renderer-side Schema.TaggedError SandboxViolation
  // expects `workspaceLabel: Schema.String`; electron-side carries `workspaceRoot`.
  // Field-name mismatch will reconcile when file-sandbox.ts migrates to
  // Schema.TaggedError (out of scope per task B2). See decode-app-error.ts:5-6.
  | { kind: "SandboxViolation"; path: string; workspaceRoot: string; message?: string }
  | { kind: "Unknown"; message: string };

const BLOCKED_PATH_PATTERNS: RegExp[] = [
  /^\\\\\?\\/i, // Windows long-path prefix
  /::/i, // NTFS alternate data streams
];

/**
 * Validate that a path STRING would resolve inside `workspaceRoot`, without
 * requiring the file to exist. Used for write operations (file doesn't
 * exist yet). Validates the parent directory of the input path.
 */
export async function validatePathForWrite(
  inputPath: string,
  workspaceRoot: string,
): Promise<string> {
  // 1. realpath the workspace root first (needed for Blocked-throw + final check).
  let realRoot: string;
  try {
    realRoot = await realpath(workspaceRoot);
  } catch {
    throw {
      kind: "Unknown" as const,
      message: `workspace realpath failed`,
    };
  }

  // 2. Reject dangerous prefixes (now with realRoot available for error context).
  for (const re of BLOCKED_PATH_PATTERNS) {
    if (re.test(inputPath)) {
      throw {
        kind: "SandboxViolation" as const,
        path: inputPath,
        workspaceRoot: realRoot,
        message: "Long-path prefix or NTFS alternate data stream not allowed",
      };
    }
  }

  // 3. Resolve relative paths against workspaceRoot, not process CWD.
  //    Without this, `dirname("relative.txt")` = `"."` → `realpath(".")`
  //    resolves to Electron's CWD, which is outside the workspace and
  //    always triggers a SandboxViolation.
  const { dirname, basename, isAbsolute, resolve } = await import("node:path");
  const absolutePath = isAbsolute(inputPath)
    ? inputPath
    : resolve(workspaceRoot, inputPath);
  const parent = dirname(absolutePath);
  let realParent: string;
  try {
    realParent = await realpath(parent);
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      const err: AppError = { kind: "NotFound", path: parent };
      throw err;
    }
    throw { kind: "Unknown" as const, message: `parent realpath failed: ${String(e)}` };
  }

  const candidate = join(realParent, basename(absolutePath));
  const inside =
    candidate === realRoot || candidate.startsWith(realRoot + sep);
  if (!inside) {
    throw {
      kind: "SandboxViolation" as const,
      path: candidate,
      workspaceRoot: realRoot,
    };
  }
  return candidate;
}

/**
 * Validate that `inputPath` resolves inside `workspaceRoot`. Returns the
 * canonical absolute path on success. Throws an AppError on:
 * - path contains `\\?\` or `::` (blocked)
 * - realpath fails with ENOENT (file doesn't exist)
 * - realpath resolves to a path outside workspaceRoot (sandbox violation)
 * - any other I/O error (unknown)
 */
export async function validatePathInWorkspace(
  inputPath: string,
  workspaceRoot: string,
): Promise<string> {
  // 1. realpath the workspace root first (needed for Blocked-throw + final check).
  let realRoot: string;
  try {
    realRoot = await realpath(workspaceRoot);
  } catch (e: unknown) {
    const err: AppError = {
      kind: "Unknown",
      message: `workspace realpath failed: ${String(e)}`,
    };
    throw err;
  }

  // 2. Reject dangerous prefixes BEFORE realpath (don't trust renderer).
  for (const re of BLOCKED_PATH_PATTERNS) {
    if (re.test(inputPath)) {
      throw {
        kind: "SandboxViolation" as const,
        path: inputPath,
        workspaceRoot: realRoot,
        message: "Long-path prefix or NTFS alternate data stream not allowed",
      };
    }
  }

  // 3. Resolve relative paths against workspaceRoot (not process CWD).
  //    Without this, realpath("relative.txt") resolves against Electron's CWD,
  //    which is outside the workspace, and always triggers SandboxViolation.
  const { isAbsolute, resolve } = await import("node:path");
  const absolutePath = isAbsolute(inputPath)
    ? inputPath
    : resolve(workspaceRoot, inputPath);

  // 4. realpath.native — resolves symlinks + absolute path.
  //    Throws ENOENT if path doesn't exist (Rust canonicalize also errors here,
  //    but V3 explicitly distinguishes NotFound from SandboxViolation per
  //    ADR-0024 amendment D2).
  let real: string;
  try {
    real = await realpath(absolutePath);
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      const err: AppError = { kind: "NotFound", path: inputPath };
      throw err;
    }
    const err: AppError = {
      kind: "Unknown",
      message: `realpath failed: ${String(e)}`,
    };
    throw err;
  }

  // 5. Prefix check (path must be inside realRoot).
  const inside =
    real === realRoot || real.startsWith(realRoot + sep);
  if (!inside) {
    const err: AppError = {
      kind: "SandboxViolation",
      path: real,
      workspaceRoot: realRoot,
    };
    throw err;
  }

  return real;
}

/**
 * Read a UTF-8 file within a workspace. Throws AppError on sandbox/IO issues.
 */
export async function readFileInWorkspace(
  workspaceRoot: string,
  inputPath: string,
): Promise<string> {
  const abs = await validatePathInWorkspace(inputPath, workspaceRoot);
  const { readFile } = await import("node:fs/promises");
  return readFile(abs, "utf-8");
}

/**
 * Write a UTF-8 file within a workspace (atomic via temp file + rename).
 */
export async function writeFileInWorkspace(
  workspaceRoot: string,
  inputPath: string,
  content: string,
): Promise<void> {
  // For writes, validate the parent dir (file doesn't exist yet).
  const abs = await validatePathForWrite(inputPath, workspaceRoot);
  const { writeFile, rename, unlink } = await import("node:fs/promises");
  // Atomic write: write to temp, rename.
  const tmp = abs + ".tmp." + Math.random().toString(36).slice(2);
  await writeFile(tmp, content, "utf-8");
  try {
    await rename(tmp, abs);
  } catch (e) {
    await unlink(tmp).catch(() => {});
    throw e;
  }
}
