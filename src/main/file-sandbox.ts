import { realpath } from "node:fs/promises";
import { dirname, join, basename, isAbsolute, resolve, sep } from "node:path";


export type AppError =
  | { kind: "NotFound"; path: string }
  | { kind: "SandboxViolation"; path: string; workspaceRoot: string; message?: string }
  | { kind: "Unknown"; message: string };

const BLOCKED_PATH_PATTERNS: RegExp[] = [
  /^\\\\\?\\/i,
  /::/i,
];


async function resolveRealRoot(workspaceRoot: string): Promise<string> {
  try {
    return await realpath(workspaceRoot);
  } catch (e) {
    throw {
      kind: "Unknown" as const,
      message: `workspace realpath failed: ${String(e)}`,
    };
  }
}

function checkBlockedPatterns(inputPath: string, realRoot: string): void {
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
}

function isInside(candidate: string, realRoot: string): boolean {
  return candidate === realRoot || candidate.startsWith(realRoot + sep);
}

function toAbsolutePath(inputPath: string, workspaceRoot: string): string {
  return isAbsolute(inputPath) ? inputPath : resolve(workspaceRoot, inputPath);
}

function asNotFound(path: string): AppError {
  return { kind: "NotFound", path };
}


export async function validatePathForWrite(
  inputPath: string,
  workspaceRoot: string,
): Promise<string> {
  const realRoot = await resolveRealRoot(workspaceRoot);
  checkBlockedPatterns(inputPath, realRoot);

  const absolutePath = toAbsolutePath(inputPath, workspaceRoot);
  const parent = dirname(absolutePath);
  let realParent: string;
  try {
    realParent = await realpath(parent);
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      throw asNotFound(parent);
    }
    throw {
      kind: "Unknown" as const,
      message: `parent realpath failed: ${String(e)}`,
    };
  }

  const candidate = join(realParent, basename(absolutePath));
  if (!isInside(candidate, realRoot)) {
    throw {
      kind: "SandboxViolation" as const,
      path: candidate,
      workspaceRoot: realRoot,
    };
  }
  return candidate;
}

export async function validatePathInWorkspace(
  inputPath: string,
  workspaceRoot: string,
): Promise<string> {
  const realRoot = await resolveRealRoot(workspaceRoot);
  checkBlockedPatterns(inputPath, realRoot);

  const absolutePath = toAbsolutePath(inputPath, workspaceRoot);

  let real: string;
  try {
    real = await realpath(absolutePath);
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      throw asNotFound(inputPath);
    }
    throw {
      kind: "Unknown" as const,
      message: `realpath failed: ${String(e)}`,
    };
  }

  if (!isInside(real, realRoot)) {
    throw {
      kind: "SandboxViolation" as const,
      path: real,
      workspaceRoot: realRoot,
    };
  }
  return real;
}

export async function readFileInWorkspace(
  workspaceRoot: string,
  inputPath: string,
): Promise<string> {
  const abs = await validatePathInWorkspace(inputPath, workspaceRoot);
  const { readFile } = await import("node:fs/promises");
  return readFile(abs, "utf-8");
}

export async function writeFileInWorkspace(
  workspaceRoot: string,
  inputPath: string,
  content: string,
): Promise<void> {
  const abs = await validatePathForWrite(inputPath, workspaceRoot);
  const { writeFile, rename, unlink } = await import("node:fs/promises");
  const tmp = abs + ".tmp." + Math.random().toString(36).slice(2);
  await writeFile(tmp, content, "utf-8");
  try {
    await rename(tmp, abs);
  } catch (e) {
    await unlink(tmp).catch(() => {});
    throw e;
  }
}