//! Settings feature 的 debounced save coordinator (ADR-0015 V1.7+).
//!
//! 架构约束：
//! - debounce 逻辑从 app.store 移到这里（Settings feature 层）
//! - 使用 es-toolkit 的 debounce（500ms 防抖）
//! - 模块级单例：所有 Settings UI 组件（ProviderCard / WorkspaceCard / SettingsPage）
//!   共享同一个 debounce 实例。
//!
//! 用法：
//!   import { settingsSaver } from "../lib/settings-saver";
//!   appStore.set({...});           // 同步 state 更新
//!   settingsSaver.scheduleSave();    // 调度 500ms 后 flush
//!
//!   settingsSaver.flushNow();        // 跳过 debounce，立即 flush（footer Save）

import { debounce } from "es-toolkit";
import { Effect } from "effect";
import { appStore } from "../../../shared/stores/app.store";

const DEBOUNCE_MS = 500;

const debouncedFlushFn = debounce(() => {
  Effect.runPromise(appStore.forceFlush()).catch((e: unknown) => {
    console.error("[settingsSaver] debounced flush failed:", e);
  });
}, DEBOUNCE_MS);

export const settingsSaver = {
  /** 调度 500ms 后 flush 到后端。多次调用会重置 timer。 */
  scheduleSave(): void {
    debouncedFlushFn();
  },

  /** 取消 pending debounce timer，不触发 flush。 */
  cancelPending(): void {
    debouncedFlushFn.cancel();
  },

  /** 跳过 debounce，立即 flush 到后端（footer Save 用）。返回 Promise<void>。 */
  flushNow(): Promise<void> {
    return Effect.runPromise(appStore.forceFlush());
  },
};

/** Test-only: reset internal state (called from settings-saver.test.ts). */
export function _resetSettingsSaverForTest(): void {
  debouncedFlushFn.cancel();
}
