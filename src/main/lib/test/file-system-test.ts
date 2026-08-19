/**
 * PR-α  测试基础：memfs 版 `Layer<FileSystem.FileSystem>`。
 *
 * D3 决策：测试环境用 memfs 虚拟文件系统，避免 vitest 里加载原生 node:fs
 * 的 native ABI（better-sqlite3 / @electron/rebuild 与 Electron 版本不匹配）
 * 导致的环境差异。memfs 的 `promises` API 与 `node:fs/promises` 同构，
 * 抛出的错误同样是带 `code` 的 `NodeJS.ErrnoException`，因此错误映射逻辑
 * 与 `file-system-node.ts` 完全一致。
 *
 * 用法：
 * - `MemfsFileSystemTest`：直接 `Effect.provide(MemfsFileSystemTest)`，
 *   每个 layer 实例背后是一个全新的空 `Volume()`（测试间互不污染）。
 * - `makeMemfsFileSystem(vol)`：工厂，包装调用方提供的 `Volume`，
 *   适合先 `vol.fromJSON({"/foo.txt": "hi"})` 预置文件再注入。
 *
 * 覆盖范围（与 NodeFileSystemLive 对齐）：
 * - 实现 10 个字节/元数据方法 + `FileSystem.make()` 自动派生
 *   exists / readFileString / writeFileString / stream / sink。
 * - 其余方法（copy / chmod / chown / link / temp 系列 / open / readLink /
 *   symlink / truncate / utimes / watch）一律抛 `BadArgument`
 *   （message "Not implemented: <method>"），绝不静默。
 * - stream/sink 由 make() 从 open 派生，这里在 make() 之上显式覆写为 Not implemented。
 *
 * realPath 说明：
 * - memfs 没有 native realpath，虚拟路径本身就是规范的，因此直接对
 *   POSIX 路径做 `posix.resolve` 规范化（不含符号链接解析、不校验存在性）。
 *
 * 与 `file-system-node.ts` 的依赖（follow-up）：
 * - 本文件内联了一份 `makePlatformError` / `reasonForErrno` /
 *   `notImplemented` / `attempt` helper，与 file-system-node.ts 同构。
 *   后续应把 `makePlatformError` 从 file-system-node.ts 导出（或抽到共享
 *   helper 模块），两个适配器复用，删除此处重复。
 */
import * as FileSystem from "@effect/platform/FileSystem";
import {
  BadArgument,
  SystemError,
  type PlatformError,
  type SystemErrorReason,
} from "@effect/platform/Error";
import { Effect, Layer, Option, Sink, Stream } from "effect";
import { Volume, createFsFromVolume } from "memfs";
import type { IFs, Volume as VolumeType } from "memfs";
import { posix } from "node:path";

const MODULE = "FileSystem";

/**
 * errno → SystemErrorReason 映射（与 file-system-node.ts 一致）。
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
 * 手工构造 PlatformError.SystemError。
 * 与 file-system-node.ts 的 `makePlatformError` 同构（内联副本，
 * follow-up：抽到共享 helper 复用）。
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

/** 每个 memfs 调用统一走 tryPromise，把 ErrnoException 映射为 PlatformError。 */
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
    (options.readable ? 4 : 0) | (options.writable ? 2 : 0);
  return mode === 0 ? undefined : mode;
};

const fileType = (stats: MemfsStats): FileSystem.File.Type => {
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

const toNumber = (value: number | bigint): number => Number(value);

/** memfs Stats → @effect/platform File.Info。 */
const toFileInfo = (stats: MemfsStats): FileSystem.File.Info => ({
  type: fileType(stats),
  mtime: Option.fromNullable(stats.mtime),
  atime: Option.fromNullable(stats.atime),
  birthtime: Option.fromNullable(stats.birthtime),
  dev: toNumber(stats.dev),
  ino: Option.some(toNumber(stats.ino)),
  mode: toNumber(stats.mode),
  nlink: Option.some(toNumber(stats.nlink)),
  uid: Option.some(toNumber(stats.uid)),
  gid: Option.some(toNumber(stats.gid)),
  rdev: Option.some(toNumber(stats.rdev)),
  size: FileSystem.Size(stats.size),
  blksize: Option.some(FileSystem.Size(stats.blksize)),
  blocks: Option.some(toNumber(stats.blocks)),
});

type MemfsStats = Awaited<ReturnType<IFs["promises"]["stat"]>>;

const makeFileSystem = (vol: VolumeType): FileSystem.FileSystem => {
  const fs = createFsFromVolume(vol);
  const impl = FileSystem.make({
    access: (path, options = {}) =>
      attempt("access", () => fs.promises.access(path, accessMode(options)), path),
    copyFile: (fromPath, toPath) =>
      attempt("copyFile", () => fs.promises.copyFile(fromPath, toPath), fromPath),
    makeDirectory: (path, options) =>
      attempt("makeDirectory", () => fs.promises.mkdir(path, options), path),
    readDirectory: (path, options) =>
      Effect.map(
        attempt(
          "readDirectory",
          () => fs.promises.readdir(path, { recursive: options?.recursive }),
          path,
        ),
        (entries) => entries.filter((entry): entry is string => typeof entry === "string"),
      ),
    readFile: (path) =>
      Effect.map(
        attempt("readFile", () => fs.promises.readFile(path), path),
        (data) => (typeof data === "string" ? new TextEncoder().encode(data) : data),
      ),
    realPath: (path) => Effect.sync(() => posix.resolve(path)),
    remove: (path, options) =>
      attempt("remove", () => fs.promises.rm(path, options), path),
    rename: (oldPath, newPath) =>
      attempt("rename", () => fs.promises.rename(oldPath, newPath), oldPath),
    stat: (path) =>
      Effect.map(attempt("stat", () => fs.promises.stat(path), path), toFileInfo),
    writeFile: (path, data, options) =>
      attempt("writeFile", () => fs.promises.writeFile(path, data, options), path),

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
  return {
    ...impl,
    stream: (_path, _options) => Stream.fail(notImplemented("stream")),
    sink: (_path, _options) => Sink.fail(notImplemented("sink")),
  };
};

/** 默认测试层：背后是全新空 `Volume()`，每次 import 独立（测试间互不污染）。 */
export const MemfsFileSystemTest: Layer.Layer<
  FileSystem.FileSystem,
  never,
  never
> = Layer.succeed(FileSystem.FileSystem, makeFileSystem(new Volume()));

/**
 * 工厂：包装调用方提供的 `Volume`，可用于预置文件。
 * 例：`vol.fromJSON({"/foo.txt": "hi"})` 后传入。
 */
export const makeMemfsFileSystem = (
  vol: VolumeType,
): Layer.Layer<FileSystem.FileSystem, never, never> =>
  Layer.succeed(FileSystem.FileSystem, makeFileSystem(vol));
