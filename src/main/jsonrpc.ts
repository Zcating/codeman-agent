//! V3.1 MCP — JSON-RPC 2.0 client over newline-delimited JSON (ADR-0032 Phase B).
//!
//! Used by `src/main/mcp-host.ts` for stdio transport to MCP server subprocesses.
//! No external SDK dependency — hand-rolled ~150 lines.
//!
//! Frame format: each JSON-RPC message = one JSON object + one `\n`.
//! Pending requests routed by integer `id` (monotonic, never reused within a
//! connection's lifetime). Notifications (no `id` field) are delivered to
//! `onNotification` handlers synchronously.

import { JsonRpcProtocolError, JsonRpcTimeoutError } from "../renderer/src/shared/lib/errors";

// ─── JSON-RPC 2.0 message types ──────────────────────────────

interface JsonRpcRequest {
  readonly jsonrpc: "2.0";
  readonly id: number;
  readonly method: string;
  readonly params?: unknown;
}

interface JsonRpcSuccessResponse {
  readonly jsonrpc: "2.0";
  readonly id: number;
  readonly result: unknown;
}

interface JsonRpcErrorObject {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

interface JsonRpcErrorResponse {
  readonly jsonrpc: "2.0";
  readonly id: number;
  readonly error: JsonRpcErrorObject;
}

type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

interface JsonRpcNotification {
  readonly jsonrpc: "2.0";
  readonly method: string;
  readonly params?: unknown;
}

type JsonRpcIncoming = JsonRpcResponse | JsonRpcNotification;

type NotificationHandler = (method: string, params: unknown) => void;

// ─── Connection ──────────────────────────────

export interface JsonRpcOptions {
  /** Per-request timeout in ms (default 60000). */
  readonly timeoutMs?: number;
}

interface PendingRequest {
  promise: Promise<never>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  readonly method: string;
  readonly timeoutHandle: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const NEWLINE = "\n";

export class JsonRpcConnection {
  readonly #input: NodeJS.ReadableStream;
  readonly #output: NodeJS.WritableStream;
  readonly #timeoutMs: number;
  readonly #pending = new Map<number, PendingRequest>();
  readonly #notificationHandlers = new Set<NotificationHandler>();
  #nextId = 1;
  #buffer = "";
  #closed = false;

  constructor(
    input: NodeJS.ReadableStream,
    output: NodeJS.WritableStream,
    options: JsonRpcOptions = {},
  ) {
    this.#input = input;
    this.#output = output;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    this.#input.on("data", this.#handleChunk);
    this.#input.on("end", this.#handleEnd);
    this.#input.on("error", this.#handleStreamError);
  }

  /**
   * Send a JSON-RPC request and await the response.
   * @throws JsonRpcTimeoutError if no response within `timeoutMs`.
   * @throws JsonRpcProtocolError if the response is malformed or carries an `error` field.
   */
  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.#closed) {
      return Promise.reject(
        new JsonRpcProtocolError({
          message: "JsonRpcConnection is closed",
          code: -32603,
        }),
      );
    }
    const id = this.#nextId++;
    const req: JsonRpcRequest = params === undefined
      ? { jsonrpc: "2.0", id, method }
      : { jsonrpc: "2.0", id, method, params };

    // Create a placeholder entry first (to avoid TDZ), then create the caller's
    // promise, then backfill the promise reference into the entry.
    const timeoutHandle = setTimeout(() => {
      const entry = this.#pending.get(id);
      if (entry) {
        this.#pending.delete(id);
        entry.reject(
          new JsonRpcTimeoutError({
            message: `JSON-RPC request "${method}" (id=${id}) timed out after ${this.#timeoutMs}ms`,
            method,
            timeoutMs: this.#timeoutMs,
          }),
        );
        void entry.promise.catch(() => {}); // safety net: prevent unhandled if caller never .catch()es
      }
    }, this.#timeoutMs);

    // Placeholder entry — promise will be backfilled below.
    const entry: PendingRequest = {
      promise: null as unknown as Promise<never>,
      resolve: null as unknown as (value: unknown) => void,
      reject: null as unknown as (reason: unknown) => void,
      method,
      timeoutHandle,
    };
    this.#pending.set(id, entry);

    const promise = new Promise<T>((resolve, reject) => {
      // Override the placeholder resolve/reject with the actual ones.
      entry.resolve = resolve as (value: unknown) => void;
      entry.reject = reject;
      this.#writeLine(JSON.stringify(req));
    });
    // Now the promise is created; backfill it so close() can use it.
    entry.promise = promise as Promise<never>;
    return promise;
  }

