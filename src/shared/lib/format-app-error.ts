//! 格式化 Effect 错误 (ADR-0016 D3 + ADR-0025 Phase 3 双源).
//!
//! 把 `Cause.Cause<AppError>` 拍平成人类可读字符串。ADR-0025 起支持双源：
//!   1. 新 Schema.TaggedError 实例 → 用 `_tag` 判别 (isAppError)。
//!   2. 旧 `{ kind }` 判别联合 (LegacyAppErrorUnion) → fallback 到 `kind` 字段。
//! 解决 `String(e)` 打出 "[object Object]" 的反模式。
//!
//! 用法:
//!   const exit = await Effect.runPromiseExit(store.method());
//!   if (Exit.isFailure(exit)) {
//!     setMsg(`Failed: ${formatAppError(exit.cause)}`);
//!   }
import { Cause } from "effect";
import { isAppError, type AppError } from "./errors";
import type { LegacyAppErrorUnion } from "./types";

/** 接受新 Schema.TaggedError 实例或旧 `{ kind }` 对象（PR1→PR2 过渡窗口）。 */
type AnyAppError = AppError | LegacyAppErrorUnion;

/** 把 Effect Cause 拍平成人类可读字符串，保留错误判别信息（_tag 或 kind）。 */
export function formatAppError(cause: Cause.Cause<AnyAppError>): string {
  // Cause.failures 提取所有 failure，按出现顺序排列。
  // Empty cause → []；单个 fail → [err]；Sequential/Parallel → 多个 err。
  const failures = Cause.failures(cause);
  if (failures.length === 0) {
    // 没有 failure: 可能是 empty / interrupt / defect
    if (Cause.isInterrupted(cause)) {
      return "Interrupted";
    }
    return `Defect: ${String(Cause.squash(cause))}`;
  }
  return Array.from(failures).map(formatOne).join("; ");
}

function formatOne(e: AnyAppError): string {
  // 1. 新 Schema.TaggedError 实例：用 _tag 判别。
  //    注意 `message` 与 Error.prototype.message 冲突：可选 message 缺省时为 ""，
  //    故用 `||`（非 `??`）把空串也归为 "(no message)"。
  if (isAppError(e)) {
    return `${e._tag}: ${e.message || "(no message)"}`;
  }
  // 2. 旧 { kind } 对象 fallback（PR1→PR2 窗口）。
  if (
    e &&
    typeof e === "object" &&
    "kind" in e &&
    typeof (e as { kind: unknown }).kind === "string"
  ) {
    const err = e as { kind: string; message?: string };
    return `${err.kind}: ${err.message ?? "(no message)"}`;
  }
  return String(e);
}
