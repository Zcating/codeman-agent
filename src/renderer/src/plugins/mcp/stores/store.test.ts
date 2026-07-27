// MCP store tests — ADR-0032 Phase B mini-4.

import { describe, it, expect, beforeEach } from "vitest";
import { Effect, Layer } from "effect";
import { it as itEffect } from "@effect/vitest";
import {
  mcpServers$,
  mcpAllTools$,
  _resetMcpStoreForTest,
  initializeMcp,
} from "@codeman-frontend/plugins/mcp/stores/store";
import { McpService } from "@shared/apis";
import { Unknown } from "@codeman-frontend/shared/lib/errors";
import type { McpServerInfo, McpToolEntry } from "@codeman-frontend/shared/lib/types";

describe("mcp store", () => {
  beforeEach(() => {
    _resetMcpStoreForTest();
  });

  it("初始为空数组", () => {
    expect(mcpServers$()).toEqual([]);
    expect(mcpAllTools$()).toEqual([]);
  });

  it("_resetMcpStoreForTest 清空两个信号", () => {
    expect(mcpServers$()).toEqual([]);
    expect(mcpAllTools$()).toEqual([]);
  });

  it("accessor 返回同一 reference (Solid signal 语义)", () => {
    const serversBefore = mcpServers$();
    const toolsBefore = mcpAllTools$();
    expect(mcpServers$()).toBe(serversBefore);
    expect(mcpAllTools$()).toBe(toolsBefore);
  });

  it("空数组长度验证", () => {
    expect(mcpServers$()).toHaveLength(0);
    expect(mcpAllTools$()).toHaveLength(0);
  });

  it("mcpAllTools 返回空数组类型正确", () => {
    const tools = mcpAllTools$();
    expect(Array.isArray(tools)).toBe(true);
  });

  describe("initializeMcp", () => {
    itEffect("initializeMcp 执行后 mcpServers$ 和 mcpAllTools$ 被填充", () =>
      Effect.gen(function* () {
        const mockServers: McpServerInfo[] = [
          {
            config: { name: "test-server", command: "npx", args: [], enabled: true },
            status: { kind: "connected", toolCount: 2 },
            tools: [],
          },
        ];
        const mockTools: McpToolEntry[] = [
          {
            serverName: "test-server",
            agentName: "mcp_test-server_tool1",
            toolName: "tool1",
            description: "Test tool 1",
            inputSchema: {},
          },
        ];

        const mockLayer = Layer.succeed(McpService, {
          listServers: () => Effect.succeed(mockServers),
          getTools: () => Effect.succeed([]),
          getAllTools: () => Effect.succeed(mockTools),
          enable: () => Effect.succeed(undefined),
          restart: () => Effect.succeed(undefined),
          callTool: () => Effect.succeed({ content: [] }),
          openConfigDir: () => Effect.succeed(undefined),
        });

        yield* initializeMcp().pipe(Effect.provide(mockLayer));

        expect(mcpServers$()).toEqual(mockServers);
        expect(mcpAllTools$()).toEqual(mockTools);
      }),
    );

    itEffect("initializeMcp 失败时 prior state 保持不变", () =>
      Effect.gen(function* () {
        // Pre-populate signals with existing data
        const existingServers: McpServerInfo[] = [
          {
            config: { name: "existing-server", command: "npx", args: [], enabled: true },
            status: { kind: "connected", toolCount: 1 },
            tools: [],
          },
        ];
        const existingTools: McpToolEntry[] = [
          {
            serverName: "existing-server",
            agentName: "mcp_existing-server_tool1",
            toolName: "tool1",
            description: "Existing tool",
            inputSchema: {},
          },
        ];

        // First, set up initial state with a success layer
        const initialLayer = Layer.succeed(McpService, {
          listServers: () => Effect.succeed(existingServers),
          getTools: () => Effect.succeed([]),
          getAllTools: () => Effect.succeed(existingTools),
          enable: () => Effect.succeed(undefined),
          restart: () => Effect.succeed(undefined),
          callTool: () => Effect.succeed({ content: [] }),
          openConfigDir: () => Effect.succeed(undefined),
        });

        yield* initializeMcp().pipe(Effect.provide(initialLayer));

        expect(mcpServers$()).toEqual(existingServers);
        expect(mcpAllTools$()).toEqual(existingTools);

        // Now simulate failure
        const failingLayer = Layer.succeed(McpService, {
          listServers: () => Effect.fail(new Unknown({ message: "MCP service unavailable" })),
          getTools: () => Effect.succeed([]),
          getAllTools: () => Effect.succeed([]),
          enable: () => Effect.succeed(undefined),
          restart: () => Effect.succeed(undefined),
          callTool: () => Effect.succeed({ content: [] }),
          openConfigDir: () => Effect.succeed(undefined),
        });

        const priorServers = mcpServers$();
        const priorTools = mcpAllTools$();

        yield* initializeMcp().pipe(Effect.provide(failingLayer));

        // State should remain unchanged
        expect(mcpServers$()).toBe(priorServers);
        expect(mcpAllTools$()).toBe(priorTools);
      }),
    );

    itEffect("initializeMcp 返回的 Effect<void, AppError> 兼容 registry descriptor", () =>
      Effect.gen(function* () {
        const program = initializeMcp();
        // Effect should be a valid Effect instance
        expect(program).toBeDefined();
        expect(typeof program).toBe("object");
        // Should be runnable (has pipe method like all Effects)
        expect(program).toHaveProperty("pipe");

        // Verify it can be provided with a layer and runs
        const mockLayer = Layer.succeed(McpService, {
          listServers: () => Effect.succeed([]),
          getTools: () => Effect.succeed([]),
          getAllTools: () => Effect.succeed([]),
          enable: () => Effect.succeed(undefined),
          restart: () => Effect.succeed(undefined),
          callTool: () => Effect.succeed({ content: [] }),
          openConfigDir: () => Effect.succeed(undefined),
        });

        const result = yield* program.pipe(Effect.provide(mockLayer), Effect.exit);
        expect(result._tag).toBe("Success");
        // Compile-time proof: success value must be void (undefined)
        if (result._tag === "Success") {
          expect(result.value).toBeUndefined();
        }
      }),
    );
  });
});
