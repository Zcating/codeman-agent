//! 格式化 Effect 错误 (ADR-0016 D3 + formatAppError helper).
//!
//! 把 `Cause.Cause<AppError>` 拍平成人类可读字符串，保留 `AppError.kind` 信息。
//! 解决 `String(e)` 打出 "[object Object]" 的反模式。
//!
//! 用法:
//!   const exit = await Effect.runPromiseExit(store.method());
//!   if (Exit.isFailure(exit)) {
//!     setMsg(`Failed: ${formatAppError(exit.cause)}`);
//!   }
import { Cause } from "effect";
import type { AppError } from "./types";

/** 把 Effect Cause 拍平成人类可读字符串，保留 AppError.kind 信息。 */
export function formatAppError(cause: Cause.Cause<AppError>): string {
  // Cause.failures 提取所有 failure (AppError), 在 cause 中按顺序排列。
  // Empty cause → []
  // 单个 fail → [AppError]
  // Sequential/Parallel → 多个 AppError (按出现顺序)
  const failures = Cause.failures(cause);
  if (failures.length === 0) {
    // 没有 failure: 可能是 empty / interrupt / defect
    if (Cause.isInterrupted(cause)) {
      return "Interrupted";
    }
    // defect
    return `Defect: ${String(Cause.squash(cause))}`;
  }
  return Array.from(failures).map(formatOne).join("; ");
}

function formatOne(e: AppError): string {
  if (e && typeof e === "object" && "kind" in e && typeof (e as { kind: unknown }).kind === "string") {
    const err = e as { kind: string; message?: string };
    return `${err.kind}: ${err.message ?? "(no message)"}`;
  }
  return String(e);
}

