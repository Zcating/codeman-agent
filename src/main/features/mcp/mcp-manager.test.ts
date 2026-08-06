import { describe, it, expect, vi, beforeEach } from "vitest";
import { Effect, Layer } from "effect";
import { JsonRpcProtocolError, NotFound } from "../../../renderer/src/shared/lib/errors";

// Mock @effect/sql-sqlite-node BEFORE importing McpManager to prevent
// better-sqlite3 native module from loading (ABI mismatch: Electron vs system Node).
vi.mock("@effect/sql-sqlite-node/SqliteClient", () => ({
  SqliteClient: class FakeSqliteClient {
    unsafe = () => Effect.succeed([]);
  },
  layer: () => Layer.succeed({} as any, {} as any),
}));

// Mock runtime.ts to provide a minimal runtime without DbLive
vi.mock("../../runtime", () => ({
  MainLive: Layer.succeed({} as any, {} as any),
  mainRuntime: {
    runPromise: <A>(eff: Effect.Effect<A, any, never>) => Effect.runPromise(eff),
    runPromiseExit: <A>(eff: Effect.Effect<A, any, never>) => Effect.runPromiseExit(eff),
  },
}));

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp") },
  shell: { openPath: vi.fn().mockResolvedValue("") },
}));

const { McpManager } = await import("./mcp-manager");

describe("McpManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listServers returns empty when no servers configured", () => {
    const manager = new McpManager();
    const servers = manager.listServers();
    expect(servers).toEqual([]);
  });

  it("listAllTools returns empty when no servers connected", () => {
    const manager = new McpManager();
    const tools = manager.listAllTools();
    expect(tools).toEqual([]);
  });

  it("callTool throws JsonRpcProtocolError for invalid agent name", async () => {
    const manager = new McpManager();
    await expect(manager.callTool("invalid", "someTool", {})).rejects.toThrow(JsonRpcProtocolError);
  });

  it("restart throws NotFound for nonexistent server", async () => {
    const manager = new McpManager();
    await expect(manager.restart("nonexistent")).rejects.toThrow(NotFound);
  });
});
