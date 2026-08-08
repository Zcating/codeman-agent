/**
 * src/main/file-sandbox.ts
 *
 * PR-β (ADR-0058): 全面 Effect-TS 化，迁移到 FileSystem / Path service。
 *
 * 行为契约（保持向后兼容）：
 * - validatePathInWorkspace / validatePathForWrite 返回 canonical realpath，
 *   检查是否在 workspaceRoot 真实路径下；越界抛 SandboxViolation。
 * - 阻塞 Windows 长路径前缀（\\?\）与 NTFS alternate data stream（::）。
 * - readFileInWorkspace / writeFileInWorkspace 复用前两个验证 + 走 service。
 * - writeFileInWorkspace 保持原子写：tmp + rename，失败清理 tmp。
 *
 * 错误模型（ADR-0058 D6）：
 * - PlatformError SystemError reason NotFound → AppBackendError.NotFound
 * - 其他 PlatformError SystemError → AppBackendError.Unknown
 * - SandboxViolation 走 AppBackendError.SandboxViolation（与 renderer 镜像）
 * - 所有错误均带 _tag + message，与 IPC 序列化层（sandbox-handler）的
 *   {kind: _tag, message} 契约匹配。
 *
 * 与 renderer 端 SandboxViolation.workspaceLabel 字段对齐：main 端没有
 * 用户定义的 workspace label，所以使用 workspaceRoot 路径本身作为 label。
 * 该字段不出 IPC（sandbox-handler 只透传 _tag + message）。
 *
 * 与之前实现的差异：
 * - `AppError` 类型 alias 移除（替换为 AppBackendError 命名空间）
 * - 函数签名从 `Promise<T>` 改为 `Effect<T, AppBackendError, FileSystem.FileSystem | Path.Path>`
 * - 真实 fs 调用（realpath / readFile / writeFile / rename / unlink）改经 service
 * - `blockBlockedPatterns` 仍是同步纯函数（不依赖 fs）；block 命中仍抛 SandboxViolation
 */
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import type { PlatformError } from "@effect/platform/Error";
import { Effect } from "effect";
import { AppBackendError, type AppBackendError as AppBackendErrorT } from "./lib/errors.js";

// ---------------------------------------------------------------------------
// 受阻路径模式（Windows 长路径前缀 / NTFS alternate data stream）
// ---------------------------------------------------------------------------

const BLOCKED_PATH_PATTERNS: RegExp[] = [
  /^\\\\\?\\/i,
  /::/i,
];

const checkBlockedPatterns = (
  inputPath: string,
  workspaceRoot: string,
): AppBackendErrorT | null => {
  for (const re of BLOCKED_PATH_PATTERNS) {
    if (re.test(inputPath)) {
      return new AppBackendError.SandboxViolation({
        message: "Long-path prefix or NTFS alternate data stream not allowed",
        path: inputPath,
        workspaceLabel: workspaceRoot,
      });
    }
  }
  return null;
};

// ---------------------------------------------------------------------------
// PlatformError → AppBackendError 映射（保守映射，per ADR-0058 D6）
// ---------------------------------------------------------------------------

const mapPlatformError = (
  method: string,
  e: PlatformError,
  path?: string,
): AppBackendErrorT => {
  if (e._tag === "SystemError" && e.reason === "NotFound") {
    return new AppBackendError.NotFound({
      message: `${method} failed: ${e.message}`,
      path,
    });
  }
  return new AppBackendError.Unknown({
    message: `${method} failed: ${e.message}`,
  });
};

/**
 * 严格映射：catchTag("PlatformError") 后强制把 PlatformError → AppBackendError。
 * 注意：FileSystem.FileSystem 直接抛 PlatformError，不抛 AppBackendError，
 * 所以我们在边界用 mapPlatformError 一次性收敛。
 */
const asAppError = (
  method: string,
  path?: string,
): ((e: PlatformError) => AppBackendErrorT) => (e) =>
  mapPlatformError(method, e, path);

// ---------------------------------------------------------------------------
// 内部辅助：realpath 收敛到 AppBackendError
// ---------------------------------------------------------------------------

const realPathEffect = (
  fs: FileSystem.FileSystem,
  method: string,
  path: string,
): Effect.Effect<string, AppBackendErrorT, never> =>
  fs.realPath(path).pipe(Effect.mapError(asAppError(method, path)));

// ---------------------------------------------------------------------------
// isInside：candidate 是否在 realRoot 之内（用 pathSvc.sep，避免硬编码）
// ---------------------------------------------------------------------------

const isInside = (
  candidate: string,
  realRoot: string,
  sep: string,
): boolean => candidate === realRoot || candidate.startsWith(realRoot + sep);

// ---------------------------------------------------------------------------
// toAbsolutePath：相对路径以 workspaceRoot 为基准 resolve
// ---------------------------------------------------------------------------

const toAbsolutePath = (
  inputPath: string,
  workspaceRoot: string,
  pathSvc: Path.Path,
): string => (pathSvc.isAbsolute(inputPath) ? inputPath : pathSvc.resolve(workspaceRoot, inputPath));

