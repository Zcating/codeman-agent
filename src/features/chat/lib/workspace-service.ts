import { Context, Effect, Layer } from "effect";
import { invoke as ipcInvoke } from "../../../shared/lib/ipc";
import { logger } from "../../../shared/lib/logger";
import type { AppError, Workspace } from "../../../shared/lib/types";

export class WorkspaceService extends Context.Tag("WorkspaceService")<WorkspaceService, {
  readonly list: () => Effect.Effect<Workspace[], AppError>;
  readonly add: (label: string, rootPath: string) => Effect.Effect<Workspace, AppError>;
  readonly rename: (id: string, label: string) => Effect.Effect<void, AppError>;
  readonly remove: (id: string) => Effect.Effect<void, AppError>;
  readonly pickPath: () => Effect.Effect<string | null, AppError>;
}>() {}

// V3 IPC: dispatch through shared/lib/ipc.ts (window.codeman) instead of V2
// @tauri-apps/api/core (which reads window.__TAURI_INTERNALS__.invoke, missing
// in V3 Electron).
const invoke = <T>(name: string, args?: Record<string, unknown>): Effect.Effect<T, AppError> =>
  ipcInvoke<T>(name, args).pipe(
    Effect.catchAll((err) => {
      logger.error("Workspace IPC 失败", name, err);
      return Effect.fail(err);
    }),
  ) as Effect.Effect<T, AppError>;

export const WorkspaceServiceLive = Layer.succeed(WorkspaceService, {
  list: () => invoke<Workspace[]>("list_workspaces"),
  add: (label, rootPath) => invoke<Workspace>("add_workspace", { label, root_path: rootPath }),
  rename: (id, label) => invoke<void>("rename_workspace", { id, label }),
  remove: (id) => invoke<void>("delete_workspace", { id }),
  pickPath: () => invoke<string | null>("pick_workspace_path"),
});
