import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { Writable, Readable } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { StdioTransport } from "./mcp-stdio-transport";


class FakeChild extends EventEmitter {
  stdin = new Writable({ write(_c, _e, cb) { cb(); } });
  stdout = new Readable({ read() {} });
  stderr = new Writable({ write(_c, _e, cb) { cb(); } });
  killed = false;
  kill = vi.fn((sig?: NodeJS.Signals) => {
    this.killed = true;
    queueMicrotask(() => this.emit("exit", null, sig ?? "SIGTERM"));
    return true;
  });
}

type SpawnFn = ConstructorParameters<typeof StdioTransport>[3];

describe("StdioTransport", () => {
  let fake: FakeChild;
  let spawnFn: SpawnFn;

  beforeEach(() => {
    fake = new FakeChild();
    spawnFn = vi.fn(() => fake as unknown as ChildProcess) as unknown as SpawnFn;
  });

  it("start() invokes spawnFn with command/args/env", () => {
    const env = { LOG_LEVEL: "debug" };
    const t = new StdioTransport("npx", ["-y", "server"], env, spawnFn);
    t.start();
    expect(spawnFn).toHaveBeenCalledWith(
      "npx",
      ["-y", "server"],
      expect.objectContaining({
        env: expect.objectContaining({ LOG_LEVEL: "debug" }),
        stdio: ["pipe", "pipe", "pipe"],
      }),
    );
  });

  it("start() returns the spawned child", () => {
    const t = new StdioTransport("cmd", [], undefined, spawnFn);
    const child = t.start();
    expect(child).toBe(fake);
  });

  it("stdin/stdout expose the child's pipes", () => {
    const t = new StdioTransport("cmd", [], undefined, spawnFn);
    t.start();
    expect(t.stdin).toBe(fake.stdin);
    expect(t.stdout).toBe(fake.stdout);
  });

  it("stdin/stdout are null before start()", () => {
    const t = new StdioTransport("cmd", [], undefined, spawnFn);
    expect(t.stdin).toBeNull();
    expect(t.stdout).toBeNull();
  });

  it("setOnExit fires when child emits exit", () => {
    const t = new StdioTransport("cmd", [], undefined, spawnFn);
    const handler = vi.fn();
    t.setOnExit(handler);
    t.start();
    fake.emit("exit", 0, null);
    expect(handler).toHaveBeenCalledWith(0, null);
  });

  it("setOnError fires when child emits error", () => {
    const t = new StdioTransport("cmd", [], undefined, spawnFn);
    const handler = vi.fn();
    t.setOnError(handler);
    t.start();
    const err = new Error("spawn failed");
    fake.emit("error", err);
    expect(handler).toHaveBeenCalledWith(err);
  });

  it("kill() before start() is a no-op", async () => {
    const t = new StdioTransport("cmd", [], undefined, spawnFn);
    await expect(t.kill()).resolves.toBeUndefined();
  });

  it("kill() calls child.kill('SIGTERM')", async () => {
    const t = new StdioTransport("cmd", [], undefined, spawnFn);
    t.start();
    const promise = t.kill();
    expect(fake.kill).toHaveBeenCalledWith("SIGTERM");
    await promise;
  });
});