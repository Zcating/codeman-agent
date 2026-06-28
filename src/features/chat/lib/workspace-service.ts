import { Context, Effect, Layer } from "effect";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { logger } from "../../../shared/lib/logger";
import type { AppError, Workspace } from "../../../shared/lib/types";

export class WorkspaceService extends Context.Tag("WorkspaceService")<WorkspaceService, {
  readonly list: () => Effect.Effect<Workspace[], AppError>;
  readonly add: (label: string, rootPath: string) => Effect.Effect<Workspace, AppError>;
  readonly rename: (id: string, label: string) => Effect.Effect<void, AppError>;
  readonly remove: (id: string) => Effect.Effect<void, AppError>;
  readonly pickPath: () => Effect.Effect<string | null, AppError>;
}>() {}

// Internal invoke wrapper (NOT exported)
const invoke = <T>(name: string, args?: Record<string, unknown>): Effect.Effect<T, AppError> =>
  Effect.tryPromise({
    try: () => tauriInvoke<T>(name, args),
    catch: (e) => {
      if (e && typeof e === "object" && "kind" in e) return e as AppError;
      logger.error("Workspace IPC 失败", name, e);
      return { kind: "Unknown" as const, message: String(e) } as AppError;
    },
  });

export const WorkspaceServiceLive = Layer.succeed(WorkspaceService, {
  list: () => invoke<Workspace[]>("list_workspaces"),
  add: (label, rootPath) => invoke<Workspace>("add_workspace", { label, root_path: rootPath }),
  rename: (id, label) => invoke<void>("rename_workspace", { id, label }),
  remove: (id) => invoke<void>("delete_workspace", { id }),
  pickPath: () => invoke<string | null>("pick_workspace_path"),
});
