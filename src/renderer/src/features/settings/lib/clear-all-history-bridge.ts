//! clear-all-history-bridge — Settings IPC bridge for "clear all history".
//!
//! Rule: `lib/*.ts` 是纯 Effect 函数. Routes consume
//! this bridge instead of importing `effect` + `invoke` directly (which
//! would violate UI layer conventions).

import { Effect } from "effect";
import { invoke } from "@codeman-frontend/shared/lib/ipc";

export const clearAllHistoryBridge = async (): Promise<boolean> => {
  const exit = await Effect.runPromiseExit(
    invoke<void>("clearAllHistory"),
  );
  return exit._tag === "Success";
};