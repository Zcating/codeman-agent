/**
 * AppBackendError — Electron Main 端的 typed-error 命名空间。
 *
 * 设计要点（ADR-0058 PR-β D6 + ADR-0025 错误模型继承）：
 * - `_tag` 字段名与字面值与 renderer 端 `src/renderer/src/shared/lib/errors.ts`
 *   的 AppError 完全一致，便于 IPC 跨进程序列化后 renderer decoder 复用。
 * - IPC 边界 (`src/main/lib/sandbox-handler.ts`) 走 `Error(JSON.stringify({kind: _tag, message}))`
 *   把 `_tag` 映射为 `kind` 字段；renderer 端 `decodeAppError` 把 `kind` 还原为
 *   `_tag` 并构造 Schema.TaggedError 实例（详见 decode-app-error.ts）。
 * - Main 端使用方：file-sandbox.ts / mcp-config.ts / automations-config.ts /
 *   skill-loader.ts / file-ops/ipc.ts 等。所有 fs/path 失败的 catchTag 都映射到这里。
 * - 暂时不复制 `Network` / `Database` / `ToolCall` / `JsonRpcProtocolError` /
 *   `JsonRpcTimeoutError` 因为 PR-β 只用到 NotFound / InvalidConfig / Unknown /
 *   SandboxViolation；后续 PR-γ / PR-δ 按需扩展（统一在本文件加，保持
 *   命名空间单一来源）。
 *
 * 为什么不直接 import renderer 端的 errors.ts：
 * - ADR-0057 D1 物理分离原则：main 不能依赖 renderer 的运行时模块。
 * - 仅 tag 名 + field 字段镜像即可；运行时不需要共享 class instance。
 */
import { Schema } from "effect";

// ---------------------------------------------------------------------------
// Schema.TaggedError 子类（与 renderer 端 _tag 字面量完全一致）
// ---------------------------------------------------------------------------

export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  message: Schema.String,
  path: Schema.optional(Schema.String),
}) {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  { message: Schema.String },
) {}

export class Network extends Schema.TaggedError<Network>()("Network", {
  message: Schema.String,
  cause: Schema.optional(Schema.String),
}) {}

export class InvalidConfig extends Schema.TaggedError<InvalidConfig>()(
  "InvalidConfig",
  {
    message: Schema.String,
    field: Schema.optional(Schema.String),
  },
) {}

export class Database extends Schema.TaggedError<Database>()("Database", {
  message: Schema.String,
  cause: Schema.optional(Schema.String),
}) {}

export class ToolCall extends Schema.TaggedError<ToolCall>()("ToolCall", {
  toolCallId: Schema.String,
  message: Schema.String,
}) {}

export class SandboxViolation extends Schema.TaggedError<SandboxViolation>()(
  "SandboxViolation",
  {
    message: Schema.optional(Schema.String),
    path: Schema.String,
    workspaceLabel: Schema.String,
  },
) {}

export class Unknown extends Schema.TaggedError<Unknown>()("Unknown", {
  message: Schema.String,
}) {}

export class JsonRpcProtocolError extends Schema.TaggedError<JsonRpcProtocolError>()(
  "JsonRpcProtocolError",
  {
    message: Schema.String,
    code: Schema.Number,
  },
) {}

export class JsonRpcTimeoutError extends Schema.TaggedError<JsonRpcTimeoutError>()(
  "JsonRpcTimeoutError",
  {
    message: Schema.String,
    method: Schema.String,
    timeoutMs: Schema.Number,
  },
) {}

// ---------------------------------------------------------------------------
// 命名空间（namespace 模式聚合，与 renderer 端 isAppError 对称）
// ---------------------------------------------------------------------------

/**
 * AppBackendError — Electron Main 端的 tagged-error 集合。
 *
 * 使用方式：
 * ```ts
 *   yield* Effect.fail(new AppBackendError.NotFound({ message: "...", path: "/x" }))
 *   yield* Effect.fail(new AppBackendError.SandboxViolation({ path, workspaceLabel }))
 * ```
 *
 * 与 renderer 端 `AppError` 镜像；IPC 序列化层（sandbox-handler）只透传
 * `_tag` + `message`，main 端扩展字段（path / workspaceLabel / field / cause
 * 等）不出 IPC（per ADR-0058 D6 保守映射）。
 */
export const AppBackendError = {
  NotFound,
  Unauthorized,
  Network,
  InvalidConfig,
  Database,
  ToolCall,
  SandboxViolation,
  Unknown,
  JsonRpcProtocolError,
  JsonRpcTimeoutError,
} as const;

/** AppBackendError 联合类型（供 Effect 错误通道使用）。 */
export type AppBackendError = NotFound | Unauthorized | Network | InvalidConfig | Database | ToolCall | SandboxViolation | Unknown | JsonRpcProtocolError | JsonRpcTimeoutError;

/** Schema 联合：可用于 Schema.decodeUnknownEither 校验 IPC payload。 */
export const AppBackendErrorSchema = Schema.Union(
  NotFound,
  Unauthorized,
  Network,
  InvalidConfig,
  Database,
  ToolCall,
  SandboxViolation,
  Unknown,
  JsonRpcProtocolError,
  JsonRpcTimeoutError,
);