  /** Send a notification (no response expected). */
  notify(method: string, params?: unknown): void {
    if (this.#closed) return;
    const note: JsonRpcNotification = params === undefined
      ? { jsonrpc: "2.0", method }
      : { jsonrpc: "2.0", method, params };
    this.#writeLine(JSON.stringify(note));
  }

  /**
   * Register a handler for server-initiated notifications (messages without an `id`).
   * Returns an unsubscribe function.
   */
  onNotification(handler: NotificationHandler): () => void {
    this.#notificationHandlers.add(handler);
    return () => this.#notificationHandlers.delete(handler);
  }

  /**
   * Close the connection: removes stream listeners, rejects all pending requests
   * with a protocol error. Does NOT kill the underlying child process.
   * Returns a promise that resolves after all pending rejections are guaranteed
   * to have attached handlers (preventing unhandled rejections).
   */
  close(): Promise<void> {
    if (this.#closed) return Promise.resolve();
    this.#closed = true;
    this.#input.off("data", this.#handleChunk);
    this.#input.off("end", this.#handleEnd);
    this.#input.off("error", this.#handleStreamError);
    this.#notificationHandlers.clear();
    const err = new JsonRpcProtocolError({
      message: "JsonRpcConnection closed",
      code: -32603,
    });
    for (const [, entry] of this.#pending) {
      clearTimeout(entry.timeoutHandle);
      entry.reject(err);
      // Safety net: attach a noop catch so the rejection is never unhandled,
      // even if the caller never attached their own .catch() handler.
      void entry.promise.catch(() => {});
    }
    this.#pending.clear();
    return Promise.resolve();
  }

  // ─── internals ──────────────────────────────

  #writeLine(line: string): void {
    this.#output.write(line + NEWLINE);
  }

  #handleChunk = (chunk: Buffer | string): void => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
    this.#buffer += text;
    let nlIdx = this.#buffer.indexOf(NEWLINE);
    while (nlIdx !== -1) {
      const line = this.#buffer.slice(0, nlIdx);
      this.#buffer = this.#buffer.slice(nlIdx + 1);
      if (line.length > 0) this.#handleLine(line);
      nlIdx = this.#buffer.indexOf(NEWLINE);
    }
  };

  #handleLine(line: string): void {
    let parsed: JsonRpcIncoming;
    try {
      parsed = JSON.parse(line) as JsonRpcIncoming;
    } catch (e) {
      // Malformed JSON: per JSON-RPC 2.0 spec §5.1, this is a Parse Error (code -32700).
      // We can't route it to a specific request (no id), so we surface it as a protocol error.
      throw new JsonRpcProtocolError({
        message: `Malformed JSON-RPC line: ${(e as Error).message}`,
        code: -32700,
      });
    }

    // Notifications: method present, no id (or id is null/undefined).
    if (this.#isNotification(parsed)) {
      for (const handler of this.#notificationHandlers) {
        try {
          handler(parsed.method, parsed.params);
        } catch {
          // Per JSON-RPC 2.0 spec §4.1, handler errors must not break the connection.
          // Swallow; handlers are responsible for their own error handling.
        }
      }
      return;
    }

    // Response: must have numeric id matching a pending request.
    const id = (parsed as { id?: unknown }).id;
    if (typeof id !== "number") {
      throw new JsonRpcProtocolError({
        message: "JSON-RPC response missing numeric id",
        code: -32600,
      });
    }
    const entry = this.#pending.get(id);
    if (!entry) {
      // Unknown id — likely a late response after timeout. Drop silently.
      return;
    }
    this.#pending.delete(id);
    clearTimeout(entry.timeoutHandle);

    if ("error" in parsed) {
      const errObj = (parsed as JsonRpcErrorResponse).error;
      entry.reject(
        new JsonRpcProtocolError({
          message: errObj.message,
          code: errObj.code,
        }),
      );
    } else {
      entry.resolve((parsed as JsonRpcSuccessResponse).result);
    }
  }

  #handleEnd = (): void => {
    // EOF on input: reject all pending requests.
    const err = new JsonRpcProtocolError({
      message: "JSON-RPC input stream ended",
      code: -32603,
    });
    for (const [, entry] of this.#pending) {
      clearTimeout(entry.timeoutHandle);
      entry.reject(err);
      void entry.promise.catch(() => {}); // safety net: prevent unhandled rejection
    }
    this.#pending.clear();
  };

  #handleStreamError = (e: Error): void => {
    const err = new JsonRpcProtocolError({
      message: `JSON-RPC input stream error: ${e.message}`,
      code: -32603,
    });
    for (const [, entry] of this.#pending) {
      clearTimeout(entry.timeoutHandle);
      entry.reject(err);
      void entry.promise.catch(() => {}); // safety net: prevent unhandled rejection
    }
    this.#pending.clear();
  };

  #isNotification(msg: JsonRpcIncoming): msg is JsonRpcNotification {
    return "method" in msg && !("id" in msg);
  }
}