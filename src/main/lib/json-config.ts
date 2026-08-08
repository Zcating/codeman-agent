/**
 * src/main/lib/json-config.ts
 *
 * PR-γ (ADR-0058): JSON 配置文件 IO 抽象。
 *
 * 消除 mcp-config.ts + automations-config.ts 90% 重复的 read/write/exists
 * 三件套；统一错误映射到 AppBackendError（InvalidConfig / Unknown）。
 *
 * 行为契约：
 * - readJsonConfig<T>(path, schema, defaultValue)：
 *   - 文件不存在（ENOENT）→ 返回 defaultValue（与原 mcp-config / automations-config 一致）
 *   - 文件存在但内容不是合法 JSON → Effect.fail(InvalidConfig)
 *   - 文件存在但 Schema.decodeUnknownEither 失败 → Effect.fail(InvalidConfig)
 *   - 其他 fs 错误（PermissionDenied / Unknown）→ Effect.fail(Unknown)
 *
 * - writeJsonConfig(path, value)：
 *   - 自动 mkdir 父目录（recursive）；mkdir 失败走 orElseSucceed 容忍
 *   - 写文件失败（PermissionDenied 等）→ Effect.fail(Unknown)
 *
 * - jsonConfigExists(path)：
 *   - fs.exists 抛错时返回 false（不会 fail）
 *
 * 与原实现的差异：
 * - 不再直调 node:fs/promises，全部走 FileSystem.FileSystem service。
 * - 父目录路径经 Path.Path.dirname 计算（跨平台 sep 兼容）。
 * - 错误统一 AppBackendError 命名空间（renderer 端 decoder 复用）。
 *
 * 与 renderer 端契约：sandbox-handler 仍只透传 `_tag` + `message`，
 * InvalidConfig / Unknown 的扩展字段（field）不出 IPC。
 */
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import type { PlatformError } from "@effect/platform/Error";
import { Effect, Schema } from "effect";
import { AppBackendError, type AppBackendError as AppBackendErrorT } from "./errors.js";

// ---------------------------------------------------------------------------
// 内部 helpers
// ---------------------------------------------------------------------------

/** PlatformError SystemError reason NotFound → AppBackendError.NotFound */
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

// ---------------------------------------------------------------------------
// readJsonConfig
// ---------------------------------------------------------------------------

/**
 * 读 JSON 配置文件并按 schema 解码。文件不存在时返回 defaultValue。
 *
 * @param path 配置文件绝对路径
 * @param schema effect/Schema（用于 JSON.parse 后的字段级校验）
 * @param defaultValue 文件不存在或 ENOENT 时的回退值
 *
 * 错误：
 * - JSON.parse 失败 → AppBackendError.InvalidConfig
 * - Schema.decodeUnknownEither Left → AppBackendError.InvalidConfig
 * - 其他 fs 系统错误 → AppBackendError.Unknown
 *
 * R 通道要求 `FileSystem.FileSystem`（不需要 Path；路径由调用方提供绝对路径）。
 */
export const readJsonConfig = Effect.fn("readJsonConfig")(
  function* <T>(path: string, schema: Schema.Schema<T>, defaultValue: T) {
    const fs = yield* FileSystem.FileSystem;
    const raw = yield* fs.readFileString(path).pipe(
      Effect.catchAll((e) =>
        e._tag === "SystemError" && e.reason === "NotFound"
          ? Effect.succeed(null)
          : Effect.fail(mapPlatformError("readJsonConfig", e, path)),
      ),
    );
    if (raw === null) {
      return defaultValue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return yield* Effect.fail(
        new AppBackendError.InvalidConfig({
          message: `Cannot parse JSON config at ${path}: ${(e as Error).message}`,
          field: path,
        }),
      );
    }
    const decoded = Schema.decodeUnknownEither(schema)(parsed);
    if (decoded._tag === "Left") {
      return yield* Effect.fail(
        new AppBackendError.InvalidConfig({
          message: `Config at ${path} does not match schema`,
          field: path,
        }),
      );
    }
    return decoded.right;
  },
);

// ---------------------------------------------------------------------------
// writeJsonConfig
// ---------------------------------------------------------------------------

/**
 * 写 JSON 配置文件（覆盖）。自动 mkdir 父目录。
 *
 * @param path 绝对路径
 * @param value 任意 JSON.stringify 可序列化的值
 *
 * 错误：
 * - mkdir 失败（PermissionDenied 等非 ENOENT）→ 忽略（沿用原 orElseSucceed 容忍语义）
 * - 写文件失败 → AppBackendError.Unknown
 *
 * R 通道要求 `FileSystem.FileSystem | Path.Path`（Path 用于 dirname 计算父目录）。
 */
export const writeJsonConfig = Effect.fn("writeJsonConfig")(
  function* (path: string, value: unknown) {
    const fs = yield* FileSystem.FileSystem;
    const pathSvc = yield* Path.Path;
    yield* fs
      .makeDirectory(pathSvc.dirname(path), { recursive: true })
      .pipe(Effect.catchAll(() => Effect.void));
    const json = JSON.stringify(value, null, 2);
    yield* fs.writeFileString(path, json).pipe(
      Effect.mapError((e) =>
        new AppBackendError.Unknown({
          message: `Cannot write JSON config at ${path}: ${e.message}`,
        }),
      ),
    );
  },
);

// ---------------------------------------------------------------------------
// jsonConfigExists
// ---------------------------------------------------------------------------

/**
 * 检查 JSON 配置文件是否存在。永远不 fail（不存在返回 false；其他错误也返回 false）。
 *
 * R 通道要求 `FileSystem.FileSystem`。
 */
export const jsonConfigExists = Effect.fn("jsonConfigExists")(
  function* (path: string) {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.exists(path).pipe(Effect.orElseSucceed(() => false));
  },
);