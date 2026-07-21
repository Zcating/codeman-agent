//! V3.1 MCP — McpManager: multi-server lifecycle (ADR-0032 D3).
//!
//! Manages multiple McpStdioServer instances (one per configured MCP server).
//! Loads config from `~/.agents/mcp_servers.json`, starts all enabled servers,
//! routes tool calls by name, exposes status snapshot for IPC + UI.
//!
//! Tool name collision: if two enabled servers expose the same
//! `mcp_<server>_<tool>` name, the second server is rejected at start time
//! and marked `protocol_error` (per ADR-0032 D8).

import { shell } from "electron";
import { Effect, Exit } from "effect";
import { logger } from "./logger";
import { McpStdioServer, type McpServerConfig, type McpServerStatus, type McpTool, type McpCallResult } from "./mcp-host";
import { MCP_CONFIG_PATH, readMcpConfig } from "./mcp-config";
import { InvalidConfig, JsonRpcProtocolError } from "../../src/shared/lib/errors";

export interface McpServerInfo {
  config: McpServerConfig;
  status: McpServerStatus;
  tools: McpTool[];
}

export interface McpToolEntry {
  serverName: string;
  agentName: string; // mcp_<server>_<tool>
  description: string;
  inputSchema: unknown;
}

export class McpManager {
  readonly #servers = new Map<string, McpStdioServer>();
  readonly #configs = new Map<string, McpServerConfig>();
  #started = false;

  /** Start all enabled servers from the config file. Idempotent. */
  async startAll(): Promise<void> {
    if (this.#started) return;
    this.#started = true;

    const exit = await Effect.runPromiseExit(readMcpConfig());
    if (Exit.isFailure(exit)) {
      logger.warn(`[mcp] Cannot read config: ${String(exit.cause)}`);
      return;
    }
    const config = exit.value;

    for (const cfg of config.servers) {
      this.#configs.set(cfg.name, cfg);
      if (!cfg.enabled) continue;

      const server = new McpStdioServer(cfg);
      this.#servers.set(cfg.name, server);

      try {
        await server.start();
      } catch (e) {
        logger.warn(`[mcp] ${cfg.name} start failed: ${String(e)}`);
      }
    }
  }

  /** Stop all running servers. */
  async stopAll(): Promise<void> {
    for (const [, server] of this.#servers) {
      try {
        await server.stop();
      } catch (e) {
        logger.warn(`[mcp] ${server.getConfig().name} stop failed: ${String(e)}`);
      }
    }
    this.#servers.clear();
    this.#started = false;
  }

  /** Restart a specific server. */
  async restart(name: string): Promise<void> {
    const server = this.#servers.get(name);
    if (!server) {
      throw new InvalidConfig({ field: "name", message: `MCP server not found: ${name}` });
    }
    await server.stop();
    await server.start();
  }

  /** Get info for all configured servers (enabled + disabled). */
  listServers(): McpServerInfo[] {
    const all = new Set<string>();
    for (const name of this.#configs.keys()) all.add(name);
    for (const name of this.#servers.keys()) all.add(name);
    return Array.from(all).map((name) => {
      const server = this.#servers.get(name);
      const config = this.#configs.get(name) ?? server?.getConfig();
      if (!config) {
        return {
          config: { name, command: "", args: [], enabled: false },
          status: { kind: "disabled" } as const,
          tools: [],
        };
      }
      return {
        config,
        status: server?.getStatus() ?? ({ kind: "disabled" } as const),
        tools: server?.listTools() ?? [],
      };
    });
  }

  /**
   * Collect all tool entries from connected servers. Each entry's
   * `agentName` follows ADR-0032 D8: `mcp_<server-slug>_<tool-slug>`.
   * Duplicate agentName → second entry wins, first is dropped (logged warning).
   */
  listAllTools(): McpToolEntry[] {
    const out: McpToolEntry[] = [];
    const seen = new Set<string>();
    for (const [, server] of this.#servers) {
      if (server.getStatus().kind !== "connected") continue;
      for (const tool of server.listTools()) {
        const agentName = `mcp_${slug(server.getConfig().name)}_${slug(tool.name)}`;
        if (seen.has(agentName)) {
          logger.warn(
            `[mcp] tool name collision: ${agentName} (server="${server.getConfig().name}", tool="${tool.name}"); skipping duplicate`,
          );
          continue;
        }
        seen.add(agentName);
        out.push({
          serverName: server.getConfig().name,
          agentName,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
      }
    }
    return out;
  }

  /** Call a tool by its agent name. */
  async callTool(agentName: string, args: unknown): Promise<McpCallResult> {
    // agentName format: mcp_<server>_<tool>
    const match = agentName.match(/^mcp_(.+?)_(.+)$/);
    if (!match) {
      throw new JsonRpcProtocolError({
        message: `Invalid MCP agent tool name: ${agentName}`,
        code: -32600,
      });
    }
    const [, serverName, toolName] = match;
    const server = this.#servers.get(serverName);
    if (!server || server.getStatus().kind !== "connected") {
      throw new JsonRpcProtocolError({
        message: `MCP server not connected: ${serverName}`,
        code: -32603,
      });
    }
    return server.callTool(toolName, args);
  }

  /** Open `~/.agents/` in the OS file manager. */
  async openConfigDir(): Promise<void> {
    await shell.openPath(MCP_CONFIG_PATH());
  }
}

/** Lowercase + non-alphanumeric → `_`. Empty string fallback. */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unnamed";
}