import { Context, Effect, Layer } from "effect";
import { invoke as ipcInvoke, type CodemanApi } from "@shared/apis";
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
 * 规则（shared/ 不能 import features/）。**V3+ 重构**：本服务提升到 shared/lib/。
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

// V3 IPC: dispatch through shared/apis/invoke.api.ts (window.codeman) instead
// of V2 @tauri-apps/api/core (which reads window.__TAURI_INTERNALS__.invoke,
// missing in V3 Electron).
//
// Thin wrapper that adds `logger.error("Workspace IPC 失败", channel, err)`
// on failure (the typed `invoke` already logs once, this gives a workspace-
// domain breadcrumb in addition). Typed as `<R, T extends keyof CodemanApi>`
// to match the V3.2 `invoke` signature.
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