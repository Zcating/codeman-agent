
import { describe, it, expect } from "vitest";
import { McpStdioServer, type McpServerConfig } from "./mcp-host";

const DISABLED_CONFIG: McpServerConfig = {
  name: "test",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem"],
  enabled: false,
};

const ENABLED_CONFIG: McpServerConfig = {
  ...DISABLED_CONFIG,
  enabled: true,
};

describe("McpStdioServer (minimal)", () => {
  it("disabled server has status=disabled without spawning", () => {
    const server = new McpStdioServer(DISABLED_CONFIG);
    expect(server.getStatus()).toEqual({ kind: "disabled" });
    expect(server.listTools()).toEqual([]);
    expect(server.getConfig()).toEqual(DISABLED_CONFIG);
  });

  it("disabled server ignores start() (status remains disabled)", async () => {
    const server = new McpStdioServer(DISABLED_CONFIG);
    await server.start();
    expect(server.getStatus()).toEqual({ kind: "disabled" });
  });

  it("spawn throwing synchronously —status=spawn_failed", async () => {
    const failingSpawn = (() => {
      throw new Error("ENOENT: command not found");
    }) as unknown as ConstructorParameters<typeof McpStdioServer>[1];
    const server = new McpStdioServer(ENABLED_CONFIG, failingSpawn);
    await server.start();
    expect(server.getStatus().kind).toBe("spawn_failed");
  });

  it("listTools() returns empty array before connect", () => {
    const server = new McpStdioServer(ENABLED_CONFIG);
    expect(server.listTools()).toEqual([]);
  });

  it("callTool() on disconnected server throws", async () => {
    const server = new McpStdioServer(DISABLED_CONFIG);
    await expect(server.callTool("foo", {})).rejects.toThrow();
  });

  it("onStatusChange returns unsubscribe function", () => {
    const server = new McpStdioServer(DISABLED_CONFIG);
    const handler = () => {};
    const unsub = server.onStatusChange(handler);
    expect(typeof unsub).toBe("function");
    unsub();
    expect(() => unsub()).not.toThrow();
  });

  it("stop() on non-started server is idempotent", async () => {
    const server = new McpStdioServer(ENABLED_CONFIG);
    await expect(server.stop()).resolves.toBeUndefined();
    await expect(server.stop()).resolves.toBeUndefined();
  });

  it("config is exposed via getConfig()", () => {
    const config: McpServerConfig = {
      name: "my-server",
      command: "/usr/local/bin/mcp-fs",
      args: ["/tmp"],
      env: { LOG_LEVEL: "debug" },
      enabled: true,
    };
    const server = new McpStdioServer(config);
    expect(server.getConfig()).toEqual(config);
  });
});