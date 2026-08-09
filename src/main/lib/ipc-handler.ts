import { ipcMain, type IpcMainInvokeEvent } from "electron";
import type { Effect } from "effect";
import { runMain } from "../runtime.js";

/**
 * Register an IPC handler whose body returns an Effect.
 *
 * The bug fixed in commit 96bdfd5 (`await someEffect()` returns the
 * Effect description object itself — `await` only unwraps Promises) was
 * structurally easy to write. This helper enforces the runMain wrap at
 * the call site: the body MUST return Effect.Effect<A, E, R>, and the
 * helper routes through runMain before handing the resolved value to
 * Electron's structured-clone layer.
 *
 * R is `any` because MainLive (DbLive + NodeFileSystemLive + NodePath.layer)
 * provides the common service stack; the caller doesn't need to specify
 * individual service requirements.
 *
 * Use this instead of raw `ipcMain.handle(...)` whenever the handler
 * runs an Effect. Mirrors preload's `automationsSendLlmResult: (p) =>
 * ipcRenderer.send(...)` pattern — function signature itself prevents
 * misuse.
 *
 * @example
 *   registerEffectHandler("skillsScan", () => listSkills());
 *   registerEffectHandler("skillsLoad", (args: { name: string }) =>
 *     readSkillFile(args.name),
 *   );
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerEffectHandler<A, E, TArgs extends any[] = [], R = any>(
  channel: string,
  fn: (...args: TArgs) => Effect.Effect<A, E, R>,
): void {
  ipcMain.handle(channel, (_event: IpcMainInvokeEvent, ...args: unknown[]) => {
    // `as TArgs` is required because Electron types the handler args as
    // unknown[]; the contract here is that callers declare TArgs matching
    // the IPC payload shape (renderer → preload → main).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return runMain((fn as any)(...args));
  });
}