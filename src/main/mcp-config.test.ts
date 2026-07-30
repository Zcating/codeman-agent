import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";

const fakeApp = { getPath: vi.fn() };
vi.mock("electron", () => ({ app: fakeApp }));

const { readMcpConfig, writeMcpConfig } = await import("./mcp-config");

describe("mcp-config", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `codeman-mcp-test-${Date.now()}-${Math.random()}`);
    fakeApp.getPath.mockReturnValue(tempDir);
  });

  afterEach(async () => {
    try {
      await rm(join(tempDir, ".agents"), { recursive: true, force: true });
    } catch {  }
    vi.restoreAllMocks();
  });

  it("readMcpConfig returns empty config when file does not exist", async () => {
    const { Effect } = await import("effect");
    const configPath = join(tempDir, ".agents", "mcp_servers.json");
    try {
      await rm(configPath, { force: true });
    } catch {  }
    const result = await Effect.runPromise(readMcpConfig());
    expect(result).toEqual({ version: 1, servers: [] });
  });

  it("writeMcpConfig then readMcpConfig roundtrips correctly", async () => {
    const { Effect } = await import("effect");
    const config = {
      version: 1 as const,
      servers: [
        {
          name: "test-server",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
          enabled: true,
        },
      ],
    };
    await Effect.runPromise(writeMcpConfig(config));
    const readBack = await Effect.runPromise(readMcpConfig());
    expect(readBack).toEqual(config);
  });
});
