//! logger — 统一前端日志输出（ADR-0018）。
//!
//! API 形状与 `console.*` 1:1，迁移成本最低：
//!
//! ```ts
//! import { logger } from "@codeman-frontend/shared/lib/logger";
//!
//! logger.debug("调试信息", { foo: 1 });
//! logger.info("刷新 settings 成功", { providers: 2 });
//! logger.warn("settings 加载失败，使用默认值", error);
//! logger.error("IPC get_settings 失败", command, error);
//! ```
//!
//! 每条日志加 `[LEVEL]` 前缀便于 devtools grep（`[INFO]` / `[WARN]` /
//! `[ERROR]` / `[DEBUG]`）。前缀是协议性标识（类似 log4j 的 `%-5p`），
//! 保持英文以保证 grep 一致性；msg 参数本体仍走中文（ADR-0009 §4）。
//!
//! 设计取舍：
//!
//! - **不**做结构化 `LogCtx`：与 `console.*` 不同形会破坏 simple API 优势。
//! - **不**做 `api_key` 自动 redact：依赖 developer 自觉
//!   （详见 ADR-0018 D6 降级理由）。
//! - **不**做 caller location 显示：production 噪音 + `Error.stack` 开销。
//! - **不**做 sink 抽象：当前唯一 sink 是 `console.*`，未来要加 IPC 写后端
//!   log 再开接口。
//!
//! 反模式（`src/AGENTS.md` 反模式段，ADR-0018 D5）：
//!
//! - UI 层禁止新增 `console.log` / `console.error` / `console.warn` /
//!   `console.debug`，全部走 `logger.*`。
//! - 后端禁止 `eprintln!` / `println!`，全部走 `log::{info, warn, error}`。

/** 日志级别。4 档，对齐 Rust `log::Level` 子集（debug / info / warn / error）。 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** 把 args 分发到对应 `console.*` 方法。 */
function emit(level: LogLevel, args: readonly unknown[]): void {
  const first = args[0];
  // 4 个 `console.*` 直接对应，无需 switch；但 `noFallthroughCasesInSwitch`
  // 要求显式 return，所以走 switch 而非映射对象。
  // 第一参数是 string 时，prefix 加在前面；不是 string 时 prefix 单独一个
  // console 参数，保持 console 原生行为（不让 [LEVEL] 黏在对象前）。
  switch (level) {
    case "debug":
      if (typeof first === "string") {
        console.debug(`[DEBUG] ${first}`, ...args.slice(1));
      } else {
        console.debug("[DEBUG]", ...args);
      }
      return;
    case "info":
      if (typeof first === "string") {
        console.info(`[INFO] ${first}`, ...args.slice(1));
      } else {
        console.info("[INFO]", ...args);
      }
      return;
    case "warn":
      if (typeof first === "string") {
        console.warn(`[WARN] ${first}`, ...args.slice(1));
      } else {
        console.warn("[WARN]", ...args);
      }
      return;
    case "error":
      if (typeof first === "string") {
        console.error(`[ERROR] ${first}`, ...args.slice(1));
      } else {
        console.error("[ERROR]", ...args);
      }
      return;
  }
}

/** 统一日志入口。 */
export const logger = {
  debug(...args: readonly unknown[]): void {
    emit("debug", args);
  },
  info(...args: readonly unknown[]): void {
    emit("info", args);
  },
  warn(...args: readonly unknown[]): void {
    emit("warn", args);
  },
  error(...args: readonly unknown[]): void {
    emit("error", args);
  },
};
