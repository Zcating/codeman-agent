import { describe, it, expect, vi, beforeEach } from "vitest";
import { JsonRpcProtocolError, NotFound } from "../../../renderer/src/shared/lib/errors";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp") },
  shell: { openPath: vi.fn().mockResolvedValue("") },
}));

vi.mock("./mcp-config", () => ({
  readMcpConfig: vi.fn(async () => ({ version: 1, servers: [] })),
  writeMcpConfig: vi.fn(async () => {}),
  MCP_CONFIG_PATH: "/tmp/.agents/mcp_servers.json",
}));

vi.mock("../../runtime", () => ({
  mainRuntime: { runPromise: vi.fn((v) => Promise.resolve(v)) },
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
