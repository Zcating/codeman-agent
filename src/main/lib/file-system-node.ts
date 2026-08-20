/**
 * PR-α  基础：手写 `Layer<FileSystem.FileSystem>`，包装 `node:fs/promises`。
 *
 * 为什么手写而不是直接用 @effect/platform-node 的 `NodeFileSystem.layer`：
 * - @effect/platform-node-shared@0.61.1 里的 `SystemError` 是箭头函数而非 class，
 *   导致 `instanceof SystemError` / `new SystemError()` 判断失效（SystemError 构造 bug），
 *   与当前 @effect/platform@0.75.4（peer effect@3.21.4）不兼容。
 *   因此这里用 @effect/platform 导出的 `SystemError`/`BadArgument` 构造器手工构造 typed failure，
 *   不经过 effectify 转换。
 *
 * 子模块导入模式：
 * - 只从 `@effect/platform` 的 `./FileSystem`、`./Error` 子路径导入，
 *   不依赖 @effect/platform-node（NodePath / NodeFileSystem 一律不用）。
 *
 * 后续替换路径（follow-up）：
 * - 当 @effect/platform 升级到 0.97.1+（peer-requires effect@3.22.1+）后，
 *   直接用 @effect/platform-node 内置的 `NodeFileSystem.layer` 替换本实现。
 *
 * 覆盖范围：
 * - 实现 10 个字节/元数据方法 + `FileSystem.make()` 自动派生
 *   exists / readFileString / writeFileString / stream / sink。
 * - 其余方法（copy / chmod / chown / link / temp 系列 / open / readLink /
 *   symlink / truncate / utimes / watch）一律抛 `BadArgument`
 *   （message "Not implemented: <method>"），绝不静默。
 * - stream/sink 由 make() 从 open 派生，这里在 make() 之上显式覆写为 Not implemented。
 */
import * as FileSystem from "@effect/platform/FileSystem";
import {
  BadArgument,
  SystemError,
  type PlatformError,
  type SystemErrorReason,
} from "@effect/platform/Error";
import { Effect, Layer, Option, Sink, Stream } from "effect";
import type { Stats } from "node:fs";
import * as fs from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const MODULE = "FileSystem";

/**
 * errno → SystemErrorReason 映射。
 * 注意：@effect/platform@0.75.4 的 SystemErrorReason 联合里没有
 * "NotADirectory" / "IsADirectory" / "ResourceExhausted"，
 * 所以 ENOTDIR/EISDIR/EMFILE/ENFILE 落到默认 "Unknown"（与新版映射表不同）。
 */
const reasonForErrno = (errno: string | undefined): SystemErrorReason => {
  switch (errno) {
    case "ENOENT":
      return "NotFound";
    case "EACCES":
    case "EPERM":
      return "PermissionDenied";
    case "EEXIST":
      return "AlreadyExists";
    case "EBUSY":
      return "Busy";
    default:
      return "Unknown";
  }
};

/**
 * 手工构造 PlatformError.SystemError（绕过 effectify 与 platform-node-shared 的 bug）。
 */
const makePlatformError = (
  method: string,
  error: NodeJS.ErrnoException,
  path?: string,
): PlatformError =>
  SystemError({
    module: MODULE,
    method,
    reason: reasonForErrno(error.code),
    message: error.message ?? `FileSystem ${method} failed`,
    syscall: error.syscall,
    pathOrDescriptor: error.path ?? path ?? method,
  });

/** 未实现方法：抛 typed BadArgument，绝不静默。 */
const notImplemented = (method: string): PlatformError =>
  BadArgument({
    module: MODULE,
    method,
    message: `Not implemented: ${method}`,
  });

/** 每个 fs 调用统一走 tryPromise，把 NodeJS.ErrnoException 映射为 PlatformError。 */
const attempt = <A>(
  method: string,
  promise: () => Promise<A>,
  path?: string,
): Effect.Effect<A, PlatformError> =>
  Effect.tryPromise({
    try: promise,
    catch: (error) =>
      makePlatformError(method, error as NodeJS.ErrnoException, path),
  });

const accessMode = (
  options: FileSystem.AccessFileOptions | undefined,
): number | undefined => {
  if (options === undefined) {
    return undefined;
  }
  const mode =
    (options.readable ? fs.constants.R_OK : 0) |
    (options.writable ? fs.constants.W_OK : 0);
  return mode === 0 ? undefined : mode;
};

const fileType = (stats: Stats): FileSystem.File.Type => {
  if (stats.isFile()) {
    return "File";
  }
  if (stats.isDirectory()) {
    return "Directory";
  }
  if (stats.isSymbolicLink()) {
    return "SymbolicLink";
  }
  if (stats.isBlockDevice()) {
    return "BlockDevice";
  }
  if (stats.isCharacterDevice()) {
    return "CharacterDevice";
  }
  if (stats.isFIFO()) {
    return "FIFO";
  }
  if (stats.isSocket()) {
    return "Socket";
  }
  return "Unknown";
};

