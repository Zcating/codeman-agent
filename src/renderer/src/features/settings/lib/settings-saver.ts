import { debounce } from "es-toolkit";
import { Effect, Exit } from "effect";
import { appStore } from "@codeman-frontend/shared/stores/app.store";
import { formatAppError } from "@codeman-frontend/shared/lib/format-app-error";
import { logger } from "@codeman-frontend/shared/lib/logger";

const DEBOUNCE_MS = 500;

const debouncedFlushFn = debounce(() => {
  Effect.runPromiseExit(appStore.forceFlush()).then((exit) => {
    if (Exit.isFailure(exit)) {
      logger.error("[settingsSaver] debounced flush failed:", formatAppError(exit.cause));
    }
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
    return Effect.runPromiseExit(appStore.forceFlush()).then((exit) => {
      if (Exit.isFailure(exit)) {
        throw new Error(formatAppError(exit.cause));
      }
    });
  },
};

/** Test-only: reset internal state (called from settings-saver.test.ts). */
export function _resetSettingsSaverForTest(): void {
  debouncedFlushFn.cancel();
}
