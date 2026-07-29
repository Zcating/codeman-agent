//! 格式化 Effect 错误 (ADR-0016 D3 + ADR-0025 Phase 3).
//!
//! 把 `Cause.Cause<AppError>` 拍平成人类可读字符串。ADR-0025 PR 2 起单源：
//!   - Schema.TaggedError 实例 → 用 `_tag` 判别 (isAppError)。
//!   - TauriError ({ kind: "IPC" }) → fallback 格式化为 `IPC: <message>`。
//! 解决 `String(e)` 打出 "[object Object]" 的反模式。
//!
//! 用法:
//!   const exit = await Effect.runPromiseExit(store.method());
//!   if (Exit.isFailure(exit)) {
//!     setMsg(`Failed: ${formatAppError(exit.cause)}`);
//!   }
import { Cause } from "effect";
import { isAppError, type AppError } from "@codeman-frontend/shared/lib/errors";
import type { TauriError } from "@codeman-frontend/shared/apis";

/** 把 Effect Cause 拍平成人类可读字符串，保留错误判别信息（_tag 或 kind）。 */
export function formatAppError(cause: Cause.Cause<AppError | TauriError>): string {
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

function formatOne(e: AppError | TauriError): string {
  // ADR-0025 PR 2: AppError 是 Schema.TaggedError 实例。
  if (isAppError(e)) {
    return `${e._tag}: ${e.message || "(no message)"}`;
  }
  // TauriError fallback ({ kind: "IPC" }) — not part of AppError union.
  // ADR-0025 PR 2: TauriError stays as-is with kind: "IPC" literal.
  if (
    e &&
    typeof e === "object" &&
    "kind" in e &&
    (e as { kind: unknown }).kind === "IPC"
  ) {
    return `IPC: ${(e as { message: unknown }).message || "(no message)"}`;
  }
  return String(e);
}
