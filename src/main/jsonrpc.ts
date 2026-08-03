
import { Cause, Deferred, Duration, Effect, Exit, Fiber, FiberId, Runtime } from "effect";
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

const DEFAULT_TIMEOUT_MS = 60_000;
const NEWLINE = "\n";

const runtime = Runtime.defaultRuntime;

type PendingEntry = {
  deferred: Deferred.Deferred<unknown, JsonRpcProtocolError | JsonRpcTimeoutError>;
  method: string;
};

export class JsonRpcConnection {
  readonly #input: NodeJS.ReadableStream;
  readonly #output: NodeJS.WritableStream;
  readonly #timeoutMs: number;
  readonly #pending = new Map<number, PendingEntry>();
  readonly #notificationHandlers = new Set<NotificationHandler>();
  #nextId = 1;
  #buffer = "";
  #closed = false;
  readonly #readerFiber: Fiber.RuntimeFiber<never>;

  constructor(
    input: NodeJS.ReadableStream,
    output: NodeJS.WritableStream,
    options: JsonRpcOptions = {},
  ) {
    this.#input = input;
    this.#output = output;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    this.#readerFiber = Effect.runFork(
      Effect.async<never, never, never>((_resume) => {
        const onData = (chunk: Buffer | string): void => {
          this.#handleChunk(chunk);
        };
        const onEnd = (): void => {
          this.#handleEnd();
        };
        const onError = (e: Error): void => {
          this.#handleStreamError(e);
        };
        this.#input.on("data", onData);
        this.#input.on("end", onEnd);
        this.#input.on("error", onError);
        return Effect.sync(() => {
          this.#input.off("data", onData);
          this.#input.off("end", onEnd);
          this.#input.off("error", onError);
        });
      }),
    );
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

    this.#writeLine(JSON.stringify(req));

    const deferred = Deferred.unsafeMake<unknown, JsonRpcProtocolError | JsonRpcTimeoutError>(FiberId.none);
    const fiber = Effect.runFork(
      Deferred.await(deferred).pipe(
        Effect.timeout(Duration.millis(this.#timeoutMs)),
        Effect.catchTag("TimeoutException", () =>
          Effect.fail(
            new JsonRpcTimeoutError({
              message: `JSON-RPC request "${method}" (id=${id}) timed out after ${this.#timeoutMs}ms`,
              method,
              timeoutMs: this.#timeoutMs,
            }),
          )
        ),
        Effect.ensuring(Effect.sync(() => this.#pending.delete(id))),
      ),
    );

    this.#pending.set(id, { deferred, method });

    const promise = new Promise<T>((resolve, reject) => {
      Runtime.runPromise(runtime)(Fiber.await(fiber)).then((exit) => {
        if (exit._tag === "Success") {
          resolve(exit.value as T);
        } else {
          reject(Cause.squash(exit.cause));
        }
      }).catch(reject);
    });
    void promise.catch(() => {});
    return promise;
  }

  notify(method: string, params?: unknown): void {
    if (this.#closed) { return; }
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
    if (this.#closed) { return Promise.resolve(); }
    this.#closed = true;
    this.#notificationHandlers.clear();
    const err = new JsonRpcProtocolError({
      message: "JsonRpcConnection closed",
      code: -32603,
    });
    this.#failAllPending(err);
    return Runtime.runPromise(runtime)(Fiber.interrupt(this.#readerFiber)).then(() => undefined);
  }

  #failAllPending(err: JsonRpcProtocolError): void {
    for (const [, entry] of this.#pending) {
      Deferred.unsafeDone(entry.deferred, Exit.fail(err));
    }
    this.#pending.clear();
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
      if (line.length > 0) { this.#handleLine(line); }
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

    if ("error" in parsed) {
      const errObj = (parsed as JsonRpcErrorResponse).error;
      Deferred.unsafeDone(
        entry.deferred,
        Exit.fail(
          new JsonRpcProtocolError({
            message: errObj.message,
            code: errObj.code,
          }),
        ),
      );
    } else {
      Deferred.unsafeDone(entry.deferred, Exit.succeed((parsed as JsonRpcSuccessResponse).result));
    }
  }

  #handleEnd = (): void => {
    const err = new JsonRpcProtocolError({
      message: "JSON-RPC input stream ended",
      code: -32603,
    });
    this.#failAllPending(err);
  };

  #handleStreamError = (e: Error): void => {
    const err = new JsonRpcProtocolError({
      message: `JSON-RPC input stream error: ${e.message}`,
      code: -32603,
    });
    this.#failAllPending(err);
  };

  #isNotification(msg: JsonRpcIncoming): msg is JsonRpcNotification {
    return "method" in msg && !("id" in msg);
  }
}
