import { describe, it, expect, vi, beforeEach } from "vitest";
import { InvalidConfig, JsonRpcProtocolError } from "../renderer/src/shared/lib/errors";

// Mock electron — shell.openPath is called by openConfigDir (not tested here)
vi.mock("electron", () => ({
  shell: { openPath: vi.fn().mockResolvedValue("") },
}));

const { McpManager } = await import("./mcp-manager");

describe("McpManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listServers returns empty when no servers configured", () => {
    const manager = new McpManager();
    // Don't call startAll — no servers configured
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
    await expect(manager.callTool("invalid", {})).rejects.toThrow(JsonRpcProtocolError);
  });

  it("restart throws InvalidConfig for nonexistent server", async () => {
    const manager = new McpManager();
    await expect(manager.restart("nonexistent")).rejects.toThrow(InvalidConfig);
  });
});
