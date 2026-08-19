import { describe, expect, beforeEach } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { Effect, Layer } from "effect";
import { it as itEffect } from "@effect/vitest";
import { McpSettingsTab } from "@codeman-frontend/features/mcp/components/settings-tab";
import { initializeMcp, _resetMcpStoreForTest } from "@codeman-frontend/features/mcp/stores/store";
import { McpApi } from "@codeman-frontend/shared/apis";
import type { McpServerInfo, McpToolEntry } from "@codeman-frontend/shared/lib/types";

const mockServer: McpServerInfo = {
  config: { name: "context7", command: "npx", args: ["-y", "@upstash/context7-mcp"], enabled: true },
  status: { kind: "connected", toolCount: 2 },
  tools: [
    { name: "resolve-library-id", description: "Resolves a package name", inputSchema: {} },
    { name: "query-docs", description: "Retrieves documentation", inputSchema: {} },
  ],
};

// 长描述：复现 "长文本撑爆布局" 的回归
const LONG_DESCRIPTION = "x".repeat(500);

const mockTools: McpToolEntry[] = [
  { serverName: "context7", agentName: "mcp_context7", toolName: "resolve-library-id", description: "Resolves a package name", inputSchema: {} },
  { serverName: "context7", agentName: "mcp_context7", toolName: "query-docs", description: LONG_DESCRIPTION, inputSchema: {} },
];

function mockMcpLayer() {
  return Layer.succeed(McpApi, {
    listServers: () => Effect.succeed([mockServer]),
    getAllTools: () => Effect.succeed(mockTools),
    getTools: () => Effect.succeed(mockServer.tools),
    enable: () => Effect.succeed(undefined),
    restart: () => Effect.succeed(undefined),
    callTool: () => Effect.succeed({ content: [] }),
    openConfigDir: () => Effect.succeed(undefined),
  });
}

describe("McpSettingsTab — 卡片布局回归", () => {
  beforeEach(() => {
    _resetMcpStoreForTest();
  });

  itEffect("ServerRow 渲染 Restart/Disable 按钮", () =>
    Effect.gen(function* () {
      yield* initializeMcp().pipe(Effect.provide(mockMcpLayer()));
      render(() => <McpSettingsTab />);
      expect(screen.getByLabelText("Restart context7")).toBeTruthy();
      expect(screen.getByLabelText("Disable context7")).toBeTruthy();
    }),
  );

  itEffect("Available Tools 渲染为卡片（li 带圆角边框）", () =>
    Effect.gen(function* () {
      yield* initializeMcp().pipe(Effect.provide(mockMcpLayer()));
      render(() => <McpSettingsTab />);
      const cards = document.querySelectorAll('[data-testid="mcp-tools-list"] li');
      expect(cards.length).toBe(2);
      for (const card of cards) {
        expect(card.classList.contains("rounded-lg")).toBe(true);
        expect(card.classList.contains("border")).toBe(true);
      }
    }),
  );

  itEffect("长描述完整显示，不 truncate 不截断", () =>
    Effect.gen(function* () {
      yield* initializeMcp().pipe(Effect.provide(mockMcpLayer()));
      render(() => <McpSettingsTab />);
      const p = screen.getByText(LONG_DESCRIPTION);
      expect(p.classList.contains("truncate")).toBe(false);
      expect(p.classList.contains("break-words")).toBe(true);
      expect(p.textContent).toBe(LONG_DESCRIPTION);
    }),
  );
});
