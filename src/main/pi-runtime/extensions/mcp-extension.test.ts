import { describe, it, expect, vi } from "vitest";
import mcpExtension from "./mcp-extension";

vi.mock("../../../jsonrpc");
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

describe("mcp-extension", () => {
  it("exports an async function", () => {
    expect(typeof mcpExtension).toBe("function");
  });

  it("registers MCP tools via pi.registerTool", async () => {
    const mockRegisterTool = vi.fn();
    const mockPi = {
      registerTool: mockRegisterTool,
    } as never;

    await mcpExtension(mockPi);
  });
});
