/**
 * src/main/features/mcp/mcp-manager.ts
 *
 * PR-γ : McpManager class → `createMcpManager()` factory 形式。
 * 配置相关方法（startAll / restart / setEnabled）改为 Effect-returning，
 * R 通道要求 FileSystem.FileSystem | Path.Path。读 config 失败按
 * "config 读不出 → 视为空配置" 容错（startAll）或映射为 AppBackendError。
 *
 * 与原 class 实现的差异：
 * - 状态从私有字段 (#servers / #configs / #started) 改为工厂闭包捕获
 * - 配置 IO 走 readMcpConfig / writeMcpConfig（PR-γ 后的 Effect API）
 * - 错误统一映射到 AppBackendError（不依赖 renderer 端的 AppError）
 * - swapServer / stopAndRemove 是工厂内私有 async helper
 */
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import { shell } from "electron";
import { Effect } from "effect";
import { logger } from "../../logger";
import { McpStdioServer } from "./mcp-host";
import type {
  McpServerConfig,
  McpServerStatus,
  McpTool,
  McpCallResult,
} from "./mcp-types";
import { mcpAgentName } from "./mcp-types";
import {
  MCP_CONFIG_PATH,
  readMcpConfig,
  writeMcpConfig,
  type McpConfigFile,
} from "./mcp-config";
import {
  AppBackendError,
  JsonRpcProtocolError,
  NotFound,
  type AppBackendError as AppBackendErrorT,
} from "../../lib/errors.js";

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

export interface McpServerInfo {
  config: McpServerConfig;
  status: McpServerStatus;
  tools: McpTool[];
}

export interface McpToolEntry {
  serverName: string;
  agentName: string;
  toolName: string;
  description: string;
  inputSchema: unknown;
}

const DISABLED_STATUS = { kind: "disabled" } as const;
const EMPTY_CONFIG: McpServerConfig = {
  name: "",
  command: "",
  args: [],
  enabled: false,
};

/**
 * McpManager — 工厂返回的 interface（per PR-γ ADR-0058）：
 * - 配置相关方法：Effect-returning，R = FileSystem.FileSystem | Path.Path，
 *   E = AppBackendError。
 * - 与 config 无关的查询/同步方法：保持原 Promise / sync 签名。
 *
 * 消费者（mcp-ipc.ts / index.ts）需要把 Effect 方法用 runMain 桥接回 Promise。
 */