// ---------------------------------------------------------------------------
// validatePathForWrite — 写路径校验（用于 writeFileInWorkspace）
// ---------------------------------------------------------------------------

export const validatePathForWrite = (
  inputPath: string,
  workspaceRoot: string,
): Effect.Effect<
  string,
  AppBackendErrorT,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathSvc = yield* Path.Path;

    // workspaceRoot 真实路径（realpath 失败 → Unknown）
    const realRoot = yield* realPathEffect(fs, "realPath", workspaceRoot);

    // blocked patterns 同步检查（不依赖 fs）
    const blocked = checkBlockedPatterns(inputPath, realRoot);
    if (blocked !== null) {
      return yield* Effect.fail(blocked);
    }

    const absolutePath = toAbsolutePath(inputPath, workspaceRoot, pathSvc);
    const parent = pathSvc.dirname(absolutePath);

    // 父目录 realpath：ENOENT → NotFound（父目录不存在）；其他 → Unknown
    const realParent = yield* fs.realPath(parent).pipe(
      Effect.mapError((e) =>
        e._tag === "SystemError" && e.reason === "NotFound"
          ? new AppBackendError.NotFound({
              message: `parent not found: ${parent}`,
              path: parent,
            })
          : new AppBackendError.Unknown({
              message: `parent realPath failed: ${e.message}`,
            }),
      ),
    );

    const candidate = pathSvc.join(realParent, pathSvc.basename(absolutePath));
    if (!isInside(candidate, realRoot, pathSvc.sep)) {
      return yield* Effect.fail(
        new AppBackendError.SandboxViolation({
          path: candidate,
          workspaceLabel: realRoot,
        }),
      );
    }
    return candidate;
  });

// ---------------------------------------------------------------------------
// validatePathInWorkspace — 读路径校验（用于 readFileInWorkspace）
// ---------------------------------------------------------------------------

export const validatePathInWorkspace = (
  inputPath: string,
  workspaceRoot: string,
): Effect.Effect<
  string,
  AppBackendErrorT,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathSvc = yield* Path.Path;

    const realRoot = yield* realPathEffect(fs, "realPath", workspaceRoot);

    const blocked = checkBlockedPatterns(inputPath, realRoot);
    if (blocked !== null) {
      return yield* Effect.fail(blocked);
    }

    const absolutePath = toAbsolutePath(inputPath, workspaceRoot, pathSvc);

    const real = yield* fs.realPath(absolutePath).pipe(
      Effect.mapError((e) =>
        e._tag === "SystemError" && e.reason === "NotFound"
          ? new AppBackendError.NotFound({
              message: `path not found: ${inputPath}`,
              path: inputPath,
            })
          : new AppBackendError.Unknown({
              message: `realPath failed: ${e.message}`,
            }),
      ),
    );

    if (!isInside(real, realRoot, pathSvc.sep)) {
      return yield* Effect.fail(
        new AppBackendError.SandboxViolation({
          path: real,
          workspaceLabel: realRoot,
        }),
      );
    }
    return real;
  });

// ---------------------------------------------------------------------------
// readFileInWorkspace — 读 UTF-8 内容
// ---------------------------------------------------------------------------

export const readFileInWorkspace = (
  workspaceRoot: string,
  inputPath: string,
): Effect.Effect<
  string,
  AppBackendErrorT,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const abs = yield* validatePathInWorkspace(inputPath, workspaceRoot);
    return yield* fs.readFileString(abs).pipe(
      Effect.mapError((e) =>
        e._tag === "SystemError" && e.reason === "NotFound"
          ? new AppBackendError.NotFound({
              message: `readFile failed: ${e.message}`,
              path: abs,
            })
          : new AppBackendError.Unknown({
              message: `readFile failed: ${e.message}`,
            }),
      ),
    );
  });

// ---------------------------------------------------------------------------
// writeFileInWorkspace — 写 UTF-8 内容，原子写语义（tmp + rename + cleanup）
// ---------------------------------------------------------------------------

export const writeFileInWorkspace = (
  workspaceRoot: string,
  inputPath: string,
  content: string,
): Effect.Effect<
  void,
  AppBackendErrorT,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const abs = yield* validatePathForWrite(inputPath, workspaceRoot);

    // tmp 文件名：abs + ".tmp." + 随机后缀（避免并发写覆盖）
    const tmp = `${abs}.tmp.${Math.random().toString(36).slice(2)}`;

    // 先写 tmp，rename 到 abs。rename 失败清理 tmp（Effect.tapError 自动执行清理）。
    yield* fs.writeFileString(tmp, content).pipe(
      Effect.mapError((e) =>
        new AppBackendError.Unknown({
          message: `tmp writeFile failed: ${e.message}`,
        }),
      ),
    );

    return yield* fs.rename(tmp, abs).pipe(
      // rename 失败时清理 tmp，清理失败不掩盖原 rename 错误
      Effect.tapError(() => fs.remove(tmp).pipe(Effect.ignore)),
      Effect.mapError((e) =>
        new AppBackendError.Unknown({
          message: `rename failed: ${e.message}`,
        }),
      ),
    );
  });