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
  scheduleSave(): void {
    debouncedFlushFn();
  },

  cancelPending(): void {
    debouncedFlushFn.cancel();
  },

  flushNow(): Promise<void> {
    return Effect.runPromiseExit(appStore.forceFlush()).then((exit) => {
      if (Exit.isFailure(exit)) {
        throw new Error(formatAppError(exit.cause));
      }
    });
  },
};

export function _resetSettingsSaverForTest(): void {
  debouncedFlushFn.cancel();
}
