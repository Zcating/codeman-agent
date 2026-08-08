/**
 * src/main/features/mcp/mcp-config.test.ts
 *
 * PR-γ (ADR-0058): 测试走 TestLayer（NodeFileSystemLive + NodePath.layer）。
 *
 * 注：vi.mock 被 hoist 到所有 import 之上。引用顶层 const 即使已经声明也会
 * 触发 vitest 的 "no top level variables inside" 安全检查。解决方案：把
 * mock state 放进 vi.hoisted()（vitest 官方为此场景设计），确保 mock 变量
 * 与 vi.mock 工厂在同一个 hoisted 阶段被求值。
 */
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Effect, Layer } from "effect";
import * as NodePathModule from "@effect/platform-node/NodePath";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { NodeFileSystemLive } from "../../lib/file-system-node.js";
import { mcpConfigExists, readMcpConfig, writeMcpConfig } from "./mcp-config.js";

const mocks = vi.hoisted(() => {
  const mockGetPath = vi.fn(() => "");
  return { mockGetPath };
});

vi.mock("electron", () => ({
  app: { getPath: mocks.mockGetPath },
}));

const TestLayer = Layer.mergeAll(NodeFileSystemLive, NodePathModule.layer);
const runWithFs = <A, E, R>(
  eff: Effect.Effect<A, E, R>,
): Promise<A> =>
  Effect.runPromise(eff.pipe(Effect.provide(TestLayer)) as Effect.Effect<A, E, never>);

let tempDir = "";

beforeEach(() => {
  tempDir = join(
    tmpdir(),
    `codeman-mcp-test-${Date.now()}-${Math.random()}`,
  );
  mocks.mockGetPath.mockReturnValue(tempDir);
});

afterEach(async () => {
  try {
    await rm(join(tempDir, ".agents"), { recursive: true, force: true });
  } catch {
    // ignore
  }
  vi.restoreAllMocks();
});

describe("mcp-config", () => {
  it("readMcpConfig returns empty config when file does not exist", async () => {
    const configPath = join(tempDir, ".agents", "mcp_servers.json");
    try {
      await rm(configPath, { force: true });
    } catch {
      // ignore
    }
    const result = await runWithFs(readMcpConfig());
    expect(result).toEqual({ version: 1, servers: [] });
  });

  it("writeMcpConfig then readMcpConfig roundtrips correctly", async () => {
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
    await runWithFs(writeMcpConfig(config));
    const readBack = await runWithFs(readMcpConfig());
    expect(readBack).toEqual(config);
  });

  it("mcpConfigExists returns false when config file does not exist", async () => {
    const result = await runWithFs(mcpConfigExists());
    expect(result).toBe(false);
  });

  it("mcpConfigExists returns true after writeMcpConfig", async () => {
    await runWithFs(writeMcpConfig({ version: 1, servers: [] }));
    const result = await runWithFs(mcpConfigExists());
    expect(result).toBe(true);
  });
});