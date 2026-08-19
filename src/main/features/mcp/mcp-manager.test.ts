/**
 * src/main/features/mcp/mcp-manager.test.ts
 *
 * PR-γ : McpManager class → `createMcpManager()` factory。
 * config mocks 改为 Effect-returning（与 readMcpConfig / writeMcpConfig
 * 新签名对齐）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Effect } from "effect";
import { JsonRpcProtocolError } from "../../lib/errors.js";

// Mock @effect/sql-sqlite-node BEFORE importing to prevent better-sqlite3 native module
vi.mock("@effect/sql-sqlite-node/SqliteClient", () => ({
  SqliteClient: class FakeSqliteClient {
    unsafe = () => Effect.succeed([]);
  },
  layer: () => Effect.succeed({} as never),
}));

// Mock runtime.ts to provide a minimal runtime
vi.mock("../../runtime", () => ({
  MainLive: {},
  mainRuntime: {
    runPromise: <A>(eff: Effect.Effect<A, any, never>) => Effect.runPromise(eff),
    runPromiseExit: <A>(eff: Effect.Effect<A, any, never>) => Effect.runPromiseExit(eff),
  },
}));

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp") },
  shell: { openPath: vi.fn().mockResolvedValue("") },
}));

// Mock config with Effect-returning shape (matching new mcp-config API)
vi.mock("./mcp-config", () => ({
  readMcpConfig: Effect.succeed({ version: 1 as const, servers: [] }),
  writeMcpConfig: Effect.succeed(undefined),
  MCP_CONFIG_PATH: "/tmp/.agents/mcp_servers.json",
}));

const { createMcpManager } = await import("./mcp-manager");

describe("McpManager (factory)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createMcpManager returns a manager object", () => {
    const manager = createMcpManager();
    expect(manager).toBeDefined();
    expect(typeof manager.listServers).toBe("function");
  });

  it("listServers returns empty when no servers configured", () => {
    const manager = createMcpManager();
    expect(manager.listServers()).toEqual([]);
  });

  it("listAllTools returns empty when no servers connected", () => {
    const manager = createMcpManager();
    expect(manager.listAllTools()).toEqual([]);
  });

  it("callTool throws JsonRpcProtocolError for invalid server name", async () => {
    const manager = createMcpManager();
    await expect(
      manager.callTool("invalid", "someTool", {}),
    ).rejects.toThrow(JsonRpcProtocolError);
  });

  it("listServerTools returns empty for unknown server", () => {
    const manager = createMcpManager();
    expect(manager.listServerTools("nonexistent")).toEqual([]);
  });
});