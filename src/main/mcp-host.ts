//! B2 — MCP Stdio Server (single subprocess lifecycle).
//!
//! McpStdioServer: spawn → initialize → tools/list → ready → tools/call.
//! All communication over stdio JSON-RPC. No McpManager here (mini-3).

import { spawn, type ChildProcess } from "node:child_process";
import { PassThrough, type Readable, type Writable } from "node:stream";
import { JsonRpcConnection } from "./jsonrpc";
import { logger } from "./logger";
import { JsonRpcProtocolError } from "../renderer/src/shared/lib/errors";

// ─── Config & Types ─────────────────────────────────────────

export interface McpServerConfig {
  name: string;                     // unique id (slug, no path separators)
  command: string;                  // e.g. "npx"
  args: string[];                   // e.g. ["-y", "@modelcontextprotocol/server-filesystem"]
  env?: Record<string, string>;    // merged on top of process.env
  enabled: boolean;                // V1: only spawn if true
}

export type McpServerStatus =
  | { kind: "starting" }
  | { kind: "connected"; toolCount: number }
  | { kind: "spawn_failed"; error: string }
  | { kind: "crashed"; exitCode: number | null; signal: NodeJS.Signals | null; error: string }
  | { kind: "disabled" }
  | { kind: "protocol_error"; error: string };

export interface McpTool {
  name: string;
  description: string;
  /** MCP server returns JSON Schema; we keep it as unknown and pass through. */
  inputSchema: unknown;
}

export interface McpCallResult {
  content: Array<{ type: "text"; text: string } | { type: string; [k: string]: unknown }>;
  isError?: boolean;
}

export type StatusChangeHandler = (status: McpServerStatus) => void;

// ─── Internal JSON-RPC shapes ─────────────────────────────────────────────────

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

// ─── McpStdioServer ───────────────────────────────────────────────────────────

/**
 * One MCP server subprocess + its JSON-RPC connection.
 * Lifecycle: start() → (initialize handshake) → tools/list → connected.
 * On any error → status reflects failure; tools/call rejects.
 */
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

  // ── Public API ─────────────────────────────────────────────────────────────

  getConfig(): McpServerConfig { return this.config; }
  getStatus(): McpServerStatus { return this.status; }
  listTools(): McpTool[] { return this.tools; }

  /**
   * Start the MCP server: spawn + initialize handshake + tools/list.
   * Idempotent: calling start() on an already-started server is a no-op.
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      this.setStatus({ kind: "disabled" });
      return;
    }

    if (this.status.kind === "connected") {
      return; // already started
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

    // Wire child stdout → connection input, child stdin → connection output
    this.connection = new JsonRpcConnection(this.child.stdout, this.child.stdin);

    // Step 2: child exit unexpectedly → mark crashed
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

    // Step 3: child error (ENOENT, etc.) → mark spawn_failed
    this.child.on("error", (err) => {
      this.setStatus({ kind: "spawn_failed", error: err.message });
      this.cleanup();
    });

    // Step 4: send initialize request
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

    // Step 5: send notifications/initialized (fire-and-forget)
    this.connection.notify("notifications/initialized", {});

    // Step 6: send tools/list → cache tools
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

  /** Stop the server gracefully. Idempotent. */
  async stop(): Promise<void> {
    this.connection?.close();
    if (this.child && !this.child.killed) {
      this.child.kill("SIGTERM");
      // Give it 5s to die gracefully, then SIGKILL
      setTimeout(() => {
        if (this.child && !this.child.killed) {
          this.child.kill("SIGKILL");
        }
      }, 5_000);
    }
    this.cleanup();
    // Note: do NOT change status here — stop is voluntary; status was already
    // set by the error/exit handlers if something went wrong.
  }

  /**
   * Call a tool by name with arguments.
   * @throws JsonRpcProtocolError if not connected
   */
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

  /** Register a status change listener. Returns an unsubscribe function. */
  onStatusChange(handler: StatusChangeHandler): () => void {
    this.statusHandlers.add(handler);
    return () => { this.statusHandlers.delete(handler); };
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private setStatus(status: McpServerStatus): void {
    this.status = status;
    this.statusHandlers.forEach((h) => h(status));
  }

  private cleanup(): void {
    if (this.child && !this.child.killed) {
      try { this.child.kill("SIGTERM"); } catch { /* ignore */ }
    }
    this.child = null;
    this.connection = null;
    this.tools = [];
  }
}

// ─── Test helpers (exported for use by mcp-host.test.ts) ─────────────────────

/** A fake child process whose stdio can be wired to JsonRpcConnection. */
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

  /** Simulate child exit. */
  emitExit(_code: number | null, _signal: NodeJS.Signals | null): void {
    this.stdout.destroy();
    this.stdin.destroy();
    // Simulate exit by calling any registered exit handler
    // (In real ChildProcess, exit is emitted once)
  }

  /** Simulate child error. */
  emitError(_err: Error): void {
    // Would emit 'error' event
  }
}
