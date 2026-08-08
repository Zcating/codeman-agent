import { Cause, Exit, Layer, ManagedRuntime } from "effect";
import * as NodePath from "@effect/platform-node/NodePath";
import { DbLive } from "./db/mod.js";
import { NodeFileSystemLive } from "./lib/file-system-node.js";

/**
 * MainLive — src/main 的顶层 Effect Layer。
 *
 * PR-3 (ADR-0046): DbLive 提供 SqlClient + SqliteClient + 迁移执行。
 *
 * PR-α (ADR-0058): 挂载 NodeFileSystemLive 与 NodePath.layer，使所有
 * `Effect.gen(... yield* FileSystem.FileSystem ...)` /
 * `yield* Path.Path` 调用无须在 MainLive 之外补 service。
 *
 * - `NodeFileSystemLive` 是 src/main 内自实现的 fs adapter（绕过
 *   @effect/platform-node-shared@0.61.1 的 SystemError arrow-function bug），
 *   仅暴露 10 个字节/元数据方法 + copyFile，其余方法抛 BadArgument。
 *   详见 src/main/lib/file-system-node.ts。
 * - `NodePath` 走 `@effect/platform-node/NodePath` submodule 而非 barrel，
 *   避免触发 NodeClusterHttp → @effect/cluster HttpLayerRouter peer dep
 *   mismatch (ADR-0058 D5)。
 *
 * 顶层 R 收敛：DbLive（PR-δ 后 MigrationsLive 也 Layer.provide(NodeFileSystemLive)）
 * + NodeFileSystemLive（R=never）+ NodePath.layer（R=never）→ R=never。
 */
export const MainLive = DbLive.pipe(
  Layer.provideMerge(NodeFileSystemLive),
  Layer.provideMerge(NodePath.layer),
);
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
