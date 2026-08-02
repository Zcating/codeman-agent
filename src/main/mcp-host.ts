import { spawn } from "node:child_process";
import { PassThrough, type Readable, type Writable } from "node:stream";
import { JsonRpcConnection } from "./jsonrpc";
import { StdioTransport } from "./mcp-stdio-transport";
import { logger } from "./logger";
import { JsonRpcProtocolError } from "../renderer/src/shared/lib/errors";
import type { McpServerConfig, McpServerStatus, McpTool, McpCallResult, StatusChangeHandler } from "./mcp-types";

export type { McpServerConfig, McpServerStatus, McpTool, McpCallResult, StatusChangeHandler };


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


export class McpStdioServer {
  private readonly transport: StdioTransport;
  private connection: JsonRpcConnection | null = null;
  private tools: McpTool[] = [];
  private status: McpServerStatus = { kind: "disabled" };
  private readonly statusHandlers = new Set<StatusChangeHandler>();

  constructor(
    private readonly config: McpServerConfig,
    spawnFn: typeof spawn = spawn,
  ) {
    this.transport = new StdioTransport(
      config.command,
      config.args,
      config.env,
      spawnFn,
    );
  }


  getConfig(): McpServerConfig { return this.config; }
  getStatus(): McpServerStatus { return this.status; }
  listTools(): McpTool[] { return this.tools; }

  async start(): Promise<void> {
    if (!this.config.enabled) {
      this.setStatus({ kind: "disabled" });
      return;
    }

    if (this.status.kind === "connected") {
      return;
    }

    this.setStatus({ kind: "starting" });

    try {
      this.transport.start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus({ kind: "spawn_failed", error: msg });
      return;
    }

    const stdin = this.transport.stdin;
    const stdout = this.transport.stdout;
    if (!stdin || !stdout) {
      this.setStatus({ kind: "spawn_failed", error: "stdin/stdout not available" });
      await this.transport.kill();
      return;
    }

    this.connection = new JsonRpcConnection(stdout, stdin);

    this.transport.setOnExit((code, signal) => {
      if (this.status.kind === "connected") {
        this.setStatus({
          kind: "crashed",
          exitCode: code,
          signal,
          error: `Exited with code ${code}, signal ${signal}`,
        });
      }
      this.connection = null;
    });

    this.transport.setOnError((err) => {
      this.setStatus({ kind: "spawn_failed", error: err.message });
      this.connection = null;
    });

    try {
      const initResult = await this.connection.request<InitializeResult>("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "codeman-agent", version: "0.3.0" },
      });
      logger.info(`[mcp] ${this.config.name} initialized: serverInfo=${JSON.stringify(initResult.serverInfo)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus({ kind: "protocol_error", error: `initialize failed: ${msg}` });
      await this.transport.kill();
      return;
    }

    this.connection.notify("notifications/initialized", {});

    try {
      const toolsResult = await this.connection.request<ToolsListResult>("tools/list", {});
      this.tools = (toolsResult.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description ?? "",
        inputSchema: t.inputSchema ?? {},
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus({ kind: "protocol_error", error: `tools/list failed: ${msg}` });
      await this.transport.kill();
      return;
    }

    this.setStatus({ kind: "connected", toolCount: this.tools.length });
    logger.info(`[mcp] ${this.config.name} started with ${this.tools.length} tools`);
  }

  async stop(): Promise<void> {
    this.connection?.close();
    await this.transport.kill();
    this.connection = null;
    this.tools = [];
  }

  async callTool(name: string, args: unknown): Promise<McpCallResult> {
    if (!this.connection || this.status.kind !== "connected") {
      throw new JsonRpcProtocolError({
        message: `Server ${this.config.name} not connected`,
        code: -32000,
      });
    }

    const result = await this.connection.request<ToolsCallResult>("tools/call", {
      name,
      arguments: args,
    });

    return {
      content: result.content ?? [],
      isError: false,
    };
  }

  onStatusChange(handler: StatusChangeHandler): () => void {
    this.statusHandlers.add(handler);
    return () => { this.statusHandlers.delete(handler); };
  }


  private setStatus(status: McpServerStatus): void {
    this.status = status;
    this.statusHandlers.forEach((h) => h(status));
  }
}


export class FakeChildProcess {
  readonly stdin: Writable;
  readonly stdout: Readable;
  readonly stderr: Writable;
  on = (): void => {};
  kill = (): void => {};
  killed = false;

  constructor() {
    this.stdin = new PassThrough({ decodeStrings: false });
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
  }

  emitExit(_code: number | null, _signal: NodeJS.Signals | null): void {
    this.stdout.destroy();
    this.stdin.destroy();
  }

  emitError(_err: Error): void {
  }
}