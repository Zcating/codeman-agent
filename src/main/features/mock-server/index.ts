
import { Effect } from "effect";
import { createServer } from "node:http";
import { readMockServerConfig } from "../../config-service";
import { handleRequest } from "./http-handler";
import { logger } from "../../logger";

// serverResource: 已 acquire 的 server.close 函数，stopMockServer 时调用触发 release
let serverClose: (() => void) | null = null;

export function startMockServer(): void {
  if (serverClose !== null) {
    // idempotent 防重入
    return;
  }

  const cfg = readMockServerConfig();

  if (cfg.isProduction && !cfg.forceEnableInProduction) {
    logger.info(`[mock-server] production mode, skipping (set CODEMAN_MOCK_FORCE=1 to override)`);
    return;
  }

  const host = cfg.host;
  const port = cfg.port;

  // Effect.acquireRelease + Effect.async 桥接 server.listen callback API
  // acquire: createServer -> error 处理 -> listen -> resume(success)
  // listen/运行时错误 -> acquire 失败 -> fiber fail -> runFork log warn
  // release: server.close()
  const serverEffect = Effect.acquireRelease(
    Effect.async<{ close(): void }, Error, never>((resume) => {
      const s = createServer(handleRequest);

      // listen/运行时错误 -> acquire 失败，fiber 以 fail 退出
      s.on("error", (err: Error) => {
        resume(Effect.fail(err));
      });

      s.listen(port, host, () => {
        // listen 成功，acquire 完成
        resume(Effect.succeed({ close: () => s.close() }));
      });

      // cleanup: 若 listen 从未被调用，同步关闭（理论上不会发生）
      return Effect.sync(() => {
        s.close();
      });
    }),
    (resource, _exit) => Effect.sync(() => resource.close()),
  );

  // fork 出去: acquire -> 存入 module 变量 -> Effect.never 挂起让 scope 保持打开
  Effect.runFork(
    serverEffect.pipe(
      Effect.andThen((resource) => {
        serverClose = resource.close;
        // 挂起: fiber 持续运行，scope 保持打开，server 正常运行
        return Effect.never;
      }),
      Effect.scoped,
    ),
  );

  // 启动信息（listen 成功/失败由 fork 的 fiber 内部处理）
  logger.info(`[mock-server] listening on http://${host}:${port} (POST /mock/anthropic/v1/messages)`);
}

export function stopMockServer(): Promise<void> {
  if (serverClose === null) {
    return Promise.resolve();
  }
  const close = serverClose;
  serverClose = null;
  // 触发 release: server.close() 被调用
  Effect.runFork(Effect.sync(() => close()));
  return Promise.resolve();
}
