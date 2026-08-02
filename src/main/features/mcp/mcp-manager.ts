import { shell } from "electron";
import { Effect, Exit } from "effect";
import { logger } from "../../logger";
import { McpStdioServer } from "./mcp-host";
import type { McpServerConfig, McpServerStatus, McpTool, McpCallResult } from "./mcp-types";
import { mcpAgentName } from "./mcp-types";
import { MCP_CONFIG_PATH, readMcpConfig, writeMcpConfig } from "./mcp-config";
import { InvalidConfig, JsonRpcProtocolError, NotFound } from "../../../renderer/src/shared/lib/errors";


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

type McpConfigFile = { version: 1; servers: McpServerConfig[] };

const DISABLED_STATUS = { kind: "disabled" } as const;
const EMPTY_CONFIG: McpServerConfig = {
  name: "",
  command: "",
  args: [],
  enabled: false,
};


export class McpManager {
  readonly #servers = new Map<string, McpStdioServer>();
  readonly #configs = new Map<string, McpServerConfig>();
  #started = false;

  async startAll(): Promise<void> {
    if (this.#started) return;
    this.#started = true;

    const exit = await Effect.runPromiseExit(readMcpConfig());
    if (Exit.isFailure(exit)) {
      logger.warn(`[mcp] Cannot read config: ${String(exit.cause)}`);
      return;
    }
    const config = exit.value;
    const seenAgentNames = new Map<string, string>();

    for (const cfg of config.servers) {
      this.#configs.set(cfg.name, cfg);
      if (!cfg.enabled) continue;

      const server = new McpStdioServer(cfg);
      this.#servers.set(cfg.name, server);

      try {
        await server.start();
        for (const tool of server.listTools()) {
          const agentName = mcpAgentName(cfg.name, tool.name);
          const firstServer = seenAgentNames.get(agentName);
          if (firstServer !== undefined) {
            await server.stop();
            this.#servers.delete(cfg.name);
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
      } catch (e) {
        logger.warn(`[mcp] ${cfg.name} start failed or collision detected: ${String(e)}`);
      }
    }
  }

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

  async restart(name: string): Promise<void> {
    const config = await this.#loadConfigOrThrow();
    const newCfg = config.servers.find((s) => s.name === name);
    if (!newCfg) {
      throw new NotFound({ message: `MCP server not found in config: ${name}` });
    }
    await this.#swapServer(name, newCfg);
  }

  listServers(): McpServerInfo[] {
    const names = new Set<string>([...this.#configs.keys(), ...this.#servers.keys()]);
    return Array.from(names).map((name) => {
      const server = this.#servers.get(name);
      const config = this.#configs.get(name) ?? server?.getConfig();
      if (!config) {
        return { config: { ...EMPTY_CONFIG, name }, status: DISABLED_STATUS, tools: [] };
      }
      return {
        config,
        status: server?.getStatus() ?? DISABLED_STATUS,
        tools: server?.listTools() ?? [],
      };
    });
  }

  listAllTools(): McpToolEntry[] {
    const out: McpToolEntry[] = [];
    for (const [, server] of this.#servers) {
      if (server.getStatus().kind !== "connected") continue;
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
  }

  async callTool(serverName: string, toolName: string, args: unknown): Promise<McpCallResult> {
    const server = this.#servers.get(serverName);
    if (!server || server.getStatus().kind !== "connected") {
      throw new JsonRpcProtocolError({
        message: `MCP server not connected: ${serverName}`,
        code: -32603,
      });
    }
    return server.callTool(toolName, args);
  }

  async openConfigDir(): Promise<void> {
    await shell.openPath(MCP_CONFIG_PATH());
  }

  listServerTools(name: string): McpTool[] {
    const server = this.#servers.get(name);
    if (!server || server.getStatus().kind !== "connected") {
      return [];
    }
    return server.listTools();
  }

  async setEnabled(name: string, enabled: boolean): Promise<void> {
    const config = await this.#loadConfigOrThrow();
    const serverIdx = config.servers.findIndex((s) => s.name === name);
    if (serverIdx < 0) {
      throw new NotFound({ message: `MCP server not found: ${name}` });
    }

    const updatedServers = config.servers.map((s) =>
      s.name === name ? { ...s, enabled } : s,
    );
    const newConfig: McpConfigFile = { version: 1, servers: updatedServers };
    await this.#writeConfigOrThrow(newConfig);

    this.#configs.set(name, { ...config.servers[serverIdx], enabled });

    if (enabled) {
      await this.#swapServer(name, this.#configs.get(name)!);
    } else {
      await this.#stopAndRemove(name);
    }
  }


  async #loadConfigOrThrow(): Promise<McpConfigFile> {
    const exit = await Effect.runPromiseExit(readMcpConfig());
    if (Exit.isFailure(exit)) {
      throw new InvalidConfig({ field: "mcp_servers.json", message: String(exit.cause) });
    }
    return exit.value;
  }

  async #writeConfigOrThrow(config: McpConfigFile): Promise<void> {
    const exit = await Effect.runPromiseExit(writeMcpConfig(config));
    if (Exit.isFailure(exit)) {
      throw new InvalidConfig({ field: "mcp_servers.json", message: String(exit.cause) });
    }
  }

  async #swapServer(name: string, newConfig: McpServerConfig): Promise<void> {
    const oldServer = this.#servers.get(name);
    if (oldServer) {
      try { await oldServer.stop(); } catch (e) { logger.warn(`[mcp] ${name} stop failed: ${String(e)}`); }
    }
    this.#configs.set(name, newConfig);
    const newServer = new McpStdioServer(newConfig);
    this.#servers.set(name, newServer);
    await newServer.start();
  }

  async #stopAndRemove(name: string): Promise<void> {
    const server = this.#servers.get(name);
    if (!server) return;
    try { await server.stop(); } catch (e) { logger.warn(`[mcp] ${name} stop failed: ${String(e)}`); }
    this.#servers.delete(name);
  }
}