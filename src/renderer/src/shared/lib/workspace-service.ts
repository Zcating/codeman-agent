import { Context, Effect, Layer } from "effect";
import { invoke as ipcInvoke } from "@codeman-frontend/shared/lib/ipc";
import { logger } from "@codeman-frontend/shared/lib/logger";
import type { AppError } from "@codeman-frontend/shared/lib/errors";
import type { Workspace } from "@codeman-frontend/shared/lib/types";

/**
 * V3 ADR-0023 D8-W: Workspace ownership moved from Settings to chat domain
 * (Electron SQLite). Effect Context.Tag + Layer pattern.
 *
 * **历史**：本服务最初位于 `src/features/chat/lib/workspace-service.ts`。
 * 因 `src/shared/stores/app.store.ts` 的 `pickWorkspacePath()` 需要 Effect
 * service 注入（ADR-0016 D4），shared/ 不能 import features/，违反单向依赖
 * 规则（src/shared/AGENTS.md line 52）。**V3+ 重构**：本服务提升到 shared/lib/。
 *
 * **chat domain 仍然消费** `WorkspaceService.list()` / `add()` / `rename()` /
 * `remove()` 渲染 sidebar / home workspace picker。chat.store.ts 现在从
 * `../../shared/lib/workspace-service` import（保持 feature 业务逻辑本地化）。
 */
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
  list: () => invoke<Workspace[]>("listWorkspaces"),
  add: (label, rootPath) => invoke<Workspace>("addWorkspace", { label, rootPath }),
  rename: (id, label) => invoke<void>("renameWorkspace", { id, label }),
  remove: (id) => invoke<void>("deleteWorkspace", { id }),
  pickPath: () => invoke<string | null>("pickWorkspacePath"),
});