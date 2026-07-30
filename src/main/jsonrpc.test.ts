
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PassThrough } from "node:stream";
import { JsonRpcConnection } from "./jsonrpc";
import { JsonRpcProtocolError, JsonRpcTimeoutError } from "../renderer/src/shared/lib/errors";

interface Pair {
  readable: PassThrough;
  writable: PassThrough;
  conn: JsonRpcConnection;
}

function makePair(timeoutMs?: number): Pair {
  const readable = new PassThrough();
  const writable = new PassThrough();
  const conn = new JsonRpcConnection(readable, writable, { timeoutMs });
  return { readable, writable, conn };
}

function feedLine(readable: PassThrough, response: object): void {
  readable.write(JSON.stringify(response) + "\n");
}

async function tick(): Promise<void> {
  await Promise.resolve();
}

describe("JsonRpcConnection", () => {
  let pair: Pair;

  beforeEach(() => {
    pair = makePair();
  });

  afterEach(async () => {
    await pair.conn.close();
  });


  it("writes newline-delimited JSON request", async () => {
    const writeSpy = vi.spyOn(pair.writable, "write");
    void pair.conn.request("ping", { foo: 1 });
    await tick();
    expect(writeSpy).toHaveBeenCalledWith(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { foo: 1 } }) + "\n",
    );
  });

  it("request() omits params when undefined", async () => {
    const writeSpy = vi.spyOn(pair.writable, "write");
    void pair.conn.request("ping");
    await tick();
    const written = writeSpy.mock.calls[0][0] as string;
    expect(written).not.toContain("params");
  });


  it("resolves request when matching response arrives", async () => {
    const p = pair.conn.request<string>("echo", { x: 1 });
    await tick();
    feedLine(pair.readable, { jsonrpc: "2.0", id: 1, result: "ok" });
    await expect(p).resolves.toBe("ok");
  });

  it("assigns unique monotonic ids to concurrent requests", async () => {
    const writes: string[] = [];
    pair.writable.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      for (const line of text.split("\n")) {
        if (line) writes.push(line);
      }
    });
    const p1 = pair.conn.request("a");
    const p2 = pair.conn.request("b");
    const p3 = pair.conn.request("c");
    await tick();
    expect(writes).toHaveLength(3);
    expect(JSON.parse(writes[0]!).id).toBe(1);
    expect(JSON.parse(writes[1]!).id).toBe(2);
    expect(JSON.parse(writes[2]!).id).toBe(3);
    feedLine(pair.readable, { jsonrpc: "2.0", id: 1, result: "x" });
    feedLine(pair.readable, { jsonrpc: "2.0", id: 2, result: "y" });
    feedLine(pair.readable, { jsonrpc: "2.0", id: 3, result: "z" });
    await expect(Promise.all([p1, p2, p3])).resolves.toEqual(["x", "y", "z"]);
  });


  it("rejects with JsonRpcTimeoutError when no response within timeoutMs", async () => {
    const { conn } = makePair(20);
    const p = conn.request("slow");
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JsonRpcTimeoutError);
    expect(err).toMatchObject({ method: "slow", timeoutMs: 20 });
    conn.close(); 
  });


  it("rejects with JsonRpcProtocolError when response carries error object", async () => {
    const p = pair.conn.request("fail");
    await tick();
    feedLine(pair.readable, {
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32600, message: "Invalid Request" },
    });
    await expect(p).rejects.toBeInstanceOf(JsonRpcProtocolError);
    const err = await p.catch((e) => e);
    expect(err).toMatchObject({ code: -32600, message: "Invalid Request" });
  });


  it("buffers partial JSON until newline", async () => {
    const p = pair.conn.request("slow");
    await tick();
    pair.readable.write('{"jsonrpc":"2.0","id":1,');
    pair.readable.write('"result":"done"}\n');
    await expect(p).resolves.toBe("done");
  });

  it("handles multiple complete lines in a single chunk", async () => {
    const p1 = pair.conn.request("a");
    const p2 = pair.conn.request("b");
    await tick();
    pair.readable.write(
      '{"jsonrpc":"2.0","id":1,"result":"A"}\n{"jsonrpc":"2.0","id":2,"result":"B"}\n',
    );
    await expect(Promise.all([p1, p2])).resolves.toEqual(["A", "B"]);
  });


  it("rejects with JsonRpcProtocolError on malformed JSON", () => {
    expect(() => pair.readable.write("not valid json\n")).toThrow(JsonRpcProtocolError);
  });

  it("rejects with JsonRpcProtocolError on response without id", () => {
    expect(() =>
      pair.readable.write('{"jsonrpc":"2.0","result":"oops"}\n'),
    ).toThrow(JsonRpcProtocolError);
  });


  it("notify() writes a notification without id", () => {
    const writeSpy = vi.spyOn(pair.writable, "write");
    pair.conn.notify("progress", { pct: 50 });
    const written = writeSpy.mock.calls[0][0] as string;
    expect(written).not.toContain('"id"');
    expect(written).toContain('"method":"progress"');
    expect(written).toContain('"pct":50');
  });

  it("onNotification receives server-initiated notifications", () => {
    const received: Array<{ method: string; params: unknown }> = [];
    pair.conn.onNotification((method, params) => received.push({ method, params }));
    pair.readable.write('{"jsonrpc":"2.0","method":"log","params":{"msg":"hi"}}\n');
    expect(received).toEqual([{ method: "log", params: { msg: "hi" } }]);
  });


  it("close() rejects all pending requests", async () => {
    const p = pair.conn.request("never");
    await tick();
    pair.conn.close();
    await expect(p).rejects.toBeInstanceOf(JsonRpcProtocolError);
  });

  it("close() makes subsequent request() reject immediately", async () => {
    pair.conn.close();
    await expect(pair.conn.request("nope")).rejects.toBeInstanceOf(JsonRpcProtocolError);
  });

  it("input EOF rejects pending requests with protocol error", async () => {
    const p = pair.conn.request("never");
    await tick();
    pair.readable.end();
    await expect(p).rejects.toBeInstanceOf(JsonRpcProtocolError);
  });


  it("ignores responses with unknown id (e.g. late after timeout)", async () => {
    const { conn, readable } = makePair(50);
    const p = conn.request("slow");
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JsonRpcTimeoutError);
    expect(() =>
      readable.write('{"jsonrpc":"2.0","id":1,"result":"late"}\n'),
    ).not.toThrow();
  });
});