/** node:fs.Stats → @effect/platform File.Info。 */
const toFileInfo = (stats: Stats): FileSystem.File.Info => ({
  type: fileType(stats),
  mtime: Option.some(stats.mtime),
  atime: Option.some(stats.atime),
  birthtime: Option.some(stats.birthtime),
  dev: stats.dev,
  ino: Option.some(stats.ino),
  mode: stats.mode,
  nlink: Option.some(stats.nlink),
  uid: Option.some(stats.uid),
  gid: Option.some(stats.gid),
  rdev: Option.some(stats.rdev),
  size: FileSystem.Size(stats.size),
  blksize: Option.some(FileSystem.Size(stats.blksize)),
  blocks: Option.some(stats.blocks),
});

const impl = FileSystem.make({
  access: (path, options = {}) =>
    attempt("access", () => fs.access(path, accessMode(options)), path),
  copyFile: (fromPath, toPath) =>
    attempt("copyFile", () => fs.copyFile(fromPath, toPath), fromPath),
  makeDirectory: (path, options) =>
    attempt("makeDirectory", () => fs.mkdir(path, options), path),
  readDirectory: (path, options) =>
    attempt(
      "readDirectory",
      () => fs.readdir(path, { recursive: options?.recursive }),
      path,
    ),
  readFile: (path) => attempt("readFile", () => fs.readFile(path), path),
  realPath: (path) => attempt("realPath", () => fs.realpath(path), path),
  remove: (path, options) =>
    attempt("remove", () => fs.rm(path, options), path),
  rename: (oldPath, newPath) =>
    attempt("rename", () => fs.rename(oldPath, newPath), oldPath),
  stat: (path) => Effect.map(attempt("stat", () => fs.stat(path), path), toFileInfo),
  writeFile: (path, data, options) =>
    attempt("writeFile", () => fs.writeFile(path, data, options), path),

  copy: (_fromPath, _toPath, _options) => Effect.fail(notImplemented("copy")),
  chmod: (_path, _mode) => Effect.fail(notImplemented("chmod")),
  chown: (_path, _uid, _gid) => Effect.fail(notImplemented("chown")),
  link: (_fromPath, _toPath) => Effect.fail(notImplemented("link")),
  makeTempDirectory: () => Effect.fail(notImplemented("makeTempDirectory")),
  makeTempDirectoryScoped: () =>
    Effect.fail(notImplemented("makeTempDirectoryScoped")),
  makeTempFile: () => Effect.fail(notImplemented("makeTempFile")),
  makeTempFileScoped: () => Effect.fail(notImplemented("makeTempFileScoped")),
  open: (_path, _options) => Effect.fail(notImplemented("open")),
  readLink: (_path) => Effect.fail(notImplemented("readLink")),
  symlink: (_fromPath, _toPath) => Effect.fail(notImplemented("symlink")),
  truncate: (_path, _length) => Effect.fail(notImplemented("truncate")),
  utimes: (_path, _atime, _mtime) => Effect.fail(notImplemented("utimes")),
  watch: (_path) => Stream.fail(notImplemented("watch")),
});

export const NodeFileSystemLive: Layer.Layer<
  FileSystem.FileSystem,
  never,
  never
> = Layer.succeed(FileSystem.FileSystem, {
  ...impl,
  stream: (_path, _options) => Stream.fail(notImplemented("stream")),
  sink: (_path, _options) => Sink.fail(notImplemented("sink")),
});

export const nodeFileSystem: FileSystem.FileSystem & {
  checkExists(path: string): Effect.Effect<boolean, PlatformError>;
  readTextFile(path: string): Effect.Effect<string, PlatformError>;
  writeTextFile(path: string, content: string): Effect.Effect<void, PlatformError>;
} = {
  ...impl,
  stream: (_path: string, _options: unknown) => Stream.fail(notImplemented("stream")),
  sink: (_path: string, _options: unknown) => Sink.fail(notImplemented("sink")),
  checkExists: (path: string): Effect.Effect<boolean, PlatformError> =>
    Effect.try({
      try: () => existsSync(path),
      catch: (e: unknown) => makePlatformError("checkExists", e as NodeJS.ErrnoException, path),
    }),
  readTextFile: (path: string): Effect.Effect<string, PlatformError> =>
    Effect.try({
      try: () => readFileSync(path, "utf-8"),
      catch: (e: unknown) => makePlatformError("readTextFile", e as NodeJS.ErrnoException, path),
    }),
  writeTextFile: (path: string, content: string): Effect.Effect<void, PlatformError> =>
    Effect.try({
      try: () => {
        writeFileSync(path, content, "utf-8");
      },
      catch: (e: unknown) => makePlatformError("writeTextFile", e as NodeJS.ErrnoException, path),
    }),
};
