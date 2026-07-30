//! McpApi domain — extracted from ipc.ts for domain split.
//!
//! Wraps the 6 MCP IPC channels: mcpListServers, mcpGetTools, mcpGetAllTools,
//! mcpEnable, mcpRestart, mcpCallTool, mcpOpenConfigDir.

import { Effect, Layer, Context } from "effect";
import { invoke } from "./invoke.api";
import type {
  McpServerInfo,
  McpTool,
  McpToolEntry,
} from "@codeman-frontend/shared/lib/types";
import type { AppError } from "@codeman-frontend/shared/lib/errors";

export class McpApi extends Context.Tag("McpApi")<
  McpApi,
  {
    readonly listServers: () => Effect.Effect<McpServerInfo[], AppError>;
    readonly getTools: (serverName: string) => Effect.Effect<McpTool[], AppError>;
    readonly getAllTools: () => Effect.Effect<McpToolEntry[], AppError>;
    readonly enable: (serverName: string, enabled: boolean) => Effect.Effect<void, AppError>;
    readonly restart: (serverName: string) => Effect.Effect<void, AppError>;
    readonly callTool: (serverName: string, toolName: string, args: unknown) => Effect.Effect<unknown, AppError>;
    readonly openConfigDir: () => Effect.Effect<void, AppError>;
  }
>() {}

export const McpApiLive = Layer.succeed(McpApi, {
  listServers: () => invoke<McpServerInfo[]>("mcpListServers"),
  getTools: (serverName: string) => invoke<McpTool[]>("mcpGetTools", { serverName }),
  getAllTools: () => invoke<McpToolEntry[]>("mcpGetAllTools"),
  enable: (serverName: string, enabled: boolean) =>
    invoke<void>("mcpEnable", { serverName, enabled }),
  restart: (serverName: string) => invoke<void>("mcpRestart", { serverName }),
  callTool: (serverName: string, toolName: string, args: unknown) =>
    invoke<unknown>("mcpCallTool", { serverName, toolName, args }),
  openConfigDir: () => invoke<void>("mcpOpenConfigDir"),
});
