import { Cause, Exit, ManagedRuntime } from "effect";
import { DbLive } from "./db/mod.js";

// PR-3: DbLive 已挂进 MainLive，后续域服务继续往 MainLive 合并
export const MainLive = DbLive;
export const mainRuntime = ManagedRuntime.make(MainLive);

/**
 * 边界 helper:runPromiseExit + Cause.squash 让 typed error 原样上抛。
 * runPromise 会包 FiberFailure，不满足"error 原样上抛"契约。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function runMain(effect: any): Promise<any> {
  return mainRuntime.runPromiseExit(effect).then((exit) => {
    if (Exit.isFailure(exit)) {
      throw Cause.squash(exit.cause);
    }
    return exit.value;
  });
}