export interface McpManager {
  readonly startAll: () => Effect.Effect<
    void,
    never,
    FileSystem.FileSystem | Path.Path
  >;
  readonly stopAll: () => Promise<void>;
  readonly restart: (
    name: string,
  ) => Effect.Effect<
    void,
    AppBackendErrorT,
    FileSystem.FileSystem | Path.Path
  >;
  readonly listServers: () => McpServerInfo[];
  readonly listAllTools: () => McpToolEntry[];
  readonly callTool: (
    serverName: string,
    toolName: string,
    args: unknown,
  ) => Promise<McpCallResult>;
  readonly openConfigDir: () => Promise<void>;
  readonly listServerTools: (name: string) => McpTool[];
  readonly setEnabled: (
    name: string,
    enabled: boolean,
  ) => Effect.Effect<
    void,
    AppBackendErrorT,
    FileSystem.FileSystem | Path.Path
  >;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export const createMcpManager = (): McpManager => {
  const servers = new Map<string, McpStdioServer>();
  const configs = new Map<string, McpServerConfig>();
  let started = false;

  const swapServer = async (
    name: string,
    newConfig: McpServerConfig,
  ): Promise<void> => {
    const oldServer = servers.get(name);
    if (oldServer) {
      try {
        await oldServer.stop();
      } catch (e) {
        logger.warn(`[mcp] ${name} stop failed: ${String(e)}`);
      }
    }
    configs.set(name, newConfig);
    const newServer = new McpStdioServer({
      ...newConfig,
      args: [...newConfig.args],
    });
    servers.set(name, newServer);
    await newServer.start();
  };

  const stopAndRemove = async (name: string): Promise<void> => {
    const server = servers.get(name);
    if (!server) {
      return;
    }
    try {
      await server.stop();
    } catch (e) {
      logger.warn(`[mcp] ${name} stop failed: ${String(e)}`);
    }
    servers.delete(name);
  };

  return {
    startAll: Effect.fn("startAll")(function* () {
        if (started) {
          return;
        }
        started = true;

        const config = yield* readMcpConfig().pipe(
          Effect.catchAll((e) =>
            Effect.sync(() => {
              logger.warn(`[mcp] Cannot read config: ${String(e)}`);
              return { version: 1 as const, servers: [] as McpServerConfig[] };
            }),
          ),
        );
        const seenAgentNames = new Map<string, string>();

        for (const cfg of config.servers) {
          configs.set(cfg.name, { ...cfg, args: [...cfg.args] });
          if (!cfg.enabled) {
            continue;
          }

          const server = new McpStdioServer({ ...cfg, args: [...cfg.args] });
          servers.set(cfg.name, server);

          // 把 imperative 块整体塞进 Effect.tryPromise，保留 collision 检测的
          // sync throw 语义。
          yield* Effect.tryPromise({
            try: async () => {
              await server.start();
              for (const tool of server.listTools()) {
                const agentName = mcpAgentName(cfg.name, tool.name);
                const firstServer = seenAgentNames.get(agentName);
                if (firstServer !== undefined) {
                  await server.stop();
                  servers.delete(cfg.name);
                  logger.warn(
                    `[mcp] tool name collision: "${agentName}" —first server="${firstServer}", duplicate server="${cfg.name}"; duplicate stopped per D3`,
                  );
                  throw new JsonRpcProtocolError({
                    message: `duplicate tool name: ${agentName}`,
                    code: -32603,
                  });
                }
                seenAgentNames.set(agentName, cfg.name);
              }
            },
            catch: (e) => e as Error,
          }).pipe(
            Effect.tapError((e) =>
              Effect.sync(() => {
                logger.warn(
                  `[mcp] ${cfg.name} start failed or collision detected: ${String(e)}`,
                );
              }),
            ),
            // swallow errors so startAll's E stays `never`
            Effect.catchAll(() => Effect.void),
          );
        }
      }),

    stopAll: async () => {
      for (const [, server] of servers) {
        try {
          await server.stop();
        } catch (e) {
          logger.warn(
            `[mcp] ${server.getConfig().name} stop failed: ${String(e)}`,
          );
        }
      }
      servers.clear();
      started = false;
    },

    restart: Effect.fn("restart")(function* (name) {
        const config = yield* readMcpConfig().pipe(
          Effect.mapError(
            (e) =>
              new AppBackendError.InvalidConfig({
                field: "mcp_servers.json",
                message: String(e),
              }),
          ),
        );
        const newCfg = config.servers.find((s) => s.name === name);
        if (!newCfg) {
          return yield* Effect.fail(
            new NotFound({
              message: `MCP server not found in config: ${name}`,
            }),
          );
        }
        yield* Effect.tryPromise({
          try: () => swapServer(name, { ...newCfg, args: [...newCfg.args] }),
          catch: (e) =>
            new AppBackendError.Unknown({
              message: `MCP swap failed: ${String(e)}`,
            }),
        });
      }),

    listServers: () => {
      const names = new Set<string>([
        ...configs.keys(),
        ...servers.keys(),
      ]);
      return Array.from(names).map((name) => {
        const server = servers.get(name);
        const config = configs.get(name) ?? server?.getConfig();
        if (!config) {
          return {
            config: { ...EMPTY_CONFIG, name },
            status: DISABLED_STATUS,
            tools: [],
          };
        }
        return {
          config,
          status: server?.getStatus() ?? DISABLED_STATUS,
          tools: server?.listTools() ?? [],
        };
      });
    },

    listAllTools: () => {
      const out: McpToolEntry[] = [];
      for (const [, server] of servers) {
        if (server.getStatus().kind !== "connected") {
          continue;
        }
        const serverName = server.getConfig().name;
        for (const tool of server.listTools()) {
          out.push({
            serverName,
            agentName: mcpAgentName(serverName, tool.name),
            toolName: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          });
        }
      }
      return out;
    },

    callTool: async (serverName, toolName, args) => {
      const server = servers.get(serverName);
      if (!server || server.getStatus().kind !== "connected") {
        throw new JsonRpcProtocolError({
          message: `MCP server not connected: ${serverName}`,
          code: -32603,
        });
      }
      return server.callTool(toolName, args);
    },

    openConfigDir: async () => {
      await shell.openPath(MCP_CONFIG_PATH());
    },

    listServerTools: (name) => {
      const server = servers.get(name);
      if (!server || server.getStatus().kind !== "connected") {
        return [];
      }
      return server.listTools();
    },

    setEnabled: Effect.fn("setEnabled")(function* (name, enabled) {
        const config = yield* readMcpConfig().pipe(
          Effect.mapError(
            (e) =>
              new AppBackendError.InvalidConfig({
                field: "mcp_servers.json",
                message: String(e),
              }),
          ),
        );
        const serverIdx = config.servers.findIndex((s) => s.name === name);
        if (serverIdx < 0) {
          return yield* Effect.fail(
            new NotFound({
              message: `MCP server not found: ${name}`,
            }),
          );
        }

        const updatedServers = config.servers.map((s) => ({
          ...s,
          args: [...s.args],
          ...(s.name === name ? { enabled } : {}),
        }));
        const newConfig: McpConfigFile = {
          version: 1,
          servers: updatedServers,
        };
        yield* writeMcpConfig(newConfig).pipe(
          Effect.mapError(
            (e) =>
              new AppBackendError.Unknown({
                message: `MCP write failed: ${String(e)}`,
              }),
          ),
        );

        configs.set(name, {
          ...config.servers[serverIdx],
          args: [...config.servers[serverIdx].args],
          enabled,
        });

        if (enabled) {
          yield* Effect.tryPromise({
            try: () => swapServer(name, configs.get(name)!),
            catch: (e) =>
              new AppBackendError.Unknown({
                message: `MCP swap failed: ${String(e)}`,
              }),
          });
        } else {
          yield* Effect.tryPromise({
            try: () => stopAndRemove(name),
            catch: (e) =>
              new AppBackendError.Unknown({
                message: `MCP stop failed: ${String(e)}`,
              }),
          });
        }
      }),
  };
};