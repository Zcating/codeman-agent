
import { JsonRpcProtocolError, JsonRpcTimeoutError } from "../renderer/src/shared/lib/errors";


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


export interface JsonRpcOptions {
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
        void entry.promise.catch(() => {}); 
      }
    }, this.#timeoutMs);

    const entry: PendingRequest = {
      promise: null as unknown as Promise<never>,
      resolve: null as unknown as (value: unknown) => void,
      reject: null as unknown as (reason: unknown) => void,
      method,
      timeoutHandle,
    };
    this.#pending.set(id, entry);

    const promise = new Promise<T>((resolve, reject) => {
      entry.resolve = resolve as (value: unknown) => void;
      entry.reject = reject;
      this.#writeLine(JSON.stringify(req));
    });
    entry.promise = promise as Promise<never>;
    return promise;
  }

  notify(method: string, params?: unknown): void {
    if (this.#closed) return;
    const note: JsonRpcNotification = params === undefined
      ? { jsonrpc: "2.0", method }
      : { jsonrpc: "2.0", method, params };
    this.#writeLine(JSON.stringify(note));
  }

  onNotification(handler: NotificationHandler): () => void {
    this.#notificationHandlers.add(handler);
    return () => this.#notificationHandlers.delete(handler);
  }

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
      void entry.promise.catch(() => {});
    }
    this.#pending.clear();
    return Promise.resolve();
  }


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
      throw new JsonRpcProtocolError({
        message: `Malformed JSON-RPC line: ${(e as Error).message}`,
        code: -32700,
      });
    }

    if (this.#isNotification(parsed)) {
      for (const handler of this.#notificationHandlers) {
        try {
          handler(parsed.method, parsed.params);
        } catch {
        }
      }
      return;
    }

    const id = (parsed as { id?: unknown }).id;
    if (typeof id !== "number") {
      throw new JsonRpcProtocolError({
        message: "JSON-RPC response missing numeric id",
        code: -32600,
      });
    }
    const entry = this.#pending.get(id);
    if (!entry) {
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
    const err = new JsonRpcProtocolError({
      message: "JSON-RPC input stream ended",
      code: -32603,
    });
    for (const [, entry] of this.#pending) {
      clearTimeout(entry.timeoutHandle);
      entry.reject(err);
      void entry.promise.catch(() => {}); 
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
      void entry.promise.catch(() => {}); 
    }
    this.#pending.clear();
  };

  #isNotification(msg: JsonRpcIncoming): msg is JsonRpcNotification {
    return "method" in msg && !("id" in msg);
  }
}