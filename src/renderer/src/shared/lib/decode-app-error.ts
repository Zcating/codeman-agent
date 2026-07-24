//! ADR-0025.1 D-A compatible bridge — `unknown` → Schema.TaggedError leaf.
//!
//! Phase 3 PR 1–PR 4 期间, legacy `{kind, message}` 形状与新 `Schema.TaggedError` instance
//! 短暂共存 (PR 1 窗口); PR 2 起 单源为 `Schema.TaggedError` instance。但 IPC 边界 (main process)
//! 和 legacy consumer 仍发送 `{kind, _tag, message, ...}` plain object —— 不能用
//! `e as unknown as AppError` 盲转, 那会绕过 `Schema.TaggedError` invariant。
//!
//! 本 module 用 `Schema.decodeUnknownEither(UnionSchema)(e)` 解码, 未识别形状降级为
//! `Unknown` (不再 cast)。`instanceof` 各 leaf 的 identity fast-path 避免重复解码
//! 已校验的 instance。
import {
  NotFound,
  Unauthorized,
  Network,
  InvalidConfig,
  Database,
  ToolCall,
  SandboxViolation,
  Unknown,
  type AppError,
} from "./errors";
import { Schema } from "effect";

const AppErrorUnion = Schema.Union(
  NotFound,
  Unauthorized,
  Network,
  InvalidConfig,
  Database,
  ToolCall,
  SandboxViolation,
  Unknown,
);

/** Decode `unknown` (legacy `{kind, _tag, message, ...}` plain object or instance)
 *  to a Schema.TaggedError leaf instance. Falls back to `Unknown` for unrecognised shapes. */
export const decodeAppError = (u: unknown): AppError => {
  if (u instanceof NotFound) {return u;}
  if (u instanceof Unauthorized) {return u;}
  if (u instanceof Network) {return u;}
  if (u instanceof InvalidConfig) {return u;}
  if (u instanceof Database) {return u;}
  if (u instanceof ToolCall) {return u;}
  if (u instanceof SandboxViolation) {return u;}
  if (u instanceof Unknown) {return u;}

  // Try decoding as a plain object {kind, _tag, ...} from IPC bridge.
  if (u && typeof u === "object" && ("kind" in u || "_tag" in u)) {
    const decoded = Schema.decodeUnknownEither(AppErrorUnion)(u);
    if (decoded._tag === "Right") {
      return decoded.right;
    }
  }

  // Fallback: Unknown with stringified message.
  const message = u instanceof Error ? u.message : String(u);
  return new Unknown({ message });
};