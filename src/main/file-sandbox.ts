












import { realpath } from "node:fs/promises";
import { join, sep } from "node:path";

export type AppError =
  | { kind: "NotFound"; path: string }
  
  
  
  
  | { kind: "SandboxViolation"; path: string; workspaceRoot: string; message?: string }
  | { kind: "Unknown"; message: string };

const BLOCKED_PATH_PATTERNS: RegExp[] = [
  /^\\\\\?\\/i, 
  /::/i, 
];


export async function validatePathForWrite(
  inputPath: string,
  workspaceRoot: string,
): Promise<string> {
  
  let realRoot: string;
  try {
    realRoot = await realpath(workspaceRoot);
  } catch {
    throw {
      kind: "Unknown" as const,
      message: `workspace realpath failed`,
    };
  }

  
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


export async function validatePathInWorkspace(
  inputPath: string,
  workspaceRoot: string,
): Promise<string> {
  
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

  
  
  
  const { isAbsolute, resolve } = await import("node:path");
  const absolutePath = isAbsolute(inputPath)
    ? inputPath
    : resolve(workspaceRoot, inputPath);

  
  
  
  
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
