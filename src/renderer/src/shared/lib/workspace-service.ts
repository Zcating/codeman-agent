import { Context, Effect, Layer } from "effect";
import { invoke as ipcInvoke, type CodemanApi } from "@codeman-frontend/shared/apis";
import { logger } from "@codeman-frontend/shared/lib/logger";
import type { AppError } from "@codeman-frontend/shared/lib/errors";
import type { Workspace } from "@codeman-frontend/shared/lib/types";


export class WorkspaceService extends Context.Tag("WorkspaceService")<WorkspaceService, {
  readonly list: () => Effect.Effect<Workspace[], AppError>;
  readonly add: (label: string, rootPath: string) => Effect.Effect<Workspace, AppError>;
  readonly rename: (id: string, label: string) => Effect.Effect<void, AppError>;
  readonly remove: (id: string) => Effect.Effect<void, AppError>;
  readonly pickPath: () => Effect.Effect<string | null, AppError>;
}>() { }









const invoke = <
  R = unknown,
  T extends keyof CodemanApi = keyof CodemanApi,
>(
  channel: T,
  args?: Parameters<CodemanApi[T]>[0],
): Effect.Effect<R, AppError> =>
  ipcInvoke<R, T>(channel, args).pipe(
    Effect.catchAll((err) => {
      logger.error("Workspace IPC 失败", channel, err);
      return Effect.fail(err);
    }),
  );

export const WorkspaceServiceLive = Layer.succeed(WorkspaceService, {
  list: () => invoke<Workspace[]>("listWorkspaces"),
  add: (label, rootPath) => invoke<Workspace>("addWorkspace", { label, rootPath }),
  rename: (id, label) => invoke<void>("renameWorkspace", { id, label }),
  remove: (id) => invoke<void>("deleteWorkspace", { id }),
  pickPath: () => invoke<string | null>("pickWorkspacePath"),
});