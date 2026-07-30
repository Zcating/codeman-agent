
import { shell } from "electron";
import { Effect, Exit } from "effect";
import { logger } from "./logger";
import { McpStdioServer, type McpServerConfig, type McpServerStatus, type McpTool, type McpCallResult } from "./mcp-host";
import { MCP_CONFIG_PATH, readMcpConfig, writeMcpConfig } from "./mcp-config";
import { InvalidConfig, JsonRpcProtocolError, NotFound } from "../renderer/src/shared/lib/errors";

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
          const agentName = `mcp_${slug(server.getConfig().name)}_${slug(tool.name)}`;
          if (seenAgentNames.has(agentName)) {
            const firstServer = seenAgentNames.get(agentName)!;
            await server.stop();
            this.#servers.delete(cfg.name);
            logger.warn(
              `[mcp] tool name collision: "${agentName}" — first server="${firstServer}", duplicate server="${cfg.name}"; duplicate stopped per D3`,
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
    const exit = await Effect.runPromiseExit(readMcpConfig());
    if (Exit.isFailure(exit)) {
      throw new InvalidConfig({ field: "mcp_servers.json", message: String(exit.cause) });
    }
    const config = exit.value;
    const newCfg = config.servers.find((s) => s.name === name);
    if (!newCfg) {
      throw new NotFound({ message: `MCP server not found in config: ${name}` });
    }

    const oldServer = this.#servers.get(name);
    if (oldServer) {
      try { await oldServer.stop(); } catch (e) { logger.warn(`[mcp] ${name} stop failed: ${String(e)}`); }
    }

    this.#configs.set(name, newCfg);
    const newServer = new McpStdioServer(newCfg);
    this.#servers.set(name, newServer);
    await newServer.start();
  }

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

  listAllTools(): McpToolEntry[] {
    const out: McpToolEntry[] = [];
    for (const [, server] of this.#servers) {
      if (server.getStatus().kind !== "connected") continue;
      for (const tool of server.listTools()) {
        const agentName = `mcp_${slug(server.getConfig().name)}_${slug(tool.name)}`;
        out.push({
          serverName: server.getConfig().name,
          agentName,
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
    const readExit = await Effect.runPromiseExit(readMcpConfig());
    if (Exit.isFailure(readExit)) {
      throw new InvalidConfig({ field: "mcp_servers.json", message: String(readExit.cause) });
    }
    const config = readExit.value;
    const serverIdx = config.servers.findIndex((s) => s.name === name);
    if (serverIdx < 0) {
      throw new NotFound({ message: `MCP server not found: ${name}` });
    }

    const updatedServers = config.servers.map((s) =>
      s.name === name ? { ...s, enabled } : s,
    );
    const newConfig = { version: config.version as 1, servers: updatedServers };

    const writeExit = await Effect.runPromiseExit(writeMcpConfig(newConfig));
    if (Exit.isFailure(writeExit)) {
      throw new InvalidConfig({ field: "mcp_servers.json", message: String(writeExit.cause) });
    }

    this.#configs.set(name, { ...config.servers[serverIdx], enabled });

    if (enabled) {
      const oldServer = this.#servers.get(name);
      if (oldServer) {
        try { await oldServer.stop(); } catch (e) { logger.warn(`[mcp] ${name} stop failed: ${String(e)}`); }
      }
      const newServer = new McpStdioServer(this.#configs.get(name)!);
      this.#servers.set(name, newServer);
      await newServer.start();
    } else {
      const server = this.#servers.get(name);
      if (server) {
        try { await server.stop(); } catch (e) { logger.warn(`[mcp] ${name} stop failed: ${String(e)}`); }
        this.#servers.delete(name);
      }
    }
  }
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unnamed";
}