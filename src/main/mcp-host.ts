
import { spawn, type ChildProcess } from "node:child_process";
import { PassThrough, type Readable, type Writable } from "node:stream";
import { JsonRpcConnection } from "./jsonrpc";
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
  private child: ChildProcess | null = null;
  private connection: JsonRpcConnection | null = null;
  private tools: McpTool[] = [];
  private status: McpServerStatus = { kind: "disabled" };
  private readonly statusHandlers = new Set<StatusChangeHandler>();

  constructor(
    private readonly config: McpServerConfig,
    private readonly spawnFn: typeof spawn = spawn,
  ) {}


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
      this.child = this.spawnFn(this.config.command, this.config.args, {
        env: { ...process.env, ...this.config.env },
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus({ kind: "spawn_failed", error: msg });
      return;
    }

    if (!this.child.stdin || !this.child.stdout) {
      this.setStatus({ kind: "spawn_failed", error: "stdin/stdout not available" });
      this.cleanup();
      return;
    }

    this.connection = new JsonRpcConnection(this.child.stdout, this.child.stdin);

    this.child.on("exit", (code, signal) => {
      if (this.status.kind === "connected") {
        this.setStatus({
          kind: "crashed",
          exitCode: code ?? null,
          signal: signal ?? null,
          error: `Exited with code ${code}, signal ${signal}`,
        });
      }
      this.cleanup();
    });

    this.child.on("error", (err) => {
      this.setStatus({ kind: "spawn_failed", error: err.message });
      this.cleanup();
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
      this.cleanup();
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
      this.cleanup();
      return;
    }

    this.setStatus({ kind: "connected", toolCount: this.tools.length });
    logger.info(`[mcp] ${this.config.name} started with ${this.tools.length} tools`);
  }

  async stop(): Promise<void> {
    this.connection?.close();
    if (this.child && !this.child.killed) {
      this.child.kill("SIGTERM");
      setTimeout(() => {
        if (this.child && !this.child.killed) {
          this.child.kill("SIGKILL");
        }
      }, 5_000);
    }
    this.cleanup();
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

  private cleanup(): void {
    if (this.child && !this.child.killed) {
      try { this.child.kill("SIGTERM"); } catch {  }
    }
    this.child = null;
    this.connection = null;
    this.tools = [];
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
