import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawn, type ChildProcess } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { Effect, Layer } from "effect";
import * as NodePathModule from "@effect/platform-node/NodePath";
import { JsonRpcConnection } from "../../jsonrpc";
import { NodeFileSystemLive } from "../../lib/file-system-node";
import { readMcpConfig } from "../../features/mcp/mcp-config";

interface InitializeResult {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  serverInfo: { name: string; version: string };
}

interface ToolsListResult {
  tools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
}

interface ToolsCallResult {
  content: Array<{ type: string; text?: string }>;
}

const PROTOCOL_VERSION = "2024-11-05";
const CLIENT_INFO = { name: "codeman-agent", version: "0.3.0" as const };

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unnamed";
}

function mcpAgentName(serverName: string, toolName: string): string {
  return `mcp_${slug(serverName)}_${slug(toolName)}`;
}

class StdioTransport {
  #child: ChildProcess | null = null;
  #stdin: Writable | null = null;
  #stdout: Readable | null = null;

  constructor(
    readonly command: string,
    readonly args: string[],
    readonly env: Record<string, string> | undefined,
    readonly spawnFn: typeof spawn = spawn,
  ) {}

  start(): void {
    const child = this.spawnFn(this.command, this.args, {
      env: { ...process.env, ...this.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.#child = child;
    this.#stdin = child.stdin;
    this.#stdout = child.stdout;
  }

  get stdin(): Writable | null {
    return this.#stdin;
  }

  get stdout(): Readable | null {
    return this.#stdout;
  }

  kill(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.#child || this.#child.killed) {
        this.#child = null;
        resolve();
        return;
      }
      this.#child.once("exit", () => {
        this.#child = null;
        resolve();
      });
      this.#child.kill("SIGTERM");
      setTimeout(() => {
        if (this.#child && !this.#child.killed) {
          this.#child.kill("SIGKILL");
        }
      }, 5000);
    });
  }
}

async function performHandshake(
  connection: JsonRpcConnection,
): Promise<Array<{ name: string; description: string; inputSchema: unknown }>> {
  try {
    await connection.request<InitializeResult>("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO,
    });
  } catch {
    return [];
  }

  connection.notify("notifications/initialized", {});

  try {
    const toolsResult = await connection.request<ToolsListResult>("tools/list", {});
    return (toolsResult.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: t.inputSchema ?? {},
    }));
  } catch {
    return [];
  }
}

interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export default async function mcpExtension(pi: ExtensionAPI): Promise<void> {
  let config: { version: 1; servers: McpServerConfig[] };
  try {
    const testLayer = Layer.mergeAll(NodeFileSystemLive, NodePathModule.layer);
    const rawConfig = await readMcpConfig().pipe(
      Effect.provide(testLayer),
      Effect.runPromise,
    );
    config = {
      version: rawConfig.version,
      servers: rawConfig.servers.map((s) => ({
        ...s,
        args: [...s.args],
        env: s.env ? { ...s.env } : undefined,
      })),
    };
  } catch {
    config = { version: 1, servers: [] };
  }

  for (const serverConfig of config.servers) {
    if (!serverConfig.enabled) continue;

    const transport = new StdioTransport(
      serverConfig.command,
      serverConfig.args,
      serverConfig.env,
      spawn,
    );

    try {
      transport.start();
    } catch {
      continue;
    }

    const stdin = transport.stdin;
    const stdout = transport.stdout;
    if (!stdin || !stdout) {
      transport.kill();
      continue;
    }

    const connection = new JsonRpcConnection(stdout, stdin);
    let tools: Array<{ name: string; description: string; inputSchema: unknown }> = [];
    try {
      tools = await performHandshake(connection);
    } catch {
      connection.close();
      transport.kill();
      continue;
    }

    for (const tool of tools) {
      const agentName = mcpAgentName(serverConfig.name, tool.name);

      const inputSchema = tool.inputSchema ?? {};

      const mcpTool = defineTool({
        name: agentName,
        label: agentName,
        description:
          `[MCP ${serverConfig.name}] ${tool.description || "MCP tool from " + serverConfig.name}`,
        parameters: Type.Object(inputSchema as any),
        async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
          try {
            const result = await connection.request<ToolsCallResult>("tools/call", {
              name: tool.name,
              arguments: params,
            });
            return {
              content: (result.content ?? []).map((c) => ({
                type: c.type as "text",
                text: c.text ?? "",
              })),
              details: { server: serverConfig.name, tool: tool.name },
            };
          } catch (e) {
            return {
              content: [{ type: "text" as const, text: `MCP error: ${(e as Error).message}` }],
              details: { server: serverConfig.name, tool: tool.name, error: (e as Error).message },
            };
          }
        },
      });

      pi.registerTool(mcpTool);
    }
  }
}
