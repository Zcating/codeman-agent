//! McpService domain (ADR-0032) — extracted from ipc.ts for domain split.
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

// ─── McpService tag ─────────────────────────────────────────

// MCP client service (ADR-0032) — wraps the 6 MCP IPC channels.
export class McpService extends Context.Tag("McpService")<
  McpService,
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

// ─── McpService live layer ──────────────────────────────────

export const McpServiceLive = Layer.succeed(McpService, {
  listServers: () => invoke<McpServerInfo[]>("mcp:list-servers"),
  getTools: (serverName: string) => invoke<McpTool[]>("mcp:get-tools", { serverName }),
  getAllTools: () => invoke<McpToolEntry[]>("mcp:get-all-tools"),
  enable: (serverName: string, enabled: boolean) =>
    invoke<void>("mcp:enable", { serverName, enabled }),
  restart: (serverName: string) => invoke<void>("mcp:restart", { serverName }),
  callTool: (serverName: string, toolName: string, args: unknown) =>
    invoke<unknown>("mcp:call-tool", { serverName, toolName, args }),
  openConfigDir: () => invoke<void>("mcp:open-config-dir"),
